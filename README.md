<div align="center">

# NoteVault

**🇬🇧 English** · 🇪🇸 [Español](README.es.md)

</div>

> **🎯 Our goal:** to **surpass Obsidian and Notion** — your notes, your study plan and your whole life in one open, local-first app, with **constant updates**.

[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/Lessteps/NoteVault?label=release)](https://github.com/Lessteps/NoteVault/releases/latest)
[![Website](https://img.shields.io/badge/web-lessteps.com-4f46e5)](https://lessteps.com)
[![Instagram](https://img.shields.io/badge/Instagram-@lesstepscompany-E4405F)](https://www.instagram.com/lesstepscompany/)
[![YouTube](https://img.shields.io/badge/YouTube-Lessteps-FF0000)](https://www.youtube.com/channel/UC9NXc30n_PoqyDWnndQE2iQ)

![NoteVault note editor](landing/img/notas.png)

![NoteVault overview](landing/img/vista-general.png)

---

**Study, notes and personal management in one desktop app. Your data is plain files you own.**

NoteVault brings together Markdown notes, tasks, calendar, habits, goals, projects, finances, exercise, nutrition and a **Mentor** that builds and follows your study plan. Everything lives in a folder on your disk — no account, no server, no telemetry. AI is optional and your choice: an API, a local model or a prompt you paste yourself.

> **We are students with no funding or financial backing.** NoteVault is free and will stay free, but we need money to keep going: any help counts. [PayPal](https://paypal.me/lessteps) · Nequi/Bre-B `0093524288` · [more ways to support](#support-the-project)

## Why NoteVault — and why we aim to surpass Obsidian and Notion

Obsidian and Notion are great products and they set the bar. We are building the app that goes further:

| | **NoteVault** | Obsidian | Notion |
| :--- | :---: | :---: | :---: |
| Your data as plain local files | ✅ | ✅ | ❌ cloud |
| Open source | ✅ GPL-3.0 | ❌ | ❌ |
| Works with an existing Obsidian vault | ✅ | ✅ | ❌ |
| Study **Mentor**: plan that fits your dates, spaced reviews, daily pace per subject | ✅ built in | plugins | templates |
| Tasks, habits, goals, finances, exercise and nutrition in the same app | ✅ built in | plugins | templates |
| Editable, versioned AI “skills” that generate notes, maps and practice | ✅ | ❌ | ❌ |
| AI with your own API **or a local model** | ✅ | plugins | ❌ |
| No account required | ✅ | ✅ | ❌ |

**Where they are ahead today** — plugin ecosystems, mobile apps, real-time collaboration and polish. **That is the gap we are closing**, release after release.

### 🚀 Constant updates

We ship continuously. Every improvement lands in the open: see the [Releases](https://github.com/Lessteps/NoteVault/releases) and the [CHANGELOG](CHANGELOG.md). Next on the [roadmap](https://lessteps.com/docs/proyecto/hoja-de-ruta.html): Android, macOS, web, automatic updates and a signed installer.

## Features

- Markdown editor with live preview, links, formulas and canvases (`.canvas`).
- Tasks, projects, calendar, habits and goals.
- Finances, exercise (302 exercises with step-by-step instructions) and nutrition.
- **Mentor:** a study plan that always fits your dates, with spaced reviews, Pomodoro and the pace you need per subject.
- **Skills:** the instructions that generate notes, maps and practice — editable, with version history and automatic detection of outdated pieces.
- Open, documented vault format ([`docs/VAULT_FORMAT.md`](docs/VAULT_FORMAT.md)); compatible with Obsidian.

## Install

Everything is included — **nothing else to install**. Download from [Releases](https://github.com/Lessteps/NoteVault/releases):

- **Windows:** `NoteVault-Setup-<version>.exe` (installer) or `NoteVault-Portable-<version>.exe` (no install).
- **Linux:** `.deb` (Ubuntu/Debian) or `.AppImage`.
- **macOS:** from source for now (see below).

**From source (Windows, Linux, macOS):** requires Node.js 20+ and npm 10+.

```bash
git clone https://github.com/Lessteps/NoteVault.git
cd NoteVault/frontend
npm install
npm run electron:dev
```

## Development

```bash
cd frontend
npm run typecheck    # TypeScript types
npx vitest run       # unit tests
npm run test:e2e     # end-to-end tests with Electron (needs npx vite build)
npm run electron:build   # builds the installer into frontend/release/
```

## Documentation

Full docs at **<https://lessteps.com/docs/>** (Spanish: <https://lessteps.com/docs/es/>). Built with [MkDocs Material](https://squidfunnel.github.io/mkdocs-material/) from [`docs_site/`](docs_site/):

```bash
pip install -r requirements-docs.txt
mkdocs serve
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). To report a vulnerability, use [SECURITY.md](SECURITY.md). Ideas, bugs and pull requests are welcome.

## License

The code is published under **GPL-3.0-or-later** (see [LICENSE](LICENSE)); the documentation under CC BY-SA 4.0. The “NoteVault” name and logo are not licensed with the code ([TRADEMARK.md](TRADEMARK.md)). Third-party credits are in [CREDITS.md](CREDITS.md).

## Support the project

We are students with no funding or financial backing. NoteVault is free and open source, and any help, however small, lets us keep building it.

- **PayPal:** <https://paypal.me/lessteps>
- **Colombia (Bre-B / Nequi):** key `0093524288`
- **PayPal and Nequi QR code:** [view it here](https://drive.google.com/file/d/1ea34-aOhxh8nAmhpLI0lX2B1oQqEDQG6/view?usp=sharing)

Not able to donate? Star the repo ⭐, report bugs, improve the docs, or tell a friend.

## Contact

- ✉️ [lesstepscompany@gmail.com](mailto:lesstepscompany@gmail.com)
- 📸 [Instagram @lesstepscompany](https://www.instagram.com/lesstepscompany/)
- 👍 [Facebook](https://www.facebook.com/profile.php?id=61595351223179)
- ▶️ [YouTube](https://www.youtube.com/channel/UC9NXc30n_PoqyDWnndQE2iQ)

## About the name

**“NoteVault” is a provisional name** for the product. The company behind it is **Lessteps**. If the name changes, it will be announced in this repository.
