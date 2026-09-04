import * as vscode from 'vscode';
import { ContextEngine } from './contextEngine';
import { NIMBridge } from './nimBridge';
import { ErrorSniffer } from './errorSniffer';
import { ChatPanel } from './chatPanel';

// ─── Activate ─────────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Core objects
  const ctxEngine = new ContextEngine();
  const nim       = new NIMBridge(ctxEngine);
  const sniffer   = new ErrorSniffer();

  // 2. Kick off workspace analysis in background (non-blocking)
  kickoffAnalysis(ctxEngine);

  // 3. Start error sniffer
  sniffer.activate(context);
  context.subscriptions.push(sniffer);

  // 4. Register commands

  // ── robocode.askAI ──────────────────────────────────────────────────────────
  // Triggered by Ctrl+M on selected code, or from context menu / command palette.
  context.subscriptions.push(
    vscode.commands.registerCommand('robocode.askAI', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('RoboCode: Open a source file first.');
        return;
      }

      const selectedCode = editor.document.getText(editor.selection).trim();
      const language     = editor.document.languageId;

      const question = await vscode.window.showInputBox({
        title: 'RoboCode AI',
        prompt: selectedCode
          ? 'What do you want to know about the selected code?'
          : 'Ask RoboCode anything about your ROS 2 project',
        placeHolder: selectedCode
          ? 'Explain this function / Fix this / Optimise this…'
          : 'Why is my subscriber not receiving messages?',
      });

      if (!question) return;

      const panel = ChatPanel.createOrReveal(context.extensionUri, nim);
      panel.sendThinking();

      try {
        const response = selectedCode
          ? await nim.queryCode(selectedCode, question, language)
          : await nim.query(question);

        panel.sendCodeAnswer(question, selectedCode, response.content);
      } catch (err: unknown) {
        panel.sendError(String(err));
        vscode.window.showErrorMessage(`RoboCode: ${String(err)}`);
      }
    })
  );

  // ── robocode.fixError ───────────────────────────────────────────────────────
  // Triggered automatically by sniffer notification OR manually by user.
  context.subscriptions.push(
    vscode.commands.registerCommand('robocode.fixError', async () => {
      const error = sniffer.getLastError();

      if (!error) {
        vscode.window.showInformationMessage(
          'RoboCode: No build error captured yet. Run colcon/cmake first.'
        );
        return;
      }

      const panel = ChatPanel.createOrReveal(context.extensionUri, nim);
      panel.sendThinking();
      sniffer.clearError();

      // Attach the active file as code context if it's a C++/Python/CMake file
      const activeCode = getActiveFileCode();

      try {
        const response = await nim.fixError(error, activeCode);
        panel.sendErrorFix(error, response.content);
      } catch (err: unknown) {
        panel.sendError(String(err));
        vscode.window.showErrorMessage(`RoboCode: ${String(err)}`);
      }
    })
  );

  // ── robocode.openChat ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('robocode.openChat', () => {
      ChatPanel.createOrReveal(context.extensionUri, nim);
    })
  );

  // ── robocode.showContext ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('robocode.showContext', async () => {
      await ctxEngine.analyzeWorkspace();
      const summary = ctxEngine.buildContextSummary();
      vscode.window.showInformationMessage(summary, { modal: true });
    })
  );
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export function deactivate(): void {
  // ErrorSniffer is registered to context.subscriptions, disposed automatically.
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function kickoffAnalysis(engine: ContextEngine): Promise<void> {
  try {
    const ctx = await engine.analyzeWorkspace();
    if (ctx.isROS2Workspace) {
      const distro = ctx.rosDistro ? ` (${ctx.rosDistro})` : '';
      vscode.window.setStatusBarMessage(
        `⚙ RoboCode: ROS 2${distro} — ${ctx.packages.length} package(s) detected`,
        6000
      );
    }
  } catch {
    // Non-fatal — workspace analysis failing doesn't break the extension.
  }
}

function getActiveFileCode(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  const lang = editor.document.languageId;
  if (!['cpp', 'python', 'cmake', 'c'].includes(lang)) return undefined;

  // Send at most 3 000 chars to avoid bloating the prompt.
  return editor.document.getText().slice(0, 3000);
}
