@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_VERSION=%APP_PYTHON_VERSION%"
if "%PYTHON_VERSION%"=="" if exist ".python-version" set /p PYTHON_VERSION=<.python-version
if "%PYTHON_VERSION%"=="" (
  echo [ERROR] .python-version not found
  exit /b 1
)

where pyenv >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pyenv not found. Please install pyenv-win first.
  exit /b 1
)

where uv >nul 2>nul
if errorlevel 1 (
  echo [ERROR] uv not found. Please install uv first.
  exit /b 1
)

set "PORT=%PORT%"
if "%PORT%"=="" set "PORT=8015"
set "PYENV_VERSION=%PYTHON_VERSION%"
for /f "usebackq delims=" %%i in (`pyenv which python 2^>nul`) do set "PYENV_PYTHON=%%i"

if not exist "%PYENV_PYTHON%" (
  echo [ERROR] pyenv could not find Python %PYTHON_VERSION%
  exit /b 1
)

echo [INFO] Project root: %CD%
echo [INFO] pyenv Python: %PYTHON_VERSION%
echo [INFO] Server URL: http://localhost:%PORT%
uv run --python "%PYENV_PYTHON%" python -m uvicorn backend.main:app --host 0.0.0.0 --port %PORT%
