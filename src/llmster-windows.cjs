"use strict";

const { basename } = require("node:path");

if (
  process.platform === "win32" &&
  basename(process.execPath).toLowerCase() === "llmster.exe"
) {
  const childProcess = require("node:child_process");
  const { syncBuiltinESMExports } = require("node:module");
  const fork = childProcess.fork;

  // llmster forks console-subsystem Node workers without windowsHide on Windows.
  childProcess.fork = function forkWithoutWindow(modulePath, args, options) {
    if (args != null && !Array.isArray(args)) {
      return fork.call(this, modulePath, { ...args, windowsHide: true });
    }
    return fork.call(this, modulePath, args ?? [], {
      ...options,
      windowsHide: true,
    });
  };
  syncBuiltinESMExports();
}
