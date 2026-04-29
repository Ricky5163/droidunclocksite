$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $repoRoot ".env"

if (-not $env:CLOUDFLARE_API_TOKEN -and (Test-Path $envPath)) {
  Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $parts = $line.Split("=", 2)
    if ($parts[0].Trim() -eq "CLOUDFLARE_API_TOKEN") {
      $env:CLOUDFLARE_API_TOKEN = $parts[1].Trim().Trim('"').Trim("'")
    }
  }
}

if (-not $env:CLOUDFLARE_API_TOKEN) {
  throw "CLOUDFLARE_API_TOKEN is not set. Add it to .env or set it in your shell before running npm run deploy."
}

Push-Location $repoRoot
try {
  npx --yes wrangler pages deploy . --project-name=droidunclocksite --branch=main
} finally {
  Pop-Location
}
