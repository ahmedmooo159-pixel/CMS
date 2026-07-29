$files = @('index.html', 'doctors-list.html', 'appointment-booking.html', 'booking-form.html', 'confirmation.html')
foreach ($f in $files) {
  $path = "d:\cms - Copy\public\$f"
  if (Test-Path $path) {
    $content = [System.IO.File]::ReadAllText($path)
    $content = $content -replace '<div class="portal-logo-icon".*?>.*?</div>', '<img src="../logo_sm.png" alt="Logo" style="max-height: 38px; width: auto; object-fit: contain; margin-left: 0.5rem;">'
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Updated: $f"
  }
}
