import * as vscode from 'vscode';
import { NIMBridge } from './nimBridge';

// ─── Panel ────────────────────────────────────────────────────────────────────

export class ChatPanel implements vscode.Disposable {
  static readonly VIEW_TYPE = 'robocodeChat';
  private static instance: ChatPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly nim: NIMBridge;
  private disposables: vscode.Disposable[] = [];

  // ── Factory ─────────────────────────────────────────────────────────────────

  static createOrReveal(extensionUri: vscode.Uri, nim: NIMBridge): ChatPanel {
    if (ChatPanel.instance) {
      ChatPanel.instance.panel.reveal(vscode.ViewColumn.Beside);
      return ChatPanel.instance;
    }
    const panel = vscode.window.createWebviewPanel(
      ChatPanel.VIEW_TYPE,
      'RoboCode AI',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );
    ChatPanel.instance = new ChatPanel(panel, nim);
    return ChatPanel.instance;
  }

  // ── Constructor ─────────────────────────────────────────────────────────────

  private constructor(panel: vscode.WebviewPanel, nim: NIMBridge) {
    this.panel = panel;
    this.nim = nim;

    this.panel.webview.html = buildHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  // ── Message routing ─────────────────────────────────────────────────────────

  private async handleMessage(msg: {
    command: string;
    text?: string;
    context?: string;
  }) {
    if (msg.command !== 'query') return;
    this.post({ type: 'thinking' });

    try {
      const response = await this.nim.query(msg.text ?? '', msg.context);
      this.post({ type: 'response', content: response.content, usage: response.usage });
    } catch (err: unknown) {
      this.post({ type: 'error', message: String(err) });
    }
  }

  // ── Public methods called by extension.ts ────────────────────────────────────

  sendErrorFix(errorText: string, aiResponse: string) {
    this.post({ type: 'errorFix', error: errorText, response: aiResponse });
  }

  sendCodeAnswer(question: string, code: string, aiResponse: string) {
    this.post({ type: 'codeAnswer', question, code, response: aiResponse });
  }

  sendThinking() {
    this.post({ type: 'thinking' });
  }

  sendError(message: string) {
    this.post({ type: 'error', message });
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private post(data: object) {
    this.panel.webview.postMessage(data);
  }

  dispose() {
    ChatPanel.instance = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

// ─── Webview HTML ─────────────────────────────────────────────────────────────
// NOTE: No backtick characters inside this function body — they would terminate
// the caller's template literal if this were inlined. Backticks in JS regexes
// are written as \x60 (hex escape for code point 96).

function buildHtml(): string {
  const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --rc-bg:       var(--vscode-editor-background);
      --rc-fg:       var(--vscode-editor-foreground);
      --rc-border:   var(--vscode-panel-border);
      --rc-input-bg: var(--vscode-input-background);
      --rc-input-fg: var(--vscode-input-foreground);
      --rc-btn-bg:   var(--vscode-button-background);
      --rc-btn-fg:   var(--vscode-button-foreground);
      --rc-code-bg:  var(--vscode-textCodeBlock-background);
      --rc-user-bg:  var(--vscode-textBlockQuote-background);
      --rc-accent:   #4ec9b0;
      --rc-error:    #f14c4c;
      --rc-font:     var(--vscode-font-family, system-ui, sans-serif);
      --rc-mono:     var(--vscode-editor-font-family, 'Courier New', monospace);
    }

    body {
      background: var(--rc-bg); color: var(--rc-fg);
      font-family: var(--rc-font); font-size: 13px;
      display: flex; flex-direction: column; height: 100vh; overflow: hidden;
    }

    #hdr {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 12px; border-bottom: 1px solid var(--rc-border); flex-shrink: 0;
    }
    #hdr-title { font-weight: 600; font-size: 12px; letter-spacing: .5px; text-transform: uppercase; opacity: .75; }
    #hdr-model { margin-left: auto; font-size: 10px; opacity: .4; }

    #msgs {
      flex: 1; overflow-y: auto; padding: 14px 12px;
      display: flex; flex-direction: column; gap: 12px;
    }

    .msg { line-height: 1.55; border-radius: 3px; padding: 8px 12px; word-break: break-word; }
    .msg.user    { background: var(--rc-user-bg); border-left: 3px solid var(--vscode-activityBarBadge-background, #007acc); align-self: flex-end; max-width: 90%; }
    .msg.assistant { border-left: 3px solid var(--rc-accent); }
    .msg.error-msg { border-left: 3px solid var(--rc-error); background: rgba(241,76,76,.08); }
    .msg.thinking  { opacity: .5; font-style: italic; font-size: 12px; border-left: 3px solid var(--rc-border); }

    .msg-label { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; opacity: .5; margin-bottom: 5px; }

    pre {
      background: var(--rc-code-bg); border-radius: 3px; padding: 8px 10px;
      overflow-x: auto; font-family: var(--rc-mono); font-size: 12px;
      line-height: 1.4; margin: 6px 0; position: relative;
    }
    .copy-btn {
      position: absolute; top: 5px; right: 6px; font-size: 10px; padding: 2px 7px;
      background: var(--rc-btn-bg); color: var(--rc-btn-fg);
      border: none; border-radius: 2px; cursor: pointer; opacity: .7;
    }
    .copy-btn:hover { opacity: 1; }
    code { font-family: var(--rc-mono); font-size: 12px; }
    p code { background: var(--rc-code-bg); padding: 1px 4px; border-radius: 2px; }

    .usage { font-size: 10px; opacity: .35; margin-top: 6px; text-align: right; }

    #input-row {
      display: flex; gap: 6px; padding: 8px 10px;
      border-top: 1px solid var(--rc-border); flex-shrink: 0; align-items: flex-end;
    }
    #txt {
      flex: 1; background: var(--rc-input-bg); color: var(--rc-input-fg);
      border: 1px solid var(--rc-border); border-radius: 3px; padding: 7px 10px;
      font-family: var(--rc-font); font-size: 13px; resize: none;
      min-height: 36px; max-height: 140px; line-height: 1.4; overflow-y: auto;
    }
    #txt:focus { outline: 1px solid var(--vscode-focusBorder, var(--rc-accent)); }
    #btn {
      background: var(--rc-btn-bg); color: var(--rc-btn-fg);
      border: none; border-radius: 3px; padding: 7px 14px;
      font-size: 13px; cursor: pointer; white-space: nowrap; line-height: 1.4;
    }
    #btn:disabled { opacity: .45; cursor: not-allowed; }
    #btn:hover:not(:disabled) { filter: brightness(1.12); }
    #hint { font-size: 10px; opacity: .3; padding: 0 12px 6px; flex-shrink: 0; }
  `;

  // JavaScript for the webview — no backticks in this string.
  // Fenced code regex uses \x60 (backtick) and \x60{3} instead of literal ```.
  const js = `
    const vscode = acquireVsCodeApi();
    const msgs   = document.getElementById('msgs');
    const txt    = document.getElementById('txt');
    const btn    = document.getElementById('btn');
    const modelLabel = document.getElementById('hdr-model');

    function esc(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // Regex that matches fenced code blocks without using literal backticks.
    // \\x60 = backtick (char code 96).
    const FENCE_RE = new RegExp('\\\\x60{3}(\\\\w*)\\\\n?([\\\\s\\\\S]*?)\\\\x60{3}', 'g');
    const INLINE_RE = new RegExp('\\\\x60([^\\\\x60\\\\n]+)\\\\x60', 'g');

    let copyCounter = 0;

    function render(md) {
      // Fenced code blocks
      md = md.replace(FENCE_RE, function(_m, lang, code) {
        copyCounter++;
        var id = 'rc-code-' + copyCounter;
        return '<pre><button class="copy-btn" data-target="' + id + '">Copy</button>' +
               '<code id="' + id + '">' + esc(code.replace(/^\\n|\\n$/g,'')) + '</code></pre>';
      });
      // Inline code
      md = md.replace(INLINE_RE, function(_m, code) {
        return '<code>' + esc(code) + '</code>';
      });
      // Bold
      md = md.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      // Line breaks
      md = md.replace(/\\n/g, '<br>');
      return md;
    }

    // Event delegation for copy buttons (avoids inline onclick)
    msgs.addEventListener('click', function(e) {
      var copyBtn = e.target.closest('.copy-btn');
      if (!copyBtn) return;
      var targetId = copyBtn.dataset.target;
      var codeEl = document.getElementById(targetId);
      if (!codeEl) return;
      navigator.clipboard.writeText(codeEl.textContent || '').then(function() {
        copyBtn.textContent = 'Copied!';
        setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
      });
    });

    function addMsg(role, html, extra) {
      var div = document.createElement('div');
      div.className = 'msg ' + role;
      var labelText = role === 'user' ? 'You'
                    : role === 'assistant' ? 'RoboCode'
                    : role === 'error-msg' ? 'Error'
                    : '';
      div.innerHTML = '<div class="msg-label">' + labelText + '</div>' + html;
      if (extra) {
        var u = document.createElement('div');
        u.className = 'usage';
        u.textContent = extra;
        div.appendChild(u);
      }
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
      return div;
    }

    function removeThinking() {
      msgs.querySelectorAll('.thinking').forEach(function(el) { el.remove(); });
    }

    function send() {
      var text = txt.value.trim();
      if (!text) return;
      addMsg('user', esc(text));
      txt.value = '';
      txt.style.height = '';
      btn.disabled = true;
      addMsg('thinking', 'Thinking\u2026');
      vscode.postMessage({ command: 'query', text: text });
    }

    btn.addEventListener('click', send);
    txt.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    txt.addEventListener('input', function() {
      txt.style.height = 'auto';
      txt.style.height = Math.min(txt.scrollHeight, 140) + 'px';
    });

    window.addEventListener('message', function(event) {
      var data = event.data;
      switch (data.type) {
        case 'thinking':
          removeThinking();
          addMsg('thinking', 'Analysing\u2026');
          btn.disabled = true;
          break;
        case 'response':
          removeThinking();
          btn.disabled = false;
          if (data.model) modelLabel.textContent = data.model.split('/').pop() || '';
          var usage = data.usage
            ? data.usage.prompt_tokens + ' in / ' + data.usage.completion_tokens + ' out'
            : '';
          addMsg('assistant', render(data.content), usage);
          break;
        case 'error':
          removeThinking();
          btn.disabled = false;
          addMsg('error-msg', '\u26a0 ' + esc(data.message));
          break;
        case 'errorFix':
          removeThinking();
          btn.disabled = false;
          addMsg('assistant',
            '<strong>Detected error:</strong><pre><code>' + esc(data.error) + '</code></pre>' +
            '<strong>AI fix:</strong><br>' + render(data.response)
          );
          break;
        case 'codeAnswer':
          removeThinking();
          btn.disabled = false;
          addMsg('assistant', render(data.response));
          break;
      }
    });
  `;

  return '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>RoboCode AI</title>\n' +
    '<style>' + css + '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div id="hdr">\n' +
    '  <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--rc-accent)">' +
    '<path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.851-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>' +
    '</svg>\n' +
    '  <span id="hdr-title">RoboCode AI</span>\n' +
    '  <span id="hdr-model">\u2014</span>\n' +
    '</div>\n' +
    '<div id="msgs">\n' +
    '  <div class="msg assistant">\n' +
    '    <div class="msg-label">RoboCode</div>\n' +
    '    Ready. Highlight code and press <strong>Ctrl+M</strong> to ask, or type below.<br>\n' +
    '    Build errors in your terminal are captured automatically \u2014 click the status bar item to fix.\n' +
    '  </div>\n' +
    '</div>\n' +
    '<div id="input-row">\n' +
    '  <textarea id="txt" rows="1" placeholder="Ask about your ROS\u00a02 code\u2026"></textarea>\n' +
    '  <button id="btn">Send</button>\n' +
    '</div>\n' +
    '<div id="hint">Shift+Enter for new line \u00b7 Enter to send</div>\n' +
    '<script>' + js + '</script>\n' +
    '</body>\n' +
    '</html>';
}
