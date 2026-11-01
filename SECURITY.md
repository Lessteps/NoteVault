# Security policy

*[Leer en español](translations/es/SECURITY.md)*

## Supported versions

Vulnerabilities are fixed in the latest published version.

## How to report a vulnerability

**Do not open a public issue.** Use GitHub's private reporting:
<https://github.com/Lessteps/NoteVault/security/advisories/new>

Include:

- what happens and what impact it has;
- steps to reproduce it;
- your NoteVault version and operating system.

We reply to confirm receipt as soon as possible and keep you informed about the fix. With your permission, we credit you in the release notes of the version that fixes it.

## What we consider a vulnerability

- Escaping the vault: reading or writing outside the chosen folder.
- Code execution from the content of a note or of someone else's vault.
- Leaking API keys or vault data.
- Failures in Electron's main process or the IPC bridge.

## Good practices for users

- API keys are stored in plain text in `~/.notevault/settings.json`, outside the vault. Do not push that folder to any repository.
- Only open vaults you trust.
