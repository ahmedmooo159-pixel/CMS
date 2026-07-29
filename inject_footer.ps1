$footerHtml = @"
<footer style="margin-top: 3rem; padding: 1.5rem 0; border-top: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted);">
  <div>© 2026 إدارة العيادة. جميع الحقوق محفوظة.</div>
  <img src="../logo_sm.png" alt="Logo" style="max-height: 32px; width: auto; object-fit: contain;">
</footer>
"@

$publicFiles = @('index.html', 'doctors-list.html', 'appointment-booking.html', 'booking-form.html', 'confirmation.html')
foreach ($f in $publicFiles) {
  $path = "d:\cms - Copy\public\$f"
  if (Test-Path $path) {
    $content = [System.IO.File]::ReadAllText($path)
    if ($content -notmatch '<footer') {
      $content = $content -replace '</body>', "$footerHtml`r`n</body>"
      [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
      Write-Host "Added footer to public: $f"
    }
  }
}

$adminFiles = @('index.html', 'doctors.html', 'appointments.html', 'notifications.html', 'payments.html', 'settings.html', 'specialties.html', 'reports.html', 'reception.html')
foreach ($f in $adminFiles) {
  $path = "d:\cms - Copy\admin\$f"
  if (Test-Path $path) {
    $content = [System.IO.File]::ReadAllText($path)
    if ($content -notmatch '<footer') {
      $content = $content -replace '</main>', "$footerHtml`r`n    </main>"
      [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
      Write-Host "Added footer to admin: $f"
    }
  }
}
