# Maker uninstaller — Windows (PowerShell). COMPLETE cleanup.
# Removes the `maker` launcher and ALL of Maker's app data (downloaded models,
# built tools, memory) under MAKER_HOME. Does NOT touch Node or Ollama. The
# source repo is left in place; the script prints how to delete it too.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1 [-Yes]
# Env:    MAKER_BIN_DIR (default %LOCALAPPDATA%\Maker\bin), MAKER_HOME (default %USERPROFILE%\.maker)

param([switch]$Yes)
$ErrorActionPreference = "Stop"

$RepoDir   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BinDir    = if ($env:MAKER_BIN_DIR) { $env:MAKER_BIN_DIR } else { Join-Path $env:LOCALAPPDATA "Maker\bin" }
$MakerHome = if ($env:MAKER_HOME)    { $env:MAKER_HOME }    else { Join-Path $env:USERPROFILE ".maker" }
$Launcher  = Join-Path $BinDir "maker.cmd"

Write-Host "Maker uninstaller — this removes:"
Write-Host "  * launcher: $Launcher"
Write-Host "  * app data: $MakerHome (models, tools, memory)"
Write-Host ""

if (-not $Yes) {
  $ans = Read-Host "Proceed? [y/N]"
  if ($ans -notmatch '^(y|yes)$') { Write-Host "Cancelled — nothing removed."; exit 0 }
}

if (Test-Path $Launcher) {
  Remove-Item -Force $Launcher
  Write-Host "OK  Removed launcher"
} else {
  Write-Host "--  No launcher at $Launcher"
}

if (Test-Path $MakerHome) {
  Remove-Item -Recurse -Force $MakerHome
  Write-Host "OK  Removed all app data ($MakerHome)"
} else {
  Write-Host "--  No app data at $MakerHome"
}

Write-Host ""
Write-Host "Maker is fully uninstalled."
Write-Host "The source repo is still here:  $RepoDir"
Write-Host "Delete it too if you like:      Remove-Item -Recurse -Force `"$RepoDir`""
Write-Host "(Node and Ollama, if installed, are untouched.)"
