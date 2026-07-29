$files = @('index.html', 'doctors.html', 'appointments.html', 'notifications.html', 'payments.html', 'settings.html', 'specialties.html', 'reports.html', 'reception.html', 'login.html')
foreach ($f in $files) {
  $path = "d:\cms - Copy\admin\$f"
  if (Test-Path $path) {
    $content = [System.IO.File]::ReadAllText($path)
    # The admin logo is usually: <i class="fa-solid fa-laptop-medical" style="color: var(--primary-color);"></i>
    # Let's replace the whole sidebar-logo content
    $content = $content -replace '(?s)<div class="sidebar-logo">.*?<span>', '<div class="sidebar-logo">
        <img src="../logo_sm.png" alt="Logo" style="max-height: 38px; width: auto; object-fit: contain;">
        <span>'
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Updated admin: $f"
  }
}
