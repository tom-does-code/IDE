param(
    [switch]$Installer,
    [switch]$SkipNativeRebuild
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$work = Join-Path $root 'work'
$downloads = Join-Path $work 'downloads'
$tools = Join-Path $root 'tools'
$plugins = Join-Path $root 'plugins'
$desktop = Join-Path $root 'desktop'
New-Item -ItemType Directory -Force $downloads, $tools, $plugins, (Join-Path $root 'docs/cache') | Out-Null

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program exited with code $LASTEXITCODE." }
}

function Download-File {
    param([string]$Url, [string]$Name, [string]$Sha256)
    $file = Join-Path $downloads $Name
    if ((Test-Path -LiteralPath $file) -and (!$Sha256 -or (Get-FileHash -LiteralPath $file).Hash -eq $Sha256)) {
        return $file
    }
    $temporary = "$file.part"
    Invoke-WebRequest -Uri $Url -OutFile $temporary -UseBasicParsing
    if ($Sha256 -and (Get-FileHash -LiteralPath $temporary).Hash -ne $Sha256) {
        throw "SHA256 mismatch for $Name."
    }
    Move-Item -LiteralPath $temporary -Destination $file -Force
    return $file
}

function Install-Tooling {
    $php = Join-Path $tools 'php'
    if (!(Test-Path (Join-Path $php 'php.exe'))) {
        $archive = Download-File 'https://windows.php.net/downloads/releases/archives/php-8.4.27-nts-Win32-vs17-x64.zip' 'php.zip' '93BD8A815A52156606FB906D0573437908C61F96E2CC52C03A51E36A41BF5236'
        Expand-Archive -LiteralPath $archive -DestinationPath $php -Force
    }
    if (!(Test-Path (Join-Path $php 'ext/php_xdebug.dll'))) {
        $xdebug = Download-File 'https://xdebug.org/files/php_xdebug-3.5.3-8.4-nts-vs17-x86_64.dll' 'php_xdebug.dll' 'A94D4FCFE4086A300B2DECAF7C04E59F4981AA5E56992D48B55C5E49DFD9B9EE'
        Copy-Item -LiteralPath $xdebug -Destination (Join-Path $php 'ext/php_xdebug.dll')
    }
    if (!(Test-Path (Join-Path $php 'cacert.pem'))) {
        Copy-Item -LiteralPath (Download-File 'https://curl.se/ca/cacert.pem' 'cacert.pem') -Destination $php
    }
    $phpPath = $php.Replace('\', '/')
    $ini = @(
        "extension_dir = `"$phpPath/ext`""
        "curl.cainfo = `"$phpPath/cacert.pem`""
        "openssl.cafile = `"$phpPath/cacert.pem`""
        (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'php.ini') -Raw)
    )
    if (!(Test-Path (Join-Path $php 'php.ini'))) {
        $ini | Set-Content -LiteralPath (Join-Path $php 'php.ini') -Encoding ascii
    }

    $composer = Download-File 'https://getcomposer.org/download/2.11.2/composer.phar' 'composer.phar' 'DD158C0AFD41D15FAC89E1B4E47B5D42911FE316C3687CD5EDAC98319B25D028'
    Copy-Item -LiteralPath $composer -Destination $tools
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'composer.cmd') -Destination $tools

    if (!(Test-Path (Join-Path $tools 'gh.exe'))) {
        $gh = Download-File 'https://github.com/cli/cli/releases/download/v2.104.0/gh_2.104.0_windows_amd64.zip' 'gh.zip' '08C06D10482F12C478018CD259F64ACBD5F625712CADF331AAD19BA973C879E5'
        $expanded = Join-Path $downloads 'gh'
        Expand-Archive -LiteralPath $gh -DestinationPath $expanded -Force
        Copy-Item -LiteralPath (Join-Path $expanded 'bin/gh.exe') -Destination $tools
        Copy-Item -LiteralPath (Join-Path $expanded 'LICENSE') -Destination (Join-Path $tools 'gh-LICENSE')
    }
    # A packaged copy uses this executable for plugin processes.
    $nodeFolder = Join-Path $tools 'node'
    New-Item -ItemType Directory -Force $nodeFolder | Out-Null
    $nodeExecutable = (Get-Command node.exe).Source
    if (!(Test-Path (Join-Path $nodeFolder 'node.exe'))) {
        Copy-Item -LiteralPath $nodeExecutable -Destination $nodeFolder
    }
    $nodeVersion = & node.exe --version
    if (!(Test-Path (Join-Path $nodeFolder 'LICENSE'))) {
        $license = Download-File "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" "node-$nodeVersion-LICENSE"
        Copy-Item -LiteralPath $license -Destination (Join-Path $nodeFolder 'LICENSE')
    }

    foreach ($plugin in (Get-Content -LiteralPath (Join-Path $root 'plugins-manifest.json') -Raw | ConvertFrom-Json)) {
        if (!$plugin.url) { continue }
        $name = $plugin.id.Replace('/', '.') + '-' + $plugin.version
        if (Test-Path -LiteralPath (Join-Path $plugins "$name/extension/package.json")) { continue }
        $archive = Download-File $plugin.url "$name.zip"
        $expanded = Join-Path $downloads "$name-expanded"
        Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
        if (!(Test-Path -LiteralPath (Join-Path $expanded 'extension/package.json'))) { throw "Invalid extension archive for $name." }
        Copy-Item -LiteralPath $expanded -Destination (Join-Path $plugins $name) -Recurse
    }
}

if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64 -or $env:OS -ne 'Windows_NT') {
    throw 'The Forge build script targets Windows x64.'
}
$version = [version]((& node.exe --version).TrimStart('v'))
if ($version.Major -lt 24) { throw 'Install Node.js 24 or newer.' }
Install-Tooling

Push-Location $root
try {
    Invoke-Checked npm.cmd @('ci')
    Invoke-Checked npm.cmd @('ci', '--prefix', 'src', '--omit=dev')
    Invoke-Checked npm.cmd @('run', 'lint')
    Invoke-Checked npm.cmd @('test')
    Push-Location $desktop
    try {
        if (!$SkipNativeRebuild) {
            Invoke-Checked npm.cmd @('ci', '--ignore-scripts')
            Invoke-Checked node.exe @('node_modules/electron/install.js')
            Invoke-Checked node.exe @('node_modules/node-pty/scripts/post-install.js')
            Invoke-Checked .\node_modules\.bin\theia-patch.cmd @()
            Invoke-Checked npm.cmd @('run', 'rebuild', '--', '--modules', 'native-keymap,keytar,@vscode/windows-ca-certs')
        }
        Invoke-Checked node.exe @('scripts/prepare-platform.cjs')
        Invoke-Checked node.exe @('scripts/sync-plugin.cjs')
        Invoke-Checked npm.cmd @('run', 'build')
        if ($Installer) { Invoke-Checked npm.cmd @('run', 'package:win') }
    } finally { Pop-Location }
} finally { Pop-Location }
