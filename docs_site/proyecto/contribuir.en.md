# Contributing

Thank you for wanting to help! The full guide is in [`CONTRIBUTING.md`](https://github.com/Lessteps/NoteVault/blob/main/CONTRIBUTING.md). This is the summary.

## Before you start

1. Search the [issues](https://github.com/Lessteps/NoteVault/issues) to see if what you want to do already exists.
2. For a big change, open an issue first and tell us the idea.
3. Read the [code of conduct](https://github.com/Lessteps/NoteVault/blob/main/CODE_OF_CONDUCT.md).

## Set up the environment

```bash
git clone https://github.com/Lessteps/NoteVault.git
cd NoteVault/frontend
npm install
npm run electron:dev
```

## Before opening a Pull Request

```bash
cd frontend
npm run typecheck
npx vitest run
```

Logic changes come with their test. Changes that touch the vault format update `docs/VAULT_FORMAT.md` and the tests that pin it.

## License of your contributions

By contributing you agree that your contribution is published under the project's license (GPL-3.0-or-later). Sign your commits with `git commit -s` (Developer Certificate of Origin).

## Vulnerabilities

Do not open them as a public issue. Follow [`SECURITY.md`](https://github.com/Lessteps/NoteVault/blob/main/SECURITY.md).

## More about the architecture

The [Engineering](../ingenieria.md) section documents the whole system, including the [contribution and new modules guide](../07-implementation-y-multiplataforma/03-guia-de-contribucion-paso-a-paso.md) (in Spanish).
