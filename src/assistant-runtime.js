"use strict";

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const run = promisify(execFile);

async function startRuntime(port, signal) {
  const installed = path.join(
    process.env.USERPROFILE || "",
    ".lmstudio",
    "bin",
    "lms.exe",
  );
  const cli = fs.existsSync(installed) ? installed : "lms";
  const env = { ...process.env };
  if (process.platform === "win32") {
    // The CLI starts llmster separately. Its Node workers also need hidden launches.
    const preload = path
      .join(__dirname, "llmster-windows.cjs")
      .replaceAll("\\", "/");
    env.NODE_OPTIONS = [env.NODE_OPTIONS, `--require="${preload}"`]
      .filter(Boolean)
      .join(" ");
  }
  const options = {
    windowsHide: true,
    signal,
    timeout: 45000,
    maxBuffer: 128 * 1024,
    env,
  };
  try {
    const { stdout } = await run(cli, ["daemon", "up", "--json"], options);
    if (!JSON.parse(stdout).isDaemon) {
      throw new Error(
        "Close the LM Studio desktop app before starting its standalone background runtime.",
      );
    }
    await run(
      cli,
      ["server", "start", "--port", String(port), "--bind", "127.0.0.1"],
      options,
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "Install LM Studio's standalone llmster runtime to start the server from Forge.",
        { cause: error },
      );
    }
    if (error.stderr?.trim()) {
      throw new Error(error.stderr.trim().slice(-400), { cause: error });
    }
    throw error;
  }
}

module.exports = { startRuntime };
