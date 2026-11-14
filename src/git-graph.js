"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const vscode = require("vscode");
const { parseGraph, LOG_FORMAT } = require("./git-graph-core");

const run = promisify(execFile);
const viewId = "forge.git.graph";
const asset = (name) =>
  fs.readFileSync(path.join(__dirname, "media", name), "utf8");

async function exec(command, args, cwd, signal) {
  const { stdout } = await run(command, args, {
    cwd,
    signal,
    windowsHide: true,
    timeout: 90000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GH_PROMPT_DISABLED: "1",
      NO_COLOR: "1",
    },
  });
  return stdout.trimEnd();
}

function ghPath() {
  const bundled = path.join(process.env.FORGE_HOME || "", "tools", "gh.exe");
  return fs.existsSync(bundled) ? bundled : "gh";
}

function textDoc(title, content, language = "diff") {
  return vscode.workspace
    .openTextDocument({ language, content })
    .then((doc) => vscode.window.showTextDocument(doc, { preview: true }))
    .then((editor) => {
      vscode.window.setStatusBarMessage(title, 4000);
      return editor;
    });
}

function requireTrust() {
  if (!vscode.workspace.isTrusted)
    throw new Error("Trust this workspace to run Git actions.");
}

async function confirm(message, action) {
  return (
    (await vscode.window.showWarningMessage(
      message,
      { modal: true },
      action,
    )) === action
  );
}

function githubTerminal(root, name, command) {
  // OAuth is interactive. Keep the code visible in the terminal and let gh manage credentials.
  const terminal = vscode.window.createTerminal({
    name,
    cwd: root,
    shellPath: "powershell.exe",
    shellArgs: ["-NoLogo", "-NoProfile"],
  });
  terminal.show();
  const cli = ghPath().replaceAll("'", "''");
  terminal.sendText(command(cli));
}

