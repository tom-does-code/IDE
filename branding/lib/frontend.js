const { ContainerModule } = require("../../desktop/node_modules/inversify");
const { Widget } = require("../../desktop/node_modules/@lumino/widgets");
const {
  FrontendApplicationContribution,
} = require("../../desktop/node_modules/@theia/core/lib/browser/frontend-application-contribution");
const {
  CommandRegistry,
} = require("../../desktop/node_modules/@theia/core/lib/common/command");
const {
  MenuContribution,
  MAIN_MENU_BAR,
} = require("../../desktop/node_modules/@theia/core/lib/common/menu");
const {
  StatusBar,
  StatusBarAlignment,
} = require("../../desktop/node_modules/@theia/core/lib/browser/status-bar/status-bar-types");
const monaco = require("../../desktop/node_modules/@theia/monaco-editor-core");
require("./style.css");
module.exports = new ContainerModule((bind) => {
  bind(FrontendApplicationContribution)
    .toDynamicValue((ctx) => ({
      onStart(app) {
        const commands = ctx.container.get(CommandRegistry);
        const windows = ctx.container.get(
          require("../../desktop/node_modules/@theia/core/lib/browser/secondary-window-handler")
            .SecondaryWindowHandler,
        );
        commands.registerCommand(
          { id: "forge.restoreEditors", label: "Bring All Editors Back" },
          {
            execute: async () => {
              for (const w of [...windows.widgets])
                await windows.moveWidgetToMainWindow(w);
            },
          },
        );
        commands.registerCommand(
          { id: "forge.windowState" },
          {
            execute: () =>
              windows.widgets.map((w) => ({
                id: w.id,
                detached: w.node.ownerDocument !== document,
                editor: !!w.node.querySelector(".monaco-editor"),
              })),
          },
        );
        if (!commands.getCommand("vscode.executeCodeLensProvider"))
          commands.registerCommand(
            { id: "vscode.executeCodeLensProvider" },
            {
              execute: (resource, count) =>
                commands.executeCommand(
                  "_executeCodeLensProvider",
                  monaco.Uri.from(resource),
                  count,
                ),
            },
          );
        const widget = new Widget();
        widget.id = "forge-main-toolbar";
        widget.addClass("forge-main-toolbar");
        widget.node.innerHTML =
          '<div class="forge-wordmark"><b>F</b><span>FORGE <em>PHP</em></span></div><div class="forge-toolbar-divider"></div><button data-command="forge.home" class="forge-project-button" title="Project Workbench">Project ▾</button><button data-command="workbench.action.openRecent" class="forge-subtle" title="Recent projects">Recent</button><div class="forge-toolbar-divider"></div><select aria-label="Run configuration"><option value="forge.serve">CodeIgniter · Development</option><option value="forge.test">PHPUnit · All tests</option><option value="forge.quality">Project · Quality checks</option></select><button class="forge-run" title="Run selected configuration (Shift+F10)" data-run>▶</button><button data-command="forge.debug" title="Debug CodeIgniter (Shift+F9)">◇ Debug</button><button data-command="forge.stop" class="forge-stop" title="Stop Forge server or debugging">■</button><div class="forge-toolbar-divider"></div><button data-command="forge.tools">Tools ▾</button><button data-command="forge.docs">Documentation</button><div class="forge-toolbar-spacer"></div><button data-command="forge.theme" title="Switch color theme">◐ Theme</button><button data-command="workbench.action.openSettings" title="Settings">⚙</button>';
        for (const b of widget.node.querySelectorAll("[data-command]"))
          b.addEventListener("click", () =>
            commands.executeCommand(b.dataset.command).catch(console.error),
          );
        widget.node
          .querySelector("[data-run]")
          .addEventListener("click", () =>
            commands
              .executeCommand(widget.node.querySelector("select").value)
              .catch(console.error),
          );
        app.shell.addWidget(widget, { area: "top", rank: 1000 });
        const status = ctx.container.get(StatusBar);
        for (const [id, text, command, priority] of [
          [
            "terminal",
            "$(terminal) Terminal",
            "workbench.action.terminal.toggleTerminal",
            1000,
          ],
          [
            "problems",
            "$(warning) Problems",
            "workbench.actions.view.problems",
            990,
          ],
          ["http", "$(globe) HTTP Client", "forge.http", 960],
        ])
          status.setElement("forge-tool-" + id, {
            text,
            command,
            alignment: StatusBarAlignment.LEFT,
            priority,
            className: "forge-bottom-tool",
            tooltip: text.replace(/\$\([^)]+\)/g, "").trim(),
          });
        app.shell.onDidAddWidget((w) => {
          if (w.id === "files") {
            w.title.label = "Project";
            w.title.caption = "Project files";
          }
        });
      },
    }))
    .inSingletonScope();
  bind(MenuContribution).toConstantValue({
    registerMenus(menus) {
      menus.registerMenuAction([...MAIN_MENU_BAR, "9_help"], {
        commandId: "forge.help",
        label: "Forge Feature Guide",
        order: "0",
      });
      const menu = [...MAIN_MENU_BAR, "5_forge"];
      menus.registerSubmenu(menu, "Forge");
      for (const [commandId, label] of [
        ["forge.help", "Help and Feature Guide"],
        ["forge.home", "Project Workbench"],
        ["forge.phpstan", "Analyze with PHPStan"],
        ["forge.setupPHPStan", "Set Up PHPStan"],
        ["forge.databaseFromEnv", "Database from .env"],
        ["forge.controllerRoutes", "Routes for Controller Method"],
        ["extract-widget", "Move Editor to New Window"],
        ["forge.restoreEditors", "Bring All Editors Back"],
        ["forge.snapshot", "Save Local Snapshot"],
        ["forge.fileHistory", "Compare File History"],
        ["forge.bookmarks", "Bookmarks"],
        ["forge.newProject", "New CodeIgniter Project…"],
        ["forge.configure", "Configure Project"],
        ["forge.routes", "Route Inspector"],
        ["forge.http", "HTTP Client"],
        ["forge.theme", "Switch Theme…"],
        ["forge.generate", "Generate Class…"],
        ["forge.composer", "Composer…"],
        ["forge.quality", "Run Quality Checks"],
        ["forge.health", "Toolchain Diagnostics"],
      ])
        menus.registerMenuAction(menu, { commandId, label });
    },
  });
});
