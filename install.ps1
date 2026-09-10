#Requires -Version 5.1
<#
.SYNOPSIS
  Installs the ui-change-preview skill into ~/.claude/skills.
.PARAMETER Force
  Overwrite an existing install.
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'

$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Name    = 'ui-change-preview'
$Dest    = Join-Path $HOME ".claude\skills\$Name"

if ((Test-Path $Dest) -and -not $Force) {
  Write-Host "  $Name is already installed at $Dest"
  Write-Host "  Re-run with -Force to overwrite."
  exit 0
}

New-Item -ItemType Directory -Force -Path (Join-Path $Dest 'scripts') | Out-Null
Copy-Item (Join-Path $RepoDir 'SKILL.md') (Join-Path $Dest 'SKILL.md') -Force
Copy-Item (Join-Path $RepoDir 'scripts\*.mjs') (Join-Path $Dest 'scripts') -Force

Write-Host "  installed $Name -> $Dest"
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "  ! Node was not found on PATH. This skill needs Node 18+."
} else {
  # Single-quoted here: backtick escapes are literal in PowerShell single quotes,
  # so keep the message to one line rather than embedding a newline.
  $probe = 'try{require.resolve("playwright");console.log("  playwright: found")}catch(e){console.log("  ! playwright not found. Install: npm i -D playwright && npx playwright install chromium")}'
  & node -e $probe
}

Write-Host ""
Write-Host "  Restart Claude Code (or reload the window) to pick it up."
