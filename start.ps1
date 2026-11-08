$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd start
