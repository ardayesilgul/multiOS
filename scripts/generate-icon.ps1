$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null

function New-MultiOSBitmap([int]$size) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $inset = [single][Math]::Max(0.5, $size * 0.025)
    $edge = [single]($size - 2 * $inset)
    $radius = [single]($edge * 0.22)
    $shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $shape.AddArc($inset, $inset, 2 * $radius, 2 * $radius, 180, 90)
    $shape.AddArc($inset + $edge - 2 * $radius, $inset, 2 * $radius, 2 * $radius, 270, 90)
    $shape.AddArc($inset + $edge - 2 * $radius, $inset + $edge - 2 * $radius, 2 * $radius, 2 * $radius, 0, 90)
    $shape.AddArc($inset, $inset + $edge - 2 * $radius, 2 * $radius, 2 * $radius, 90, 90)
    $shape.CloseFigure()
    $background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Black)
    $graphics.FillPath($background, $shape)

    $fontSize = [single]($size * $(if ($size -le 24) { 0.44 } else { 0.205 }))
    $bold = [System.Drawing.Font]::new('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $format = [System.Drawing.StringFormat]::GenericTypographic
    if ($size -le 24) {
        $width = $graphics.MeasureString('OS', $bold, [System.Drawing.PointF]::Empty, $format).Width
        $graphics.DrawString('OS', $bold, $white, [single](($size - $width) / 2), [single](($size - $fontSize * 1.3) / 2), $format)
    } else {
        $regular = [System.Drawing.Font]::new('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
        $firstWidth = $graphics.MeasureString('multi', $regular, [System.Drawing.PointF]::Empty, $format).Width
        $lastWidth = $graphics.MeasureString('OS', $bold, [System.Drawing.PointF]::Empty, $format).Width
        $x = [single](($size - $firstWidth - $lastWidth) / 2)
        $y = [single](($size - $fontSize * 1.3) / 2)
        $graphics.DrawString('multi', $regular, $white, $x, $y, $format)
        $graphics.DrawString('OS', $bold, $white, [single]($x + $firstWidth), $y, $format)
        $regular.Dispose()
    }

    $white.Dispose(); $bold.Dispose(); $background.Dispose(); $shape.Dispose(); $graphics.Dispose()
    return $bitmap
}

$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$images = foreach ($size in $sizes) {
    $bitmap = New-MultiOSBitmap $size
    if ($size -eq 256) { $bitmap.Save((Join-Path $assets 'multios.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
    $stream = [System.IO.MemoryStream]::new()
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $stream.ToArray()
    $bitmap.Dispose(); $stream.Dispose()
    [PSCustomObject]@{ Size = $size; Bytes = $bytes }
}

$file = [System.IO.File]::Create((Join-Path $assets 'multios.ico'))
$writer = [System.IO.BinaryWriter]::new($file)
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)
    $offset = 6 + 16 * $images.Count
    foreach ($image in $images) {
        $dimension = if ($image.Size -eq 256) { 0 } else { $image.Size }
        $writer.Write([byte]$dimension)
        $writer.Write([byte]$dimension)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$image.Bytes.Length)
        $writer.Write([uint32]$offset)
        $offset += $image.Bytes.Length
    }
    foreach ($image in $images) { $writer.Write([byte[]]$image.Bytes) }
} finally {
    $writer.Dispose()
}

Write-Host "multiOS icons: $(Join-Path $assets 'multios.ico')"
