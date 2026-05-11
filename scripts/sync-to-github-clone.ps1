<#
.SYNOPSIS
	Copies this project into your GitHub clone, updates package name, commits, and pushes.

.PARAMETER ClonePath
	Path to the local clone (default: C:\Users\Evan\Documents\MADs-Crusty-CGA-Paint).

.EXAMPLE
	pwsh -File scripts/sync-to-github-clone.ps1
	pwsh -File scripts/sync-to-github-clone.ps1 -ClonePath "D:\repos\MADs-Crusty-CGA-Paint"
#>
param(
	[string] $ClonePath = "C:\Users\Evan\Documents\MADs-Crusty-CGA-Paint"
)

$ErrorActionPreference = "Stop"
$SourceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not (Test-Path $ClonePath)) {
	throw "Clone folder not found: $ClonePath`nPass -ClonePath to your GitHub clone directory."
}
$GitDir = Join-Path $ClonePath ".git"
if (-not (Test-Path $GitDir)) {
	throw "Not a git repo (missing .git): $ClonePath"
}

Write-Host "Copying from:`n  $SourceRoot`nto:`n  $ClonePath"
robocopy.exe $SourceRoot $ClonePath /E /XD node_modules dist .git /NFL /NDL /NJH /NJS | Out-Host
if ($LASTEXITCODE -ge 8) {
	throw "robocopy failed with exit code $LASTEXITCODE"
}

$pkgPath = Join-Path $ClonePath "package.json"
if (Test-Path $pkgPath) {
	$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
	$pkg.name = "mads-crusty-cga-paint"
	($pkg | ConvertTo-Json -Depth 10) + "`n" | Set-Content -Path $pkgPath -Encoding utf8
	Write-Host "Set package.json name to $($pkg.name)"
}

Push-Location $ClonePath
try {
	git add -A
	$st = git status --porcelain
	if ($st -eq "") {
		Write-Host "Nothing new to commit (already in sync)."
	} else {
		git commit -m "Sync app source for GitHub Pages"
	}
	Write-Host "Pushing to origin main..."
	git push -u origin main
	Write-Host "Done. Next: GitHub repo Settings -> Pages -> Source: GitHub Actions (if not already)."
} finally {
	Pop-Location
}
