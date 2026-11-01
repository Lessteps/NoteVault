# Installation

## Windows (installer)

1. Download `NoteVault Setup <version>.exe` from the [Releases](https://github.com/Lessteps/NoteVault/releases) page.
2. Run it and follow the wizard.
3. Open NoteVault from the Start menu.

!!! note "Unsigned installer"
    While the installer is unsigned, Windows may show “Windows protected your PC”. Click **More info → Run anyway**. Always check that you downloaded it from the official repository.

## Linux and macOS (from source)

Requirements: **Node.js 20 or later** and **npm 10 or later**.

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
