import * as vscode from 'vscode';

// ─── Error pattern library (ROS 2 / colcon / cmake / gcc / Python) ────────────

const ERROR_PATTERNS: RegExp[] = [
  // colcon
  /\[colcon\].*failed/i,
  /--- stderr: /,
  /Finished <<< .+ \[FAILED\]/,
  // CMake
  /CMake Error(?: at| in)?/,
  /CMakeLists.txt:\d+/,
  // GCC / Clang
  /error: /,
  /undefined reference to/,
  /cannot find -l/,
  /ld returned 1 exit status/,
  // Python / rclpy
  /Traceback \(most recent call last\)/,
  /ModuleNotFoundError/,
  /ImportError/,
  /AttributeError/,
  /rclpy\.exceptions\./,
  // ROS 2 launch
  /\[ERROR\] \[/,
  /\[FATAL\]/,
  /process has died/i,
];

const ANSI_RE = /\x1b\[[0-9;]*[mGKHF]/g;
const BUFFER_MAX = 12_000; // chars per terminal rolling buffer

// ─── Sniffer ─────────────────────────────────────────────────────────────────

export class ErrorSniffer implements vscode.Disposable {
  private buffers = new Map<vscode.Terminal, string>();
  private lastError = '';
  private statusBar: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50
    );
    this.statusBar.command = 'robocode.fixError';
    this.disposables.push(this.statusBar);
  }

  activate(context: vscode.ExtensionContext) {
    const cfg = vscode.workspace.getConfiguration('robocode');
    if (!cfg.get<boolean>('errorSnifferEnabled', true)) return;

    // onDidWriteTerminalData — available since VS Code 1.56 (stable in 1.87+)
    // Cast through any to handle environments where it may not yet be typed.
    const terminalDataEvent = (vscode.window as any).onDidWriteTerminalData;

    if (typeof terminalDataEvent === 'function') {
      const sub = terminalDataEvent(
        (e: { terminal: vscode.Terminal; data: string }) => {
          this.onData(e.terminal, e.data);
        }
      );
      this.disposables.push(sub);
      context.subscriptions.push(sub);
    } else {
      // Graceful degradation: sniffer unavailable, manual fix command still works.
      console.warn('RoboCode: onDidWriteTerminalData not available — error sniffer disabled.');
    }

    const closeSub = vscode.window.onDidCloseTerminal((t) => this.buffers.delete(t));
    this.disposables.push(closeSub);
    context.subscriptions.push(closeSub);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private onData(terminal: vscode.Terminal, raw: string) {
    const clean = raw.replace(ANSI_RE, '');

    // Update rolling buffer
    const prev = this.buffers.get(terminal) ?? '';
    const merged = prev + clean;
    this.buffers.set(
      terminal,
      merged.length > BUFFER_MAX ? merged.slice(-BUFFER_MAX) : merged
    );

    // Fast path: skip if no error signal in this chunk
    if (!ERROR_PATTERNS.some(p => p.test(clean))) return;

    // Debounce: colcon spits many error lines in quick succession
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.onErrorDetected(terminal);
    }, 600);
  }

  private onErrorDetected(terminal: vscode.Terminal) {
    const buffer = this.buffers.get(terminal) ?? '';
    this.lastError = this.extractErrorBlock(buffer);

    if (!this.lastError) return;

    // Status bar
    this.statusBar.text = '$(bug) Build error — click to fix with AI';
    this.statusBar.tooltip = 'RoboCode detected a build error. Click to send to AI for analysis.';
    this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.statusBar.show();

    // Notification (non-modal, won't block)
    vscode.window
      .showErrorMessage('RoboCode: Build error detected.', 'Fix with AI', 'Dismiss')
      .then((choice) => {
        if (choice === 'Fix with AI') {
          vscode.commands.executeCommand('robocode.fixError');
        } else {
          this.clearError();
        }
      });
  }

  /**
   * Extract the most relevant ~30 lines around the first error line.
   * Colcon output is noisy — we want the actual compiler/linker message.
   */
  private extractErrorBlock(buffer: string): string {
    const lines = buffer.split('\n');
    let firstErrorIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (ERROR_PATTERNS.some(p => p.test(lines[i]))) {
        firstErrorIdx = i;
        break;
      }
    }

    if (firstErrorIdx === -1) return buffer.slice(-2000);

    const start = Math.max(0, firstErrorIdx - 3);
    const end = Math.min(lines.length, firstErrorIdx + 25);
    return lines.slice(start, end).join('\n');
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  getLastError(): string { return this.lastError; }

  clearError() {
    this.lastError = '';
    this.statusBar.hide();
  }

  dispose() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.disposables.forEach(d => d.dispose());
    this.buffers.clear();
  }
}
