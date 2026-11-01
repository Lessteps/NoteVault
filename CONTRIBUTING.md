# Contributing to NoteVault

Thanks for wanting to help. This guide explains how to do it without wasting time.

*[Leer en español](translations/es/CONTRIBUTING.md)*

## Before writing code

1. Search the [issues](https://github.com/Lessteps/NoteVault/issues) to see whether what you want to do already exists.
2. For a large change, open an issue with the idea first and wait for an answer.
3. Report bugs with the *Bug* template; ideas with the *Proposal* template.

## Environment

Requirements: Node.js 20+ and npm 10+.

```bash
git clone https://github.com/Lessteps/NoteVault.git
cd NoteVault/frontend
npm install
npm run electron:dev
```

## Project rules

- **Strict TypeScript.** `npm run typecheck` must pass.
- **Tests.** Every logic change comes with a test (`npx vitest run`). So do interface changes with new behavior.
- **Vault format.** If you change what is written to disk, update `docs/VAULT_FORMAT.md`, bump `FORMAT_VERSION` if it breaks compatibility, and adjust the tests that pin it.
- **IPC bridge.** A new API function is registered in `frontend/src/api/registry.ts` and in `frontend/src/lib/bridge.ts`; the contract test warns you if one of the two is missing.
- **Small, meaningful commits.** One change, one commit, one message that says why.

## Before opening the Pull Request

```bash
cd frontend
npm run typecheck
npx vitest run
```

Describe what changes, why, and how you tested it.

## License of your contributions and signing commits

The project is published under **GPL-3.0-or-later**. By submitting a contribution you agree that it is published under that license and declare that you have the right to do so ([Developer Certificate of Origin](https://developercertificate.org/)). Sign your commits:

```bash
git commit -s -m "feat: description"
```

## Content and brand

Paid content (study paths, note packs) is not in this repository and is not accepted as a contribution here. The name and logo are governed by [TRADEMARK.md](TRADEMARK.md).

## Conduct

Everyone who takes part commits to the [code of conduct](CODE_OF_CONDUCT.md).
