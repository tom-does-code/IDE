const vscode = require("vscode");
const {
  projectEnv,
  databaseSummary,
  isDatabaseMutation,
} = require("./environment-core");
exports.confirmDatabaseMutation = async (args, root) => {
  if (!isDatabaseMutation(args)) return true;
  const info = databaseSummary(projectEnv(root.uri.fsPath));
  const description = `${root.name}: ${args.slice(1).join(" ")}\n.env: ${info.environment}, ${info.host}/${info.database}\nPHP configuration, environment variables and command options can override this target.`;
  if (
    (await vscode.window.showWarningMessage(
      description,
      { modal: true },
      "Review and continue",
    )) !== "Review and continue"
  )
    return false;
  const expected = `${root.name}/${info.host}`;
  return (
    (await vscode.window.showInputBox({
      title: "Confirm database write",
      prompt: `Verify the actual database target, then type ${expected} to authorize this operation.`,
      ignoreFocusOut: true,
    })) === expected
  );
};
exports.activate = (context) => {
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99,
  );
  const refresh = () => {
    const editor = vscode.window.activeTextEditor;
    const root =
      (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) ||
      vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      status.hide();
      return;
    }
    const info = databaseSummary(projectEnv(root.uri.fsPath));
    status.text = `$(server-environment) ${info.environment} · DB ${info.host}`;
    status.tooltip = `${root.name} — values from .env, not a verified runtime connection. PHP configuration and process environment may override these values.`;
    status.command = "forge.env";
    status.show();
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/.env");
  context.subscriptions.push(
    status,
    watcher,
    watcher.onDidChange(refresh),
    watcher.onDidCreate(refresh),
    watcher.onDidDelete(refresh),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
  );
  refresh();
};
