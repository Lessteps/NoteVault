# SDD Desktop Studio — Environment Setup

This project uses a stdlib virtual environment (`./.venv`) and declarative
dependency management via `pyproject.toml` (PEP 621).

## Setup — One-time

```bash
# Create the virtual environment
python -m venv .venv

# Install project dependencies (runtime + dev)
pip install -e .[dev]
```

### On Windows

```bat
python -m venv .venv
.venv\Scripts\pythonw.exe -m pip install -e .[dev]
```

## Running the Application

```bash
# From the venv (recommended)
source .venv/bin/activate
python run_app.py
# or
.venv\Scripts\pythonw.exe run_app.py

# From the global interpreter (if deps are also installed globally)
python run_app.py
```

## Running Tests

```bash
# From the venv
source .venv/bin/activate
QT_QPA_PLATFORM=offscreen python -m unittest discover -s tests
# or via mise
mise run test
```

### Windows

```bat
.venv\Scripts\activate
set QT_QPA_PLATFORM=offscreen
python -m unittest discover -s tests
```

## Launcher (Windows)

```bat
:: Iniciar_SDD_Studio.bat
:: Uses .venv\Scripts\pythonw.exe with missing-venv guard
```

## Rollback

To roll back this change:

```bash
deactivate 2>/dev/null || true
rm -rf .venv
rm pyproject.toml
rm mise.toml
rm README.md
:: Revert Iniciar_SDD_Studio.bat to original (bare pythonw)
```
