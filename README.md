# Forge PHP

Launch **Forge PHP.exe** in this folder. Open your existing project with File → Open Folder. The launcher restores your last workspace and accepts a project folder as an argument.

Forge is a standalone application built on Eclipse Theia and Monaco. It does not launch or depend on a VS Code installation. The source and local build toolchain are included.

## Daily workflow

- **Run / Debug / Stop:** use the compact top toolbar. The development server binds to localhost. Run configuration selects the server, PHPUnit, or quality checks.
- **Tools:** HTTP requests, CodeIgniter routes, generators, Composer, tests, application logs, related views, database tools, and configuration.
- **Documentation:** searchable PHP and CodeIgniter topics open beside your code. Cached articles work offline; following uncached official links requires internet. Shift+F1 looks up the PHP function under the cursor.
- **Formatting:** real Prettier and its official PHP plugin are bundled. PHP, JS, TS, JSON, CSS, HTML, Markdown, and YAML format on save. Respects trusted project Prettier configuration, EditorConfig, and `.prettierignore`. A project's own editor settings can override user defaults. Ctrl+Alt+L formats manually.
- **Intelligence:** Intelephense supplies PHP completion, hover information, diagnostics, and navigation. Its premium features require your own licence. Forge adds CodeIgniter view completion, clickable view names, and Ctrl+Alt+V to open related views.
- **HTTP:** open or create `requests.http` through Tools. Click **Send Request** above a request or press Ctrl+Alt+Enter. The bundled REST Client supports variables, environments, authentication, request bodies, response history, and cURL export. The Welcome project includes working local GET/POST examples.
- **Tests:** Tools → Run tests; right-click a PHP test to run its file. Xdebug is available for stepping through PHP and tests.
- **Git:** commits, diffs, branches and staging in Source Control. SQLTools supplies MySQL/PostgreSQL connections; configure your own database credentials.
- **Themes:** Graphite, Abyss, Orchid, and Paper from the top Theme control.

## Shortcuts

| Action | Shortcut |
|---|---|
| Find a file | Ctrl+P |
| Command search | Ctrl+Shift+P |
| Format document | Ctrl+Alt+L |
| Go to definition | Ctrl+B |
| Find references | Alt+F7 |
| Related CodeIgniter view | Ctrl+Alt+V |
| PHP function documentation | Shift+F1 |
| Terminal | Alt+F12 |
| Run CodeIgniter | Shift+F10 |
| Debug CodeIgniter | Shift+F9 |
| Stop Forge server/debugger | Shift+F2 |
| Send HTTP request | Ctrl+Alt+Enter |

## Files and maintenance

- `src/`: Forge application extension, formatters, CI intelligence, documentation and tests.
- `branding/`: native workbench toolbar and theme-aware layout.
- `desktop/`: Theia application, Electron entry point, pinned dependency lockfile and build scripts.
- `plugins/`: installed language, Git, SQL, HTTP and other extensions from Open VSX.
- `tools/`: isolated PHP 8.4, Xdebug, Composer and Node. Your XAMPP installation is unchanged.
- `data/`: settings and workspace history. Preserve this directory when upgrading.
- `docs/cache/`: official reference pages cached with source URLs and timestamps.
- `projects/Welcome/`: runnable CodeIgniter playground with tests and HTTP examples.
- `work/`: build logs, verification reports and intermediate files.

Build: use the bundled Node on PATH, run `node scripts/sync-plugin.cjs`, `node scripts/prepare-platform.cjs`, then `npm run build` from `desktop`. Close Forge before rebuilding native binaries. Windows adaptations include drive discovery, FFmpeg inspection, and a Theia completion-coordinate fix. The dependency lockfiles and upstream licence files are retained.

This is a custom local IDE build, not a claim of full PhpStorm feature parity or production certification. Test it against your actual projects, deployment setup, database, and debugger paths before relying on it exclusively. Remote PHP/Docker interpreters need project-specific configuration. There is no automatic updater or signed public installer.

Documentation attribution: PHP Manual contributors (CC BY 3.0), https://www.php.net/manual/en/; CodeIgniter Foundation (MIT), https://codeigniter.com/user_guide/. Editor/framework and extension licences are retained in their installed packages.

## Desktop launch, multiple monitors, and navigation

Double-click **Forge PHP** on your Windows Desktop. The shortcut opens `Forge PHP.exe` and restores your workspace. Keep the `IDE` folder in place.

To use two monitors, open two files and drag one editor tab outside the main window. Move the detached window to the other monitor. You can also focus an editor and press **Ctrl+Alt+O**, or use **Forge > Move Editor to New Window**. **Forge > Bring All Editors Back** returns all detached editors. Keep the main IDE window open while using secondary windows.

- **Ctrl+Alt+B** toggles a bookmark at the current file and line.
- **Ctrl+Alt+J** searches project bookmarks.
- **Ctrl+Alt+Shift+H** compares a saved local snapshot against the current file.
- **Forge > Save Local Snapshot** creates a manual snapshot.

Local history automatically retains up to 20 versions per supported code file (maximum 512 KB each), with a limit of 500 recently saved files. It is stored locally in the Forge extension storage. It complements Git and backups; snapshots begin after this feature is enabled. Bookmark positions are stored line numbers and may need updating after large edits.

Secondary windows require the upstream Lumino patches: run `node_modules/.bin/theia-patch.cmd` before rebuilding if dependencies have been reinstalled.

## Feature guide and project tooling

Open **Help > Forge Feature Guide**, **Forge > Help and Feature Guide**, or press **Ctrl+Alt+F1**. The searchable guide covers every major workflow, setup steps, shortcuts, limitations, and a complete command directory.

Project PHP formatting now detects root PHP-CS-Fixer or PHPCS configuration and uses the project's Composer binary. It applies only formatter hunks fully inside changed lines by default; use `forge.formatChangedLinesOnly` to opt into whole-file formatting. Unconfigured projects retain Prettier.

Use **Forge > Set Up PHPStan** to install PHPStan plus the official CodeIgniter extension, then **Analyze with PHPStan** to populate Problems. Existing PHPStan configuration is preserved.

The environment status displays .env values, and Forge-owned migration/rollback/seeding commands require two confirmations. SQLTools can import connection metadata from .env while prompting for the password instead of copying it to settings. The Help page explains the scope of these protections.

The IDE source is tracked locally in Git. Run `npm test`, `npm run lint`, and `npm run format` at the repository root using the bundled Node. The Windows installer build and monthly upgrade policy are documented in `docs/MAINTENANCE.md`.
