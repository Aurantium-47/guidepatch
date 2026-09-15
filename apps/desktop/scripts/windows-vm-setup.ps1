$ErrorActionPreference = 'Stop'
$HostUrl = 'http://10.0.2.2:__PORT__'
$Root = 'C:\mimik'

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User')
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '==> installing Node'
  winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  Refresh-Path
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host '==> enabling pnpm'
  corepack enable
  corepack prepare pnpm@latest --activate
  Refresh-Path
}

Write-Host '==> fetching source'
New-Item -ItemType Directory -Force -Path $Root | Out-Null
Invoke-WebRequest "$HostUrl/mimik-src.tar.gz" -OutFile "$env:TEMP\mimik-src.tar.gz"
Get-ChildItem $Root -Force |
  Where-Object { $_.Name -ne 'node_modules' } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
tar -xzf "$env:TEMP\mimik-src.tar.gz" -C $Root

Set-Location $Root
Write-Host '==> installing dependencies'
pnpm install

Write-Host '==> launching Mimik Desktop'
pnpm dev:desktop
