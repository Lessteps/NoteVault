# Installation

NoteVault ships with everything it needs: **you do not have to install anything else** (no Node.js, no Python, no extra libraries). Download from the [Releases](https://github.com/Lessteps/NoteVault/releases) page.

## Windows

**Installer (recommended)**

1. Download `NoteVault-Setup-<version>.exe`.
2. Run it and follow the wizard. You can choose the folder.
3. Open NoteVault from the Start menu.

**Portable version (no install)**

1. Download `NoteVault-Portable-<version>.exe`.
2. Double-click it. It installs nothing and you can carry it on a USB stick. It takes a few seconds longer to open.

!!! note "Unsigned installer"
    While the installer is unsigned, Windows may show “Windows protected your PC”. Click **More info → Run anyway**. Always check that you downloaded it from the official repository.

## Linux

- **`.deb` package (Ubuntu, Debian and derivatives):** download `NoteVault-<version>-amd64.deb` and install it by double-clicking or with `sudo apt install ./NoteVault-<version>-amd64.deb`. It shows up in the applications menu.
- **AppImage:** download `NoteVault-<version>-x86_64.AppImage`, make it executable and open it. It needs FUSE 2 (`sudo apt install libfuse2t64`); without it, open it with `--appimage-extract-and-run`.

## macOS and development (from source)

There is no macOS package yet. Requirements: **Node.js 20 or later** and **npm 10 or later**.

```bash
git clone https://github.com/Lessteps/NoteVault.git
cd NoteVault/frontend
npm install
npm run electron:dev
```

## Build your own installer

```bash
cd frontend
npm run electron:build
```

It produces the installer in `frontend/release/`. The configured target today is Windows (NSIS).

## Check that everything works

```bash
cd frontend
npm run typecheck
npx vitest run
```

## Where NoteVault stores your data

| What | Where |
| :--- | :--- |
| Your content (the vault) | A folder you choose; `~/NoteVault` by default. |
| App settings | `~/.notevault/settings.json`, outside the vault. |

Uninstalling the app does not delete your vault.
