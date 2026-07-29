Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('d:\cms - Copy\logo.png')
$h = 100
$w = [int](($h / $img.Height) * $img.Width)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, $w, $h)
$bmp.Save('d:\cms - Copy\logo_sm.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$img.Dispose()
Write-Host 'Logo resized successfully.'
