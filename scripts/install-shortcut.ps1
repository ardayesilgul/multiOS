# multiOS Desktop and Start Menu Shortcut Installer
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
$programs = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)
$appName = "multiOS"

$localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$targetExe = Join-Path $localAppData "$appName\$appName.exe"

if (!(Test-Path $targetExe)) {
    $distExe = Join-Path $root "dist\$appName.exe"
    if (Test-Path $distExe) {
        $targetExe = $distExe
    } else {
        $targetExe = Join-Path $root "src\native\multios-tray.exe"
    }
}

$workDir = Split-Path -Parent $targetExe
$lnkDesktop = Join-Path $desktop "$appName.lnk"
$lnkPrograms = Join-Path $programs "$appName.lnk"

$shell = New-Object -ComObject WScript.Shell

# 1. Desktop Shortcut
$sc1 = $shell.CreateShortcut($lnkDesktop)
$sc1.TargetPath = $targetExe
$sc1.WorkingDirectory = $workDir
$sc1.Description = "multiOS - iPhone ve Windows arasında dosya paylaşımı"
$sc1.IconLocation = "$targetExe,0"
$sc1.Save()

# 2. Start Menu Shortcut
$sc2 = $shell.CreateShortcut($lnkPrograms)
$sc2.TargetPath = $targetExe
$sc2.WorkingDirectory = $workDir
$sc2.Description = "multiOS - iPhone ve Windows arasında dosya paylaşımı"
$sc2.IconLocation = "$targetExe,0"
$sc2.Save()

Write-Host "multiOS Kısayolları Hazırlandı:" -ForegroundColor Green
Write-Host "  Masaüstü: $lnkDesktop"
Write-Host "  Başlat Menüsü: $lnkPrograms"
Write-Host "  Hedef: $targetExe"
