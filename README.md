# Forge PHP

## Install on another PC

1. Open this repository's **Releases** page on GitHub and download **Forge-PHP-1.4.2-Setup.exe** from the release assets.
2. Run the installer on Windows x64. Open **Forge PHP** from the Desktop or Start menu, then use **File → Open Folder**.
3. For PHP suggestions, press **Ctrl+Shift+P** and run **Forge: Install PHP Completions (Intelephense)**. Install [Git for Windows](https://git-scm.com/download/win) to use Forge Git.
4. If PHP reports a missing Visual C++ DLL, install Microsoft's [Visual C++ x64 Redistributable](https://aka.ms/vc14/vc_redist.x64.exe).

PHP, Composer, Node.js, Xdebug, and GitHub CLI are bundled. For Gemini, set your key in the assistant on that PC. For local Gemma, install llmster and download the model separately.

Forge is a standalone application built on Eclipse Theia and Monaco. See the [release checklist](docs/RELEASING.md) to publish an installer.

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
| Save current file | Ctrl+S |
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
- `data/`: settings and workspace history for the source launcher. Installed builds keep these in `%APPDATA%\ForgePHP`.
- `docs/cache/`: official reference pages cached with source URLs and timestamps.
- `projects/Welcome/`: runnable CodeIgniter playground with tests and HTTP examples.
- `work/`: build logs, verification reports and intermediate files.

This is a custom local IDE build, not a claim of full PhpStorm feature parity or production certification. Test it against your actual projects, deployment setup, database, and debugger paths before relying on it exclusively. Remote PHP/Docker interpreters need project-specific configuration. There is no automatic updater or signed public installer.

Documentation attribution: PHP Manual contributors (CC BY 3.0), https://www.php.net/manual/en/; CodeIgniter Foundation (MIT), https://codeigniter.com/user_guide/. Editor/framework and extension licences are retained in their installed packages.

## Desktop launch, multiple monitors, and navigation

Double-click **Forge PHP** on your Windows Desktop. The shortcut opens Forge and restores your workspace. The installer also adds a Start menu shortcut.

To use two monitors, open two files and drag one editor tab outside the main window. Move the detached window to the other monitor. You can also focus an editor and press **Ctrl+Alt+O**, or use **Forge > Move Editor to New Window**. **Forge > Bring All Editors Back** returns all detached editors. Keep the main IDE window open while using secondary windows.

- **Ctrl+Alt+B** toggles a bookmark at the current file and line.
- **Ctrl+Alt+J** searches project bookmarks.
- **Ctrl+Alt+Shift+H** compares a saved local snapshot against the current file.
- **Forge > Save Local Snapshot** creates a manual snapshot.

Local history automatically retains up to 20 versions per supported code file (maximum 512 KB each), with a limit of 500 recently saved files. It is stored locally in the Forge extension storage. It complements Git and backups; snapshots begin after this feature is enabled. Bookmark positions are stored line numbers and may need updating after large edits.

Secondary windows require the upstream Lumino patches: run `node_modules/.bin/theia-patch.cmd` before rebuilding if dependencies have been reinstalled.

## Feature guide and project tooling

Before working on a project on a new PC, use **Tools → Toolchain diagnostics**. It reports the selected PHP interpreter and language target, checks the project's locked PHP and extension requirements, and flags a root `.env` tracked by Git or missing an ignore rule. PHPUnit and Project Quality Checks save open files first and stop when saving fails.

Open **Help > Forge Feature Guide**, **Forge > Help and Feature Guide**, or press **Ctrl+Alt+F1**. The searchable guide covers every major workflow, setup steps, shortcuts, limitations, and a complete command directory.

Project PHP formatting now detects root PHP-CS-Fixer or PHPCS configuration and uses the project's Composer binary. It applies only formatter hunks fully inside changed lines by default; use `forge.formatChangedLinesOnly` to opt into whole-file formatting. Unconfigured projects retain Prettier.

Use **Forge > Set Up PHPStan** to install PHPStan plus the official CodeIgniter extension, then **Analyze with PHPStan** to populate Problems. Existing PHPStan configuration is preserved.

The environment status displays .env values, and Forge-owned migration/rollback/seeding commands require two confirmations. SQLTools can import connection metadata from .env while prompting for the password instead of copying it to settings. The Help page explains the scope of these protections.

The IDE source is tracked locally in Git. Run `npm test`, `npm run lint`, and `npm run format` at the repository root using the bundled Node. The Windows installer build and monthly upgrade policy are documented in `docs/MAINTENANCE.md`.

## Coding assistant

Open **Gemma Assistant** on the right or press **Ctrl+Alt+A**. Turn on **Enabled** and choose a model. **Gemini 3.5 Flash-Lite** is the faster cloud option. **Gemini 3.5 Flash** gives the model more room to reason. Both show the thinking summaries Google returns and list project file lookups. Use **Set Gemini API key** to save or replace the key in the OS credential store. With project lookups enabled, Gemini receives an excerpt from the active editor, including unsaved edits, along with your prompt and attached code. It can list and read additional project files on demand, with per-turn limits. Turn off project lookups to omit automatic context. Switching models keeps the transcript and carries recent turns into your next request. Switching to Gemini shares those turns with Google when you send. Use New chat to start without prior context. Attach a selection or active file when Gemma needs code context. Use **Stop** to cancel a response. Code blocks have **Copy** and **Insert…** actions.

Forge connects to LM Studio's standalone **llmster** runtime over loopback. Install llmster and download a Gemma 4 E4B GGUF once per PC. A request can start llmster and load the installed model on demand. The assistant defaults to off in new installs. Its model and runtime are separate downloads. Set forge.assistant.port or forge.assistant.model for a custom port or identifier. Authenticated servers can use the FORGE_LM_STUDIO_TOKEN environment variable.

[LM Studio headless setup](https://lmstudio.ai/docs/developer/core/headless)

## Forge Git and GitHub

Open **Forge Git** on the left or press **Ctrl+Alt+G**. Browse branches and merges, filter commits, and click any commit to open its diff. **Changes** opens file-by-file staging. **Actions** covers staging, commits, branches, merges, rebases, stashes, tags, cherry-picks, and reverts. **Pull** uses fast-forward only.

For a new project, choose **Initialize repository**, open **Changes**, and click **+** beside the files you want to stage. Return to Forge Git, click **Commit staged…**, and enter a message. Review `.gitignore` before staging so local settings and secrets stay out of commits.

Choose **Sign in to GitHub** and complete the browser approval. Use **Publish to GitHub…** to create a remote and push your commits. To use an existing remote, choose **GitHub → Set GitHub remote**, then **Push**. Forge runs GitHub CLI in the terminal and configures its Git credential helper for github.com. Set a remote, publish a repository, or create, review, and merge pull requests from the GitHub menu. Some actions open the browser. Repository access depends on your GitHub permissions. [GitHub CLI sign-in](https://cli.github.com/manual/gh_auth_login)

Ember, Midnight, and Pine are available from the Theme menu alongside Graphite, Abyss, Orchid, and Paper.

## Build from source on Windows

To build from a checkout on Windows x64, install Node.js 24 x64, Git for Windows, Python 3 with the py launcher, and Visual Studio Build Tools with the Desktop development with C++ workload and Spectre-mitigated MSVC libraries. The latter are required by the Windows certificate add-on. Install the x64 Visual C++ Redistributable if PHP requires it.

```powershell
.\desktop\scripts\build-windows.ps1 -Installer
.\desktop\scripts\launch-windows.ps1
```

The build downloads pinned PHP, Xdebug, Composer, GitHub CLI and the extensions listed in plugins-manifest.json. It installs dependencies from lockfiles, rebuilds Electron native add-ons, and runs lint and unit tests. Omit -Installer for a local build. Close Forge before building in the same checkout.

Git excludes generated installers, dependencies, user settings, projects, and model files.
