$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'multiOS'
$installedApp = Join-Path $installRoot 'app'
$newPackage = Join-Path $root 'dist\multiOS.exe'
if (!(Test-Path -LiteralPath $newPackage)) { throw 'Once build:dist calistirin.' }
if ((Test-Path -LiteralPath $installRoot) -and ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Kurulum yolu yonlendirme iceriyor.' }
$active = $null
try { $active = Invoke-RestMethod -Uri 'http://127.0.0.1:5050/api/status' -TimeoutSec 3 } catch {}
if ($active -and @($active.transfers | Where-Object state -eq 'active').Count) { throw 'Devam eden aktarim var. Guncelleme bekletildi.' }
$backup = Join-Path $installRoot ('backups\rollback-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $backup | Out-Null
if (Test-Path -LiteralPath (Join-Path $installRoot 'multiOS.exe')) { Copy-Item -LiteralPath (Join-Path $installRoot 'multiOS.exe') -Destination $backup }
if (Test-Path -LiteralPath $installedApp) { Copy-Item -LiteralPath $installedApp -Destination (Join-Path $backup 'app') -Recurse }
$stateFile = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'multiOS\state.json'
$stateHash = if (Test-Path -LiteralPath $stateFile) { (Get-FileHash -LiteralPath $stateFile).Hash } else { $null }
$serverScript = Join-Path $installedApp 'src\server.js'
$installedPrefix = [IO.Path]::GetFullPath($installedApp).TrimEnd('\') + '\'
$targets = Get-CimInstance Win32_Process | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($installedPrefix, [StringComparison]::OrdinalIgnoreCase)) -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains($serverScript))
}
foreach ($target in $targets) { Stop-Process -Id $target.ProcessId -ErrorAction SilentlyContinue }
Start-Process -FilePath $newPackage -WorkingDirectory $root -WindowStyle Hidden
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    try {
        $status = Invoke-RestMethod -Uri 'http://127.0.0.1:5050/api/status' -TimeoutSec 2
        if ($status.version -eq '0.2.0') { $ready = $true; break }
    } catch {}
}
if (!$ready) { throw "Yeni surum baslatilamadi. Geri donus kopyasi: $backup" }
if ($stateHash -and (Get-FileHash -LiteralPath $stateFile).Hash -ne $stateHash) { throw 'Eslesme anahtari beklenmedik sekilde degisti.' }
Write-Host "multiOS $($status.version) native surum hazir. Eslesme anahtari korundu."
Write-Host "Geri donus kopyasi: $backup"
