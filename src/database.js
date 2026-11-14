const vscode = require("vscode");
const { projectEnv } = require("./environment-core");
const { connectionFromEnv } = require("./database-core");
exports.activate = (context, api) => {
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.databaseFromEnv", async () => {
      try {
        api.trust();
        const root = await api.folder(true);
        if (!root) return;
        const connection = connectionFromEnv(
          projectEnv(root.uri.fsPath),
          root.name,
        );
        const extension = vscode.extensions.getExtension("mtxr.sqltools");
        if (!extension) throw Error("SQLTools is not installed.");
        await extension.activate();
        const config = vscode.workspace.getConfiguration("sqltools", root.uri);
        const connections =
          config.inspect("connections")?.workspaceFolderValue || [];
        await config.update(
          "connections",
          [
            ...connections.filter((c) => c.name !== connection.name),
            connection,
          ],
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
        await vscode.commands.executeCommand(
          "workbench.view.extension.sqltools",
        );
        vscode.window.showInformationMessage(
          "Database details loaded from .env. SQLTools will ask for the password when connecting; Forge does not copy it into settings. Re-run after changing .env.",
        );
      } catch (error) {
        vscode.window.showErrorMessage(error.message);
      }
    }),
  );
};
