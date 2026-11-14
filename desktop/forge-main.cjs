const { app } = require("electron");
const path = require("path"),
  fs = require("fs");
const base = app.isPackaged
  ? path.join(process.resourcesPath, "forge")
  : path.resolve(__dirname, "..");
process.env.FORGE_HOME = base;
process.env.THEIA_CONFIG_DIR ||= app.isPackaged
  ? path.join(app.getPath("appData"), "ForgePHP")
  : path.join(base, "data");
if (app.isPackaged) {
  fs.mkdirSync(process.env.THEIA_CONFIG_DIR, { recursive: true });
  const phpRoot = path.join(base, "tools/php").replaceAll("\\", "/");
  let ini = fs.readFileSync(path.join(base, "tools/php/php.ini"), "utf8");
  ini = ini
    .replace(/^extension_dir\s*=.*$/m, 'extension_dir = "' + phpRoot + '/ext"')
    .replace(/^curl.cainfo\s*=.*$/m, 'curl.cainfo="' + phpRoot + '/cacert.pem"')
    .replace(
      /^openssl.cafile\s*=.*$/m,
      'openssl.cafile="' + phpRoot + '/cacert.pem"',
    );
  fs.writeFileSync(path.join(process.env.THEIA_CONFIG_DIR, "php.ini"), ini);
  process.env.PHPRC = process.env.THEIA_CONFIG_DIR;
  if (!process.argv.some((arg) => arg.startsWith("--plugins")))
    process.argv.push("--plugins=local-dir:" + path.join(base, "plugins"));
  process.argv.push("--hostname=127.0.0.1", "--port=0");
}
process.env.PATH =
  path.join(base, "tools/php") +
  ";" +
  path.join(base, "tools") +
  ";" +
  path.join(base, "tools/node") +
  ";" +
  process.env.PATH;
app.setName("Forge PHP");
app.setAppUserModelId("dev.forge.php");
app.setPath("userData", path.join(process.env.THEIA_CONFIG_DIR, "electron"));
if (process.platform === "win32") {
  const icon = path.join(__dirname, "assets", "forge.ico");
  const launcher = app.isPackaged
    ? process.execPath
    : path.join(base, "Forge PHP.exe");
  if (fs.existsSync(icon)) {
    app.on("browser-window-created", (_, window) => {
      window.setIcon(icon);
      window.setAppDetails({
        appId: "dev.forge.php",
        appIconPath: icon,
        ...(fs.existsSync(launcher) && {
          relaunchCommand: `"${launcher}"`,
          relaunchDisplayName: "Forge PHP",
        }),
      });
    });
  }
}
app.setAboutPanelOptions({
  applicationName: "Forge PHP",
  applicationVersion: app.getVersion(),
  copyright:
    "Built on Eclipse Theia, Monaco, PHP, and independent language tools.",
});
if (process.env.FORGE_TEST === "1")
  app.on("browser-window-created", (_, window) => {
    window.webContents.on("did-finish-load", () =>
      setTimeout(async () => {
        try {
          const checks = await window.webContents.executeJavaScript(
            `(()=>{const nodes=[...document.querySelectorAll('#forge-main-toolbar button,#forge-main-toolbar select,.lm-TabBar.theia-app-sides .lm-TabBar-tab')];return nodes.filter(n=>n.getBoundingClientRect().width>0).map(n=>{const r=n.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label:n.textContent||n.title,rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit:n===target||n.contains(target)}})})()`,
          );
          fs.writeFileSync(
            path.join(base, "work/hit-targets.json"),
            JSON.stringify(checks, null, 2),
          );
          fs.writeFileSync(
            path.join(base, "work/workbench.png"),
            (await window.webContents.capturePage()).toPNG(),
          );
        } catch (e) {
          fs.writeFileSync(path.join(base, "work/ui-test-error.txt"), e.stack);
        }
      }, 12000),
    );
  });
import("./lib/backend/electron-main.js");
