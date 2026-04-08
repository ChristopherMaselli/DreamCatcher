Add-Type -AssemblyName System.Drawing

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$centerX = $size / 2
$centerY = 108
$ringRect = New-Object System.Drawing.RectangleF(56, 36, 144, 144)

$outerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 122, 225, 207), 12)
$innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 134, 167, 255), 4)
$threadPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 210, 235, 238), 3)
$featherPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 247, 187, 124), 5)
$accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 122, 225, 207))
$featherBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 247, 187, 124))
$deepBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 88, 100, 217))

$graphics.DrawEllipse($outerPen, $ringRect)
$graphics.DrawEllipse($innerPen, 68, 48, 120, 120)

$points = @(
  [System.Drawing.PointF]::new($centerX, 60),
  [System.Drawing.PointF]::new(86, 92),
  [System.Drawing.PointF]::new(80, 132),
  [System.Drawing.PointF]::new(108, 162),
  [System.Drawing.PointF]::new($centerX, 170),
  [System.Drawing.PointF]::new(148, 162),
  [System.Drawing.PointF]::new(176, 132),
  [System.Drawing.PointF]::new(170, 92)
)
for ($i = 0; $i -lt $points.Count; $i++) {
  $next = ($i + 2) % $points.Count
  $graphics.DrawLine($threadPen, $points[$i], $points[$next])
}
foreach ($point in $points) {
  $graphics.FillEllipse($accentBrush, $point.X - 5, $point.Y - 5, 10, 10)
}
$graphics.FillEllipse($deepBrush, $centerX - 7, 108 - 7, 14, 14)

function Draw-Feather($graphics, $threadPen, $featherPen, $featherBrush, $startX, $startY, $length, $direction) {
  $endY = $startY + $length
  $endX = $startX + (12 * $direction)
  $graphics.DrawLine($threadPen, $startX, $startY, $endX, $endY)
  $graphics.DrawLine($featherPen, $endX, $endY, $endX - (16 * $direction), $endY + 22)
  $graphics.DrawLine($featherPen, $endX, $endY + 8, $endX + (12 * $direction), $endY + 26)
  $graphics.FillEllipse($featherBrush, $endX - 7, $endY + 20, 14, 18)
}

Draw-Feather $graphics $threadPen $featherPen $featherBrush 86 164 52 -1
Draw-Feather $graphics $threadPen $featherPen $featherBrush 128 180 58 0
Draw-Feather $graphics $threadPen $featherPen $featherBrush 170 164 52 1

$pngPath = 'src-tauri\icons\icon-dreamcatcher.png'
$icoPath = 'src-tauri\icons\icon.ico'
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create($icoPath)
$icon.Save($stream)
$stream.Close()

$graphics.Dispose()
$outerPen.Dispose()
$innerPen.Dispose()
$threadPen.Dispose()
$featherPen.Dispose()
$accentBrush.Dispose()
$featherBrush.Dispose()
$deepBrush.Dispose()
$icon.Dispose()
$bitmap.Dispose()
