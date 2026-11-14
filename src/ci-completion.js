const vscode = require("vscode");
const { candidates } = require("./ci-completion-core");
exports.activate = (context) => {
  const provider = {
    provideCompletionItems(document, position) {
      const root = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!root) return [];
      const prefix = document
        .lineAt(position)
        .text.slice(0, position.character);
      let kind, word;
      if (/(?:^|[\\/])\.env$/.test(document.uri.fsPath)) {
        if (prefix.includes("=")) return [];
        kind = "env";
        word = prefix.trim();
      } else {
        const call = prefix.match(
          /\b(model|config|service|lang)\(\s*['"]([^'"]*)$/,
        );
        if (call) {
          kind = call[1];
          word = call[2];
        } else {
          const rule = prefix.match(
            /['"]rules['"]\s*=>\s*['"](?:[^'"]*\|)?([\w]*)$/,
          );
          if (!rule) return [];
          kind = "rules";
          word = rule[1];
        }
      }
      return [...new Set(candidates(root.uri.fsPath, kind))].map((name) => {
        const item = new vscode.CompletionItem(
          name,
          vscode.CompletionItemKind.Value,
        );
        item.detail = "CodeIgniter " + kind;
        item.range = new vscode.Range(
          position.translate(0, -word.length),
          position,
        );
        return item;
      });
    },
  };
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [
        { language: "php", scheme: "file" },
        { scheme: "file", pattern: "**/.env" },
      ],
      provider,
      "'",
      '"',
      "|",
      ".",
    ),
  );
};
