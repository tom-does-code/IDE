"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ignored =
  /^(?:\.git|\.svn|node_modules|vendor|\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|credentials(?:\..*)?|secrets(?:\..*)?|id_(?:rsa|ed25519)(?:\..*)?)$/i;
function allowed(name) {
  return (
    !name.split(/[\\/]/).some((part) => ignored.test(part)) &&
    !/\.(?:pem|key|pfx|p12|kdbx|jks|sqlite3?|db|log)$/i.test(name)
  );
}

const LIMIT = 14000;
const declarations = [
  {
    name: "list_project_files",
    description:
      "Find project files by partial path, starting with matches near the active editor. Empty query lists files. Use offset for additional pages.",
    parameters: {
      type: "OBJECT",
      properties: { query: { type: "STRING" }, offset: { type: "INTEGER" } },
    },
  },
  {
    name: "read_project_file",
    description:
      "Read a slice of a project file by its exact path from the file list. Unsaved editor contents take precedence. Use start_line and line_count to paginate.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING" },
        start_line: { type: "INTEGER" },
        line_count: { type: "INTEGER" },
      },
      required: ["path"],
    },
  },
];

const contains = (root, target) => {
  const relative = path.relative(root, target);
  return (
    !!relative &&
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
};

async function projectContext(vscode, editor, signal) {
  const roots =
    vscode.workspace.workspaceFolders?.filter(
      (folder) => folder.uri.scheme === "file",
    ) || [];
  const activeRoot =
    editor && vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (activeRoot)
    roots.sort((a, b) => Number(b === activeRoot) - Number(a === activeRoot));
  const folders = await Promise.all(
    roots.map(async (folder, index) => ({
      folder,
      canonical: await fs.realpath(folder.uri.fsPath),
      prefix: roots.length > 1 ? `${index + 1}:${folder.name}/` : "",
    })),
  );
  const relativeName = (entry, file) =>
    entry.prefix +
    path.relative(entry.folder.uri.fsPath, file).split(path.sep).join("/");
  let active;
  if (editor?.document.uri.scheme === "file" && !editor.document.isClosed) {
    const document = editor.document;
    const entry = folders.find((candidate) =>
      contains(candidate.folder.uri.fsPath, document.uri.fsPath),
    );
    const name = entry && relativeName(entry, document.uri.fsPath);
    if (name && allowed(name)) {
      const real = await fs
        .realpath(document.uri.fsPath)
        .catch(() => undefined);
      if (
        real &&
        contains(entry.canonical, real) &&
        allowed(path.relative(entry.canonical, real))
      ) {
        const line = Math.max(0, editor.selection.active.line - 50);
        const start = document.lineAt(line).range.start;
        const end = document.positionAt(
          Math.min(
            document.offsetAt(start) + 9500,
            document.offsetAt(
              document.lineAt(document.lineCount - 1).range.end,
            ),
          ),
        );
        active = {
          path: name,
          start_line: line + 1,
          content: document.getText(new vscode.Range(start, end)),
        };
      }
    }
  }
  let index;
  let budget = 45000;
  async function list(query, offset) {
    index ??= Promise.all(
      folders.map(async (entry) => {
        const cancellation = new vscode.CancellationTokenSource();
        const abort = () => cancellation.cancel();
        signal.addEventListener("abort", abort, { once: true });
        try {
          signal.throwIfAborted();
          const uris = await vscode.workspace.findFiles(
            new vscode.RelativePattern(entry.folder, "**/*"),
            "**/{.git,.svn,node_modules,vendor}/**",
            12001,
            cancellation.token,
          );
          return {
            paths: uris
              .slice(0, 12000)
              .map((uri) => relativeName(entry, uri.fsPath))
              .filter(allowed),
            capped: uris.length > 12000,
          };
        } finally {
          signal.removeEventListener("abort", abort);
          cancellation.dispose();
        }
      }),
    );
    const pages = await index;
    signal.throwIfAborted();
    const paths = pages
      .flatMap((page) => page.paths)
      .filter((name) => name.toLowerCase().includes(query));
    const activeDir = active?.path?.slice(0, active.path.lastIndexOf("/") + 1);
    const rank = (name) =>
      name === active?.path
        ? 0
        : activeDir && name.startsWith(activeDir)
          ? 1
          : 2;
    paths.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    return {
      paths: paths.slice(offset, offset + 100),
      next_offset: offset + 100 < paths.length ? offset + 100 : null,
      capped: pages.some((page) => page.capped),
    };
  }
  async function read(args) {
    const name = args.path;
    if (typeof name !== "string" || !allowed(name))
      throw new Error("This file is excluded from cloud access.");
    const entry = folders.find((folder) => name.startsWith(folder.prefix));
    if (!entry)
      throw new Error("Use a project path returned by the file list.");
    const target = path.resolve(
      entry.folder.uri.fsPath,
      name.slice(entry.prefix.length),
    );
    if (
      !contains(entry.folder.uri.fsPath, target) ||
      !allowed(path.relative(entry.folder.uri.fsPath, target))
    )
      throw new Error("Choose an allowed file inside the project.");
    const real = await fs.realpath(target);
    if (
      !contains(entry.canonical, real) ||
      !allowed(path.relative(entry.canonical, real))
    )
      throw new Error("Choose an allowed file inside the project.");
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error("Choose a text file below 1 MB.");
    const open = vscode.workspace.textDocuments.find(
      (doc) =>
        doc.uri.scheme === "file" &&
        path.relative(target, doc.uri.fsPath) === "",
    );
    const text = open ? open.getText() : await fs.readFile(real, "utf8");
    if (text.includes("\0")) throw new Error("Binary files cannot be read.");
    const lines = text.split(/\r?\n/);
    const start = Number.isInteger(args.start_line)
      ? Math.max(1, args.start_line)
      : 1;
    const count = Number.isInteger(args.line_count)
      ? Math.max(1, Math.min(250, args.line_count))
      : 160;
    const content = lines.slice(start - 1, start - 1 + count).join("\n");
    return {
      path: name,
      start_line: start,
      total_lines: lines.length,
      content: content.slice(0, LIMIT),
      clipped: content.length > LIMIT,
    };
  }
  return {
    active,
    tools: folders.length
      ? [{ functionDeclarations: declarations }]
      : undefined,
    async execute(name, args = {}) {
      signal.throwIfAborted();
      try {
        let result;
        if (name === "list_project_files") {
          result = await list(
            typeof args.query === "string"
              ? args.query.toLowerCase().slice(0, 200)
              : "",
            Number.isInteger(args.offset) ? Math.max(0, args.offset) : 0,
          );
        } else if (name === "read_project_file") {
          result = await read(args);
        } else {
          return { error: "Unknown project tool." };
        }
        const size = JSON.stringify(result).length;
        if (size > budget)
          return {
            error:
              "Project context limit reached. Answer from the files already available.",
          };
        budget -= size;
        return result;
      } catch {
        signal.throwIfAborted();
        return {
          error:
            "Could not read that project path. Use an allowed path from the project file list.",
        };
      }
    },
  };
}

module.exports = { projectContext };
