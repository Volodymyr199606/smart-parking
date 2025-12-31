# PowerShell script to generate JWT_SECRET
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes)
Write-Host "JWT_SECRET=$secret" -ForegroundColor Green
Write-Host ""
Write-Host "Copy the value above and use it in Render environment variables"

