param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (!$OutputDirectory) { $OutputDirectory = Join-Path $root 'src\native' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
$wpf = Join-Path $framework 'WPF'
$refs = @('/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Net.Http.dll', '/r:System.Web.Extensions.dll', "/r:$wpf\PresentationCore.dll", "/r:$wpf\PresentationFramework.dll", "/r:$wpf\WindowsBase.dll", "/r:$framework\System.Xaml.dll")
& $compiler /nologo /target:winexe /optimize+ "/win32icon:$root\assets\multios.ico" @refs "/out:$OutputDirectory\multios-tray.exe" "$root\src\native\DesktopApp.cs"
if ($LASTEXITCODE -ne 0) { throw 'Native arayuz derlenemedi.' }
& $compiler /nologo /target:exe /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll "/out:$OutputDirectory\multios-clip.exe" "$root\src\native\ClipHelper.cs"
if ($LASTEXITCODE -ne 0) { throw 'Pano yardimcisi derlenemedi.' }
& $compiler /nologo /target:exe /optimize+ /r:System.Drawing.dll "/r:$wpf\PresentationCore.dll" "/r:$wpf\WindowsBase.dll" "/r:$framework\System.Xaml.dll" "/out:$OutputDirectory\multios-media.exe" "$root\src\native\MediaHelper.cs"
if ($LASTEXITCODE -ne 0) { throw 'Medya yardimcisi derlenemedi.' }
Write-Host "Native uygulama: $OutputDirectory\multios-tray.exe"
