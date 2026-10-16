$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$distDir = Join-Path $root "dist"
$icoPath = Join-Path $root "assets\multios.ico"

Write-Host "==> multiOS Tekil Masaustu Paketi Uretiliyor..." -ForegroundColor Cyan

if (!(Test-Path $icoPath)) {
    Write-Host "--> multiOS ikonu uretiliyor..."
    & powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\generate-icon.ps1")
}

if (!(Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

Write-Host "--> 1. Win32 yerel yardimcilari kontrol ediliyor..."
& (Join-Path $root 'scripts\build-native.ps1')

Write-Host "--> 2. Uygulama demeti (bundle) sikistiriliyor..."
$tempStaging = Join-Path $env:TEMP ("multios_stage_" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempStaging -Force | Out-Null

foreach ($name in @('package.json', 'LICENSE')) { Copy-Item -LiteralPath (Join-Path $root $name) -Destination $tempStaging }
$nativeDir = Join-Path $tempStaging 'src\native'
New-Item -ItemType Directory -Force -Path $nativeDir | Out-Null
Copy-Item -Path (Join-Path $root 'src\*.js') -Destination (Join-Path $tempStaging 'src')
foreach ($name in @('multios-tray.exe', 'multios-clip.exe', 'multios-media.exe', 'MainWindow.xaml')) {
    Copy-Item -LiteralPath (Join-Path $root "src\native\$name") -Destination $nativeDir
}
Copy-Item -Path (Join-Path $root "public") -Destination (Join-Path $tempStaging "public") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root 'package-lock.json') -Destination $tempStaging
Push-Location $tempStaging
try {
    & npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Paket bagimliliklari kurulamadi.' }
} finally { Pop-Location }
$runtimeDir = Join-Path $tempStaging 'runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $runtimeDir 'node.exe')
$nodeVersion = & node.exe -p 'process.versions.node'
Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nodejs/node/v$nodeVersion/LICENSE" -OutFile (Join-Path $runtimeDir 'LICENSE')
$assetDir = Join-Path $tempStaging 'assets'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
foreach ($name in @('multios.ico', 'multios.png', 'ardayesilgul-signature.png', 'NOTICE.md')) {
    Copy-Item -LiteralPath (Join-Path $root "assets\$name") -Destination $assetDir
}

$zipPath = Join-Path $env:TEMP ("AppBundle_" + [Guid]::NewGuid().ToString("N") + ".zip")
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempStaging, $zipPath, [System.IO.Compression.CompressionLevel]::Fastest, $false)

$zipSize = (Get-Item $zipPath).Length
Write-Host ("    Bundle boyutu: " + [math]::Round($zipSize / 1MB, 2) + " MB")

Write-Host "--> 3. multiOS.exe tekil yuklenebilir dosyasi derleniyor..."
$outExe = Join-Path $distDir "multiOS.exe"
$launcherCs = Join-Path $root "src\native\Launcher.cs"

& $csc /nologo /target:winexe /optimize+ "/win32icon:$icoPath" /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll "/res:$zipPath,AppBundle.zip" "/out:$outExe" $launcherCs
if ($LASTEXITCODE -ne 0) { throw 'Launcher derlenemedi.' }

$resolvedStage = [IO.Path]::GetFullPath($tempStaging)
$resolvedTemp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (!$resolvedStage.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or !(Split-Path $resolvedStage -Leaf).StartsWith('multios_stage_')) { throw 'Gecici dizin dogrulanamadi.' }
Remove-Item -LiteralPath $resolvedStage -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue

if (Test-Path $outExe) {
    $exeSize = (Get-Item $outExe).Length
    Write-Host ("==> BASARILI: " + $outExe + " (" + [math]::Round($exeSize / 1MB, 2) + " MB)") -ForegroundColor Green
} else {
    Write-Host "==> HATA: Derleme tamamlanamadi." -ForegroundColor Red
    exit 1
}
