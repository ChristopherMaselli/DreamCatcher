Add-Type -AssemblyName System.Drawing

$sourcePath = 'IconImage.png'
$pngPath = 'src-tauri\icons\icon-dreamcatcher.png'
$icoPath = 'src-tauri\icons\icon.ico'

$source = [System.Drawing.Image]::FromFile((Resolve-Path $sourcePath))
$canvasSize = 512
$bitmap = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$scale = [Math]::Min($canvasSize / $source.Width, $canvasSize / $source.Height)
$drawWidth = [int]($source.Width * $scale)
$drawHeight = [int]($source.Height * $scale)
$offsetX = [int](($canvasSize - $drawWidth) / 2)
$offsetY = [int](($canvasSize - $drawHeight) / 2)

$graphics.DrawImage($source, $offsetX, $offsetY, $drawWidth, $drawHeight)
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create($icoPath)
$icon.Save($stream)
$stream.Close()

$graphics.Dispose()
$icon.Dispose()
$source.Dispose()
$bitmap.Dispose()
