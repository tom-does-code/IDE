param([string]$Project)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$desktop = Join-Path $root 'desktop'
$electron = Join-Path $desktop 'node_modules/electron/dist/electron.exe'
if (!(Test-Path -LiteralPath (Join-Path $desktop 'lib/backend/electron-main.js'))) {
    throw 'Build Forge using desktop/scripts/build-windows.ps1 first.'
}
Remove-Item Env:ELECTRON_RUN_AS_NODE,Env:FORGE_TEST -ErrorAction SilentlyContinue
$arguments = @('.', ('--plugins="local-dir:' + (Join-Path $root 'plugins') + '"'), '--hostname=127.0.0.1', '--port=0')
if ($Project) {
    $folder = (Resolve-Path -LiteralPath $Project).Path.TrimEnd('\')
    $arguments += ('"' + $folder + '"')
}
Start-Process -FilePath $electron -ArgumentList $arguments -WorkingDirectory $desktop -WindowStyle Normal
