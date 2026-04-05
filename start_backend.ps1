param(
    [string]$PythonVersion = "",
    [string]$BindHost = "0.0.0.0",
    [int]$Port = 8015
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$pyenv = Get-Command pyenv -ErrorAction SilentlyContinue
if (-not $pyenv) {
    Write-Error "pyenv command not found. Please install pyenv-win first."
    exit 1
}

$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
    Write-Error "uv command not found. Please install uv first."
    exit 1
}

if (-not $PythonVersion) {
    $PythonVersion = (Get-Content (Join-Path $root ".python-version") -TotalCount 1).Trim()
}

$env:PYENV_VERSION = $PythonVersion
$pyenvPython = (& $pyenv.Source which python).Trim()
if (-not $pyenvPython -or -not (Test-Path $pyenvPython)) {
    Write-Error "pyenv could not find Python $PythonVersion. Run 'pyenv install $PythonVersion' first."
    exit 1
}

Write-Host "[INFO] Project root: $root"
Write-Host "[INFO] pyenv Python: $PythonVersion"
Write-Host "[INFO] Server URL: http://localhost`:$Port"

# Avoid the Windows uvicorn entrypoint trampoline path canonicalization error.
& $uv.Source run --python $pyenvPython python -m uvicorn backend.main:app --host $BindHost --port $Port
