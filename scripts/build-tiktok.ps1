param(
    [string]$Python = 'python',
    [string]$TikTokSource = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($env:OS -ne 'Windows_NT') { throw 'This script builds the Windows TikTok worker only' }
Push-Location $projectRoot
try {
    $envRoot = Join-Path $projectRoot '.venv-tiktok'
    $envPython = Join-Path $envRoot 'Scripts/python.exe'
    if (!(Test-Path -LiteralPath $envPython)) {
        & $Python -m venv $envRoot
        if ($LASTEXITCODE -ne 0) { throw 'Could not create a Python environment; install Python 3.10 or newer' }
    }
    & $envPython -m pip --version *> $null
    if ($LASTEXITCODE -ne 0) {
        & $Python -m pip --python $envPython install pip
        if ($LASTEXITCODE -ne 0) { throw 'Could not bootstrap pip in the worker environment' }
    }
    & $envPython -m pip install -r tiktok/requirements-build.txt
    if ($LASTEXITCODE -ne 0) { throw 'Could not install TikTok dependencies' }
    if ($TikTokSource) {
        & $envPython -m pip install --no-deps --force-reinstall $TikTokSource
        if ($LASTEXITCODE -ne 0) { throw 'Could not install TikTokLive from the specified source' }
    }
    & $envPython -m unittest discover -s tiktok/tests -v
    if ($LASTEXITCODE -ne 0) { throw 'TikTok offline tests failed' }
    # onedir avoids a second bootloader process and onefile extraction at every launch.
    & $envPython -m PyInstaller --noconfirm --clean --onedir --console `
        --name livebox-tiktok --collect-all TikTokLive --collect-all TikTokLiveProto `
        --additional-hooks-dir tiktok/hooks `
        --collect-all EulerApiSdk --copy-metadata TikTokLive `
        --distpath .build/tiktok/dist --workpath .build/tiktok/work --specpath .build/tiktok `
        tiktok/worker.py
    if ($LASTEXITCODE -ne 0) { throw 'TikTok worker packaging failed' }
    $destination = [IO.Path]::GetFullPath((Join-Path $projectRoot 'src-tauri/tiktok-worker'))
    if ($destination -ne (Join-Path $projectRoot 'src-tauri\tiktok-worker')) { throw 'Invalid worker output directory' }
    # Only replace our generated output after successful packaging.
    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
    Copy-Item -LiteralPath '.build/tiktok/dist/livebox-tiktok' -Destination $destination -Recurse
    New-Item -ItemType Directory -Force -Path "$destination/licenses" | Out-Null
    & $envPython scripts/export-tiktok-licenses.py "$destination/licenses"
    if ($LASTEXITCODE -ne 0) { throw 'License export failed' }
    & $envPython tiktok/tests/check_worker.py "$destination/livebox-tiktok.exe"
    if ($LASTEXITCODE -ne 0) { throw 'Packaged worker smoke test failed' }
    Write-Host "TikTok Windows worker built: $destination"
} finally { Pop-Location }
