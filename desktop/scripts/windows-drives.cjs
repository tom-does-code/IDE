// Windows volume discovery for the file picker. Uses .NET's actual mounted drives.
// This adapter avoids requiring a C++ toolchain on the end user's machine.
const { execFile } = require("node:child_process");
exports.list = () =>
  new Promise((resolve, reject) => {
    const script =
      "[System.IO.DriveInfo]::GetDrives() | ForEach-Object { @{name=$_.Name; type=[string]$_.DriveType} } | ConvertTo-Json -Compress";
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 10000 },
      (error, stdout) => {
        if (error) return reject(error);
        try {
          const data = JSON.parse(stdout || "[]");
          resolve(
            (Array.isArray(data) ? data : [data]).map((d) => ({
              device: d.name,
              description: d.type,
              mountpoints: [{ path: d.name }],
              isSystem: d.type === "Fixed",
              isRemovable: d.type === "Removable",
            })),
          );
        } catch (e) {
          reject(e);
        }
      },
    );
  });