exports.activate = function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.git.open", () =>
      vscode.commands.executeCommand(viewId + ".focus"),
    ),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      viewId,
      {
        resolveWebviewView(view) {
          const { webview } = view;
          const nonce = randomBytes(16).toString("hex");
          webview.options = { enableScripts: true, localResourceRoots: [] };
          webview.html = asset("git-graph.html")
            .replaceAll("{{nonce}}", nonce)
            .replace("/* FORGE_CSS */", () => asset("git-graph.css"))
            .replace("/* FORGE_SCRIPT */", () => asset("git-graph-ui.js"));
          let root,
            running,
            selectedHash,
            refreshTimer,
            gitRepositorySubscription,
            disposed;
          let limit = 160;
          const send = (type, data = {}) => {
            if (!disposed) void webview.postMessage({ type, ...data });
          };
          const git = (args) =>
            exec(
              "git",
              ["-c", "color.ui=false", ...args],
              root,
              running?.signal,
            );
          const gh = (args) => exec(ghPath(), args, root, running?.signal);
          const choose = (items, title) =>
            vscode.window.showQuickPick(items, {
              title,
              matchOnDescription: true,
            });
          const input = (title, value) =>
            vscode.window.showInputBox({ title, value, ignoreFocusOut: true });

          async function discover(pick = false) {
            const candidates = new Set(
              (vscode.workspace.workspaceFolders || []).map(
                (folder) => folder.uri.fsPath,
              ),
            );
            const integration = vscode.extensions.getExtension("vscode.git");
            if (integration?.isActive) {
              for (const repository of integration.exports.getAPI(1)
                .repositories)
                candidates.add(repository.rootUri.fsPath);
            }
            const roots = new Set();
            for (const folder of candidates) {
              const top = await exec(
                "git",
                ["rev-parse", "--show-toplevel"],
                folder,
                running?.signal,
              ).catch(() => "");
              if (top) roots.add(path.normalize(top));
            }
            const items = [...roots].map((value) => ({
              label: path.basename(value),
              description: value,
              value,
            }));
            if (!items.length) return undefined;
            const editor = vscode.window.activeTextEditor?.document.uri.fsPath;
            const current = items
              .filter((item) =>
                editor
                  ?.toLowerCase()
                  .startsWith((item.value + path.sep).toLowerCase()),
              )
              .sort((a, b) => b.value.length - a.value.length)[0];
            return pick && items.length > 1
              ? (await choose(items, "Switch repository"))?.value
              : (current || items[0]).value;
          }

          async function refresh() {
            if (!root) root = await discover();
            if (!root) return;
            const [status, log, branches, remotes] = await Promise.all([
              git([
                "status",
                "--porcelain=v1",
                "--branch",
                "--untracked-files=normal",
              ]),
              git([
                "log",
                "--all",
                "--graph",
                "--topo-order",
                `-${limit}`,
                LOG_FORMAT,
                "--date=short",
              ]).catch((error) => {
                if (/does not have any commits/i.test(error.stderr || ""))
                  return "";
                throw error;
              }),
              git([
                "for-each-ref",
                "--format=%(refname:short)%09%(objectname:short)",
                "refs/heads",
                "refs/remotes",
              ]),
              git(["remote"]),
            ]);
            const [head, ...changes] = status.split(/\r?\n/);
            send("graph", {
              name: path.basename(root),
              head: head.replace(/^## /, ""),
              changes: changes.length,
              staged: changes.filter((line) => /^[MADRCT][^?]/.test(line))
                .length,
              hasRemote: !!remotes,
              rows: parseGraph(log),
              branches: branches ? branches.split(/\r?\n/) : [],
            });
            gitRepositorySubscription?.dispose();
            const integration = vscode.extensions.getExtension("vscode.git");
            const repository =
              integration?.isActive &&
              integration.exports
                .getAPI(1)
                .repositories.find(
                  (item) =>
                    path.normalize(item.rootUri.fsPath).toLowerCase() ===
                    root.toLowerCase(),
                );
            gitRepositorySubscription = repository?.state.onDidChange(() => {
              if (!view.visible || running) return;
              clearTimeout(refreshTimer);
              refreshTimer = setTimeout(
                () => dispatch({ type: "refresh" }),
                500,
              );
            });
          }

          async function localBranches(title, remote = false) {
            const refs = await git([
              "for-each-ref",
              "--format=%(refname:short)%09%(symref)",
              "refs/heads",
              ...(remote ? ["refs/remotes"] : []),
            ]);
            const list = refs
              .split(/\r?\n/)
              .filter((ref) => ref && !ref.split("\t")[1])
              .map((ref) => ref.split("\t")[0]);
            return choose(list, title);
          }

          async function addRemote() {
            const url = await input("GitHub remote URL", "https://github.com/");
            if (!url) return;
            if (
              !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(url) &&
              !/^git@github\.com:[\w.-]+\/[\w.-]+$/i.test(url)
            ) {
              throw new Error("Enter a GitHub HTTPS or SSH repository URL.");
            }
            const name = await input("Remote name", "origin");
            if (!name) return;
            if (!/^[a-zA-Z0-9][\w.-]*$/.test(name))
              throw new Error("Enter a valid remote name.");
            const remotes = (await git(["remote"])).split(/\r?\n/);
            if (remotes.includes(name)) {
              if (await confirm(`Update ${name} to ${url}?`, "Update remote"))
                await git(["remote", "set-url", name, url]);
            } else await git(["remote", "add", name, url]);
          }

          async function pullRequests() {
            const items = JSON.parse(
              await gh([
                "pr",
                "list",
                "--limit",
                "30",
                "--json",
                "number,title,headRefName,url,isDraft",
              ]),
            );
            const pr = await choose(
              items.map((item) => ({
                ...item,
                label: `#${item.number} ${item.title}`,
                description: item.headRefName,
              })),
              "Open pull requests",
            );
            if (!pr) return;
            const action = await choose(
              [
                "Open on GitHub",
                "Checkout",
                "View diff",
                "Approve",
                "Merge",
                "Close",
              ],
              `Pull request #${pr.number}`,
            );
            if (action === "Open on GitHub")
              await gh(["pr", "view", String(pr.number), "--web"]);
            if (action === "Checkout")
              await gh(["pr", "checkout", String(pr.number)]);
            if (action === "View diff")
              await textDoc(
                pr.label,
                await gh(["pr", "diff", String(pr.number)]),
              );
            if (
              action === "Approve" &&
              (await confirm(`Approve pull request #${pr.number}?`, "Approve"))
            )
              await gh(["pr", "review", String(pr.number), "--approve"]);
            if (
              action === "Merge" &&
              (await confirm(
                `Squash and merge pull request #${pr.number}?`,
                "Merge",
              ))
            )
              await gh(["pr", "merge", String(pr.number), "--squash"]);
            if (
              action === "Close" &&
              (await confirm(`Close pull request #${pr.number}?`, "Close"))
            )
              await gh(["pr", "close", String(pr.number)]);
          }

          async function initializeRepository() {
            const folders = (vscode.workspace.workspaceFolders || []).filter(
              (folder) => folder.uri.scheme === "file",
            );
            if (!folders.length)
              throw new Error("Open your project folder first.");
            const folder =
              folders.length === 1
                ? folders[0]
                : await choose(
                    folders.map((value) => ({
                      label: value.name,
                      description: value.uri.fsPath,
                      ...value,
                    })),
                    "Choose a project folder",
                  );
            if (!folder) return;
            const dir = folder.uri.fsPath;
            if (
              await exec(
                "git",
                ["rev-parse", "--show-toplevel"],
                dir,
                running?.signal,
              ).catch(() => "")
            )
              throw new Error(
                "This folder is already inside a Git repository. Refresh Forge Git.",
              );
            await exec("git", ["init", "-b", "main"], dir, running?.signal);
            root = dir;
          }

          async function commitStaged() {
            const staged = await git(["diff", "--cached", "--name-only"]);
            if (!staged)
              throw new Error(
                "Stage the files you want to commit in Changes first.",
              );
            const message = (await input("Commit message"))?.trim();
            if (!message) return;
            const name = await git(["config", "--get", "user.name"]).catch(
              () => "",
            );
            const email = await git(["config", "--get", "user.email"]).catch(
              () => "",
            );
            if (!name || !email) {
              const author =
                name || (await input("Commit author name"))?.trim();
              if (!author) return;
              const address =
                email ||
                (
                  await input("Commit email (a GitHub noreply address works)")
                )?.trim();
              if (!address) return;
              if (!name) await git(["config", "--local", "user.name", author]);
              if (!email)
                await git(["config", "--local", "user.email", address]);
            }
            await git(["commit", "-m", message]);
          }

          async function githubActions(requested) {
            const action =
              requested ||
              (await choose(
                [
                  "Account status",
                  "Sign in",
                  "Set GitHub remote",
                  "Open repository on GitHub",
                  "Pull requests",
                  "Create pull request",
                  "Publish repository",
                  "Issues",
                ],
                "GitHub",
              ));
            switch (action) {
              case "Account status": {
                const account = await gh(["api", "user", "--jq", ".login"]);
                vscode.window.showInformationMessage(
                  `Signed in to GitHub as ${account}.`,
                );
                break;
              }
              case "Sign in":
                githubTerminal(
                  root,
                  "Forge GitHub sign-in",
                  (cli) =>
                    `& '${cli}' auth login --hostname github.com --git-protocol https --web; if ($LASTEXITCODE -eq 0) { & '${cli}' auth setup-git --hostname github.com }`,
                );

                break;
              case "Set GitHub remote":
                await addRemote();
                break;
              case "Open repository on GitHub":
                await gh(["repo", "view", "--web"]);
                break;
              case "Pull requests":
                await pullRequests();
                break;
              case "Publish repository": {
                if (
                  !(await git(["rev-parse", "--verify", "HEAD"]).catch(
                    () => "",
                  ))
                )
                  throw new Error(
                    "Create your first commit before publishing.",
                  );
                if (
                  !(await gh([
                    "auth",
                    "status",
                    "--hostname",
                    "github.com",
                  ]).then(
                    () => true,
                    (error) => {
                      if (error.code === "ENOENT") throw error;
                      return false;
                    },
                  ))
                )
                  throw new Error(
                    "Sign in to GitHub first, then come back to Publish to GitHub.",
                  );
                const name = await input(
                  "New GitHub repository name",
                  path.basename(root),
                );
                if (!name) break;
                if (
                  !/^(?:[a-zA-Z0-9][\w-]*\/)?[a-zA-Z0-9_.-]+$/.test(name) ||
                  /^\.{1,2}$/.test(name)
                ) {
                  throw new Error(
                    "Enter a GitHub repository name or owner/name.",
                  );
                }
                const visibility = await choose(
                  ["Private", "Public"],
                  "Repository visibility",
                );
                if (
                  !visibility ||
                  !(await confirm(
                    `Create the ${visibility.toLowerCase()} repository ${name} and push the current branch?`,
                    "Publish",
                  ))
                )
                  break;
                if ((await git(["remote"])).split(/\r?\n/).includes("origin"))
                  throw new Error(
                    "This repository already has an origin. Use Push or set a different remote.",
                  );
                await gh([
                  "repo",
                  "create",
                  name,
                  "--" + visibility.toLowerCase(),
                  "--source",
                  root,
                  "--remote",
                  "origin",
                  "--push",
                ]);
                break;
              }
              case "Create pull request":
                await gh(["pr", "create", "--web"]);
                break;
              case "Issues":
                await gh(["issue", "list", "--web"]);
                break;
            }
          }

          async function actions() {
            const action = await choose(
              [
                "Stage all changes",
                "Unstage all changes",
                "Commit staged changes",
                "Working tree diff",
                "Staged diff",
                "Switch branch",
                "Create branch",
                "Merge branch",
                "Rebase onto branch",
                "Stash changes",
                "Apply stash",
                "Create tag",
                "Set GitHub remote",
                "Cherry-pick selected commit",
                "Revert selected commit",
              ],
              "Repository actions",
            );
            switch (action) {
              case "Stage all changes":
                await git(["add", "-A"]);
                break;
              case "Unstage all changes": {
                const hasHead = await git([
                  "rev-parse",
                  "--verify",
                  "HEAD",
                ]).catch(() => "");
                if (!hasHead)
                  await git([
                    "rm",
                    "--cached",
                    "-rf",
                    "--ignore-unmatch",
                    "--",
                    ".",
                  ]);
                else await git(["reset", "--", "."]);
                break;
              }
              case "Commit staged changes":
                await commitStaged();
                break;
              case "Working tree diff":
                await textDoc(action, await git(["diff", "--no-ext-diff"]));
                break;
              case "Staged diff":
                await textDoc(
                  action,
                  await git(["diff", "--cached", "--no-ext-diff"]),
                );
                break;
              case "Switch branch": {
                const branch = await localBranches("Switch branch");
                if (branch) await git(["switch", "--", branch]);
                break;
              }
              case "Create branch": {
                const name = await input("New branch name");
                if (name) await git(["switch", "-c", name]);
                break;
              }
              case "Merge branch":
              case "Rebase onto branch": {
                const branch = await localBranches(action, true);
                const operation =
                  action === "Merge branch" ? "merge" : "rebase";
                if (branch && (await confirm(`${action}: ${branch}?`, action)))
                  await git([operation, "--", branch]);
                break;
              }
              case "Stash changes":
                await git(["stash", "push", "--include-untracked"]);
                break;
              case "Apply stash": {
                const list = await git([
                  "stash",
                  "list",
                  "--format=%gd%x09%gs",
                ]);
                const stash = await choose(
                  list
                    .split(/\r?\n/)
                    .filter(Boolean)
                    .map((line) => {
                      const [label, description] = line.split("\t");
                      return { label, description };
                    }),
                  action,
                );
                if (stash) await git(["stash", "apply", stash.label]);
                break;
              }
              case "Create tag": {
                const tag = await input("New tag name");
                if (tag) await git(["tag", "--", tag, selectedHash || "HEAD"]);
                break;
              }
              case "Set GitHub remote":
                await addRemote();
                break;
              case "Cherry-pick selected commit":
              case "Revert selected commit": {
                if (!selectedHash)
                  throw new Error("Select a commit in the graph first.");
                const operation = action.startsWith("Cherry")
                  ? "cherry-pick"
                  : "revert";
                if (
                  await confirm(
                    `${action} ${selectedHash.slice(0, 8)}?`,
                    action,
                  )
                ) {
                  await git([
                    operation,
                    ...(operation === "revert" ? ["--no-edit"] : []),
                    selectedHash,
                  ]);
                }
                break;
              }
            }
          }

          async function dispatch(message) {
            if (running || disposed) return;
            running = new AbortController();
            send("busy", { value: true });
            try {
              requireTrust();
              if (message.type === "repository") {
                const chosen = await discover(true);
                if (chosen && chosen !== root) {
                  root = chosen;
                  limit = 160;
                  selectedHash = undefined;
                }
              }
              if (message.type === "init") await initializeRepository();
              if (!root) root = await discover();
              if (!root) {
                const hasFolder = vscode.workspace.workspaceFolders?.some(
                  (folder) => folder.uri.scheme === "file",
                );
                send("setup", { hasFolder: !!hasFolder });
                send("status", { text: "" });
                return;
              }
              switch (message.type) {
                case "init":
                  break;
                case "commit":
                  await commitStaged();
                  break;
                case "signIn":
                  await githubActions("Sign in");
                  break;
                case "publish":
                  await githubActions("Publish repository");
                  break;
                case "show": {
                  if (!/^[0-9a-f]{40,64}$/.test(message.hash)) return;
                  selectedHash = message.hash;
                  await textDoc(
                    selectedHash.slice(0, 8),
                    await git([
                      "show",
                      "--no-ext-diff",
                      "--stat",
                      "--patch",
                      selectedHash,
                      "--",
                    ]),
                  );
                  return;
                }
                case "more":
                  limit = Math.min(1000, limit + 160);
                  break;
                case "scm":
                  await vscode.commands.executeCommand("workbench.view.scm");
                  return;
                case "fetch":
                  await git(["fetch", "--all", "--prune"]);
                  break;
                case "pull":
                  await git(["pull", "--ff-only"]);
                  break;
                case "push": {
                  if (!(await git(["remote"])))
                    throw new Error(
                      "Use Publish to GitHub to create a remote, or set a remote under GitHub.",
                    );
                  if (
                    !(await confirm(
                      `Push the current branch from ${path.basename(root)}?`,
                      "Push",
                    ))
                  )
                    return;
                  const upstream = await git([
                    "rev-parse",
                    "--abbrev-ref",
                    "@{upstream}",
                  ]).catch(() => "");
                  if (upstream) await git(["push"]);
                  else {
                    const remote = await choose(
                      (await git(["remote"])).split(/\r?\n/).filter(Boolean),
                      "Push to remote",
                    );
                    if (remote) await git(["push", "-u", remote, "HEAD"]);
                  }
                  break;
                }
                case "actions":
                  await actions();
                  break;
                case "github":
                  await githubActions();
                  break;
                case "refresh":
                case "repository":
                  break;
                default:
                  return;
              }
              await refresh();
              send("status", { text: "" });
            } catch (error) {
              const text =
                error.code === "ENOENT" && error.path?.includes("gh")
                  ? "Install GitHub CLI (gh) to use GitHub actions."
                  : (error.stderr || error.message).trim().slice(0, 500);
              send("status", { text, error: true });
            } finally {
              running = undefined;
              send("busy", { value: false });
            }
          }

          const receive = webview.onDidReceiveMessage(dispatch);
          const workspace = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            root = undefined;
            selectedHash = undefined;
            if (view.visible) void dispatch({ type: "refresh" });
          });
          view.onDidDispose(() => {
            disposed = true;
            clearTimeout(refreshTimer);
            running?.abort();
            gitRepositorySubscription?.dispose();
            workspace.dispose();
            receive.dispose();
          });
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
};
