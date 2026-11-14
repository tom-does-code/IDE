const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
function views(root) {
  const result = [];
  const visit = (dir, prefix = "") => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const rel = prefix + entry.name;
      if (entry.isDirectory()) visit(path.join(dir, entry.name), rel + "/");
      else if (entry.name.endsWith(".php"))
        result.push({
          name: rel.slice(0, -4),
          file: path.join(dir, entry.name),
        });
    }
  };
  visit(path.join(root, "app/Views"));
  return result;
}
exports.activate = (context) => {
  const selector = { language: "php", scheme: "file" };
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        provideCompletionItems(document, position) {
          const root = vscode.workspace.getWorkspaceFolder(document.uri);
          if (!root) return [];
          const prefix = document
            .lineAt(position)
            .text.slice(0, position.character);
          const match = prefix.match(
            /(?:view|extend|include)\(\s*['"]([^'"]*)$/,
          );
          if (!match) return [];
          const start = position.translate(0, -match[1].length);
          return views(root.uri.fsPath).map((v) => {
            const item = new vscode.CompletionItem(
              v.name,
              vscode.CompletionItemKind.File,
            );
            item.detail = "CodeIgniter view";
            item.documentation = path.relative(root.uri.fsPath, v.file);
            item.range = new vscode.Range(start, position);
            return item;
          });
        },
      },
      "'",
      '"',
      "/",
    ),
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(selector, {
      provideDocumentLinks(document) {
        const root = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!root) return [];
        const source = document.getText(),
          result = [];
        const regex = /\b(?:view|extend|include)\(\s*(['"])([^'"\r\n]+)\1/g;
        let match;
        while ((match = regex.exec(source))) {
          const relative = match[2];
          const file = path.resolve(
            root.uri.fsPath,
            "app/Views",
            relative.replace(/\.php$/, "") + ".php",
          );
          const parent = path.resolve(root.uri.fsPath, "app/Views") + path.sep;
          if (!file.startsWith(parent) || !fs.existsSync(file)) continue;
          const start = match.index + match[0].indexOf(match[1]) + 1;
          const link = new vscode.DocumentLink(
            new vscode.Range(
              document.positionAt(start),
              document.positionAt(start + relative.length),
            ),
            vscode.Uri.file(file),
          );
          link.tooltip = "Open CodeIgniter view";
          result.push(link);
        }
        return result;
      },
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.relatedView", async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document) return;
      const root = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!root) return;
      const matches = [
        ...document
          .getText()
          .matchAll(/\b(?:view|extend|include)\(\s*['"]([^'"]+)['"]/g),
      ].map((m) => m[1]);
      let options = views(root.uri.fsPath);
      if (matches.length)
        options = options.filter((v) => matches.includes(v.name));
      const selected =
        options.length === 1
          ? options[0]
          : await vscode.window.showQuickPick(
              options.map((v) => ({ label: v.name, ...v })),
              { title: "Open CodeIgniter view" },
            );
      if (selected)
        await vscode.window.showTextDocument(vscode.Uri.file(selected.file));
      else if (!options.length)
        vscode.window.showInformationMessage("No views found in app/Views.");
    }),
  );
};
exports.views = views;
