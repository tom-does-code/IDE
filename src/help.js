const vscode = require("vscode");
const crypto = require("node:crypto");
const features = require("./help-content.json");
const manifest = require("./package.json");
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
exports.activate = (context) => {
  let panel;
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.help", () => {
      if (panel) {
        panel.reveal();
        return;
      }
      panel = vscode.window.createWebviewPanel(
        "forge.help",
        "Forge / Feature Guide",
        vscode.ViewColumn.One,
        { enableScripts: true, localResourceRoots: [] },
      );
      const nonce = crypto.randomBytes(16).toString("hex");
      const shortcuts = new Map(
        manifest.contributes.keybindings.map((b) => [b.command, b.key]),
      );
      const allowed = new Set(features.map((f) => f.command).filter(Boolean));
      panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'nonce-${nonce}';script-src 'nonce-${nonce}'"><style nonce="${nonce}">body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:14px/1.6 'Segoe UI',sans-serif}header{padding:32px 36px 20px;border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;background:var(--vscode-editor-background);z-index:1}h1{font-size:28px;margin:0}header p{margin:4px 0 16px;opacity:.7}input{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--vscode-input-border,#555);color:var(--vscode-input-foreground);background:var(--vscode-input-background);font:inherit}main{max-width:1050px;margin:auto;padding:24px 36px}article{border-bottom:1px solid var(--vscode-panel-border);padding:18px 0 26px}h2{font-size:20px;margin:4px 0}small{color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:1px}li{margin:7px 0}.note{border-left:3px solid var(--vscode-textLink-foreground);padding:6px 14px;color:var(--vscode-descriptionForeground)}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:8px 14px;font:inherit;cursor:pointer}table{width:100%;border-collapse:collapse}td{padding:7px;border-bottom:1px solid var(--vscode-panel-border)}kbd{font:12px monospace}#empty{display:none}</style></head><body><header><h1>Forge PHP · Feature Guide</h1><p>What each tool does, how to use it, and what to configure first.</p><input id="search" type="search" placeholder="Search features, shortcuts, setup or troubleshooting…" aria-label="Search the feature guide"></header><main><p id="empty">No matching features. Try a tool name such as HTTP, database or format.</p>${features.map((f) => `<article><small>${escape(f.section)}</small><h2>${escape(f.title)}</h2><p>${escape(f.description)}</p><ol>${f.steps.map((s) => `<li>${escape(s)}</li>`).join("")}</ol>${f.note ? `<p class="note">${escape(f.note)}</p>` : ""}${f.command ? `<button data-command="${escape(f.command)}">Open ${escape(manifest.contributes.commands.find((c) => c.command === f.command)?.title.replace(/^Forge: /, "") || f.title)}</button>` : ""}</article>`).join("")}<article><small>Reference</small><h2>Complete Forge command directory</h2><p>Press Ctrl+Shift+P and search any command below. Commands without a shortcut are available from the command palette.</p><table>${manifest.contributes.commands.map((c) => `<tr><td>${escape(c.title)}</td><td><kbd>${escape(shortcuts.get(c.command) || "Command palette")}</kbd></td></tr>`).join("")}</table></article></main><script nonce="${nonce}">const api=acquireVsCodeApi();document.querySelector('#search').oninput=e=>{let visible=0;for(const card of document.querySelectorAll('article')){card.hidden=!card.textContent.toLowerCase().includes(e.target.value.toLowerCase());if(!card.hidden)visible++;}document.querySelector('#empty').style.display=visible?'none':'block';};for(const button of document.querySelectorAll('button'))button.onclick=()=>api.postMessage({command:button.dataset.command});</script></body></html>`;
      panel.onDidDispose(() => {
        panel = undefined;
      });
      panel.webview.onDidReceiveMessage((message) => {
        if (allowed.has(message?.command))
          vscode.commands.executeCommand(message.command);
      });
    }),
  );
};
