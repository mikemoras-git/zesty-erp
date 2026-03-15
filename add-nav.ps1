# Run this in PowerShell from your zesty-erp folder
# It adds the erp-nav.js script tag to all HTML files

$folder = "C:\Users\Mike\Desktop\Claude\zesty-erp"
$files = Get-ChildItem -Path $folder -Filter "*.html" | Where-Object {
    $_.Name -notmatch "diag|supabase-setup|fix-cleaning|tasks-import|employee-profile"
}

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    # Skip if already added
    if ($content -match "erp-nav\.js") {
        Write-Host "SKIP (already has nav): $($file.Name)"
        continue
    }
    
    # Add script tag before </body>
    $newContent = $content -replace "</body>", "<script src=`"erp-nav.js`"></script>`n</body>"
    
    Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline
    Write-Host "DONE: $($file.Name)"
}

Write-Host ""
Write-Host "All done! Now run:"
Write-Host "  git add -A"
Write-Host "  git commit -m 'Add sidebar navigation'"
Write-Host "  git push origin main"
