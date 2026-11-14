param([switch]$Test)
$ErrorActionPreference='Stop'
$forgeBase=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$env:FORGE_HOME=$forgeBase
$env:THEIA_CONFIG_DIR=Join-Path $forgeBase 'data'
$env:PATH="$forgeBase\tools\php;$forgeBase\tools;$forgeBase\tools\node;"+$env:PATH
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
if($Test){$env:FORGE_TEST='1'}else{Remove-Item Env:FORGE_TEST -ErrorAction SilentlyContinue}
$arguments=@('.',('"'+$forgeBase+'\projects\Welcome"'),'--plugins=local-dir:../plugins','--hostname=127.0.0.1','--port=0',('--electron-user-data="'+$forgeBase+'\data\electron"'))
$process=Start-Process -FilePath "$forgeBase\desktop\node_modules\electron\dist\electron.exe" -ArgumentList $arguments -WorkingDirectory "$forgeBase\desktop" -WindowStyle Hidden -RedirectStandardOutput "$forgeBase\work\forge-startup.log" -RedirectStandardError "$forgeBase\work\forge-stderr.log" -PassThru
Set-Content "$forgeBase\work\forge.pid" $process.Id
Write-Output "Forge PID: $($process.Id)"
