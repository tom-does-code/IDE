const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
const { limitFormatting } = require("./changed-lines");
function detect(root) {
  for (const [kind, names, bin] of [
    [
      "fixer",
      [".php-cs-fixer.php", ".php-cs-fixer.dist.php"],
      "vendor/bin/php-cs-fixer",
    ],
    [
      "phpcbf",
      [".phpcs.xml", "phpcs.xml", ".phpcs.xml.dist", "phpcs.xml.dist"],
      "vendor/bin/phpcbf",
    ],
  ])
    for (const name of names)
      if (fs.existsSync(path.join(root, name)))
        return {
          kind,
          config: path.join(root, name),
          bin: path.join(root, bin),
        };
}
async function format({ root, file, source, php, changedOnly = true }) {
  const tool = detect(root);
  if (!tool) return undefined;
  if (!fs.existsSync(tool.bin))
    throw Error(
      `Project ${tool.kind} configuration found, but its Composer binary is missing. Install the project's development dependencies.`,
    );
  const temporary = path.join(
    path.dirname(file),
    `.forge-format-${crypto.randomUUID()}.php`,
  );
  const options = {
    cwd: root,
    windowsHide: true,
    timeout: 20000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, XDEBUG_MODE: "off" },
  };
  fs.writeFileSync(temporary, source, { flag: "wx" });
  try {
    const args =
      tool.kind === "fixer"
        ? [
            tool.bin,
            "fix",
            temporary,
            `--config=${tool.config}`,
            "--using-cache=no",
            "--no-interaction",
            "--quiet",
          ]
        : [
            tool.bin,
            `--standard=${tool.config}`,
            `--stdin-path=${file}`,
            temporary,
          ];
    try {
      await run(php, args, options);
    } catch (error) {
      if (!(tool.kind === "phpcbf" && error.code === 1))
        throw Error(
          `Project formatter failed: ${(error.stderr || error.stdout || error.message).slice(0, 500)}`,
          { cause: error },
        );
    }
    const formatted = fs.readFileSync(temporary, "utf8");
    if (!changedOnly) return formatted;
    let baseline;
    try {
      const top = (
        await run("git", ["rev-parse", "--show-toplevel"], options)
      ).stdout.trim();
      const relative = path.relative(top, file).replaceAll("\\", "/");
      baseline = (await run("git", ["show", `HEAD:${relative}`], options))
        .stdout;
    } catch {
      // Missing Git history is not permission to rewrite an entire existing file.
      baseline = fs.readFileSync(file, "utf8");
    }
    return limitFormatting(source, formatted, baseline);
  } finally {
    fs.unlinkSync(temporary);
  }
}
module.exports = { detect, format };
