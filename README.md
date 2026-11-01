<div align="center">

# NoteVault

**🇪🇸 [Español](#español) · 🇬🇧 [English](#english)**

</div>

> **🎯 Our goal / Nuestra meta:** to **surpass Obsidian and Notion** — your notes, your study plan and your whole life in one open, local-first app, with **constant updates**.
> **Buscamos superar a Obsidian y Notion:** tus notas, tu plan de estudio y toda tu vida en una sola app abierta y local, con **actualizaciones constantes**.

[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/Lessteps/NoteVault?label=release)](https://github.com/Lessteps/NoteVault/releases/latest)
[![Website](https://img.shields.io/badge/web-lessteps.com-4f46e5)](https://lessteps.com)

![NoteVault note editor / Editor de notas](landing/img/notas.png)

![NoteVault overview / Vista General](landing/img/vista-general.png)

---

<a id="english"></a>

# 🇬🇧 English

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

We ship continuously. Every improvement lands in the open: see the [Releases](https://github.com/Lessteps/NoteVault/releases) and the [CHANGELOG](CHANGELOG.md). Next on the [roadmap](https://lessteps.com/docs/en/proyecto/hoja-de-ruta.html): Android, macOS, web, automatic updates and a signed installer.

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

Full docs at **<https://lessteps.com/docs/en/>** (Spanish: <https://lessteps.com/docs/>). Built with [MkDocs Material](https://squidfunnel.github.io/mkdocs-material/) from [`docs_site/`](docs_site/):

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

## About the name

**“NoteVault” is a provisional name** for the product. The company behind it is **Lessteps**. If the name changes, it will be announced in this repository.

---

<a id="español"></a>

# 🇪🇸 Español

**Estudio, notas y gestión personal en una app de escritorio. Tus datos son archivos tuyos.**

NoteVault reúne notas en Markdown, tareas, calendario, hábitos, metas, proyectos, finanzas, ejercicio, alimentación y un **Mentor** que arma y sigue tu plan de estudio. Todo vive en una carpeta de tu disco: sin cuenta, sin servidor y sin telemetría. La IA es opcional y la eliges tú: una API, un modelo local o un prompt que pegas tú.

> **Somos estudiantes y no tenemos apoyo ni sustento económico.** NoteVault es gratis y seguirá siéndolo, pero necesitamos dinero para continuar: cualquier ayuda sirve. [PayPal](https://paypal.me/lessteps) · Nequi/Bre-B `0093524288` · [más formas de apoyar](#apoyar-el-proyecto)

## Por qué NoteVault — y por qué buscamos superar a Obsidian y Notion

Obsidian y Notion son productos excelentes y ponen el listón alto. Estamos construyendo la app que va más lejos:

| | **NoteVault** | Obsidian | Notion |
| :--- | :---: | :---: | :---: |
| Tus datos como archivos locales | ✅ | ✅ | ❌ nube |
| Código abierto | ✅ GPL-3.0 | ❌ | ❌ |
| Funciona con una bóveda de Obsidian | ✅ | ✅ | ❌ |
| **Mentor** de estudio: plan que cabe en tus fechas, repasos espaciados, ritmo diario por asignatura | ✅ incluido | plugins | plantillas |
| Tareas, hábitos, metas, finanzas, ejercicio y alimentación en la misma app | ✅ incluido | plugins | plantillas |
| «Skills» de IA editables y versionadas que generan notas, mapas y práctica | ✅ | ❌ | ❌ |
| IA con tu propia API **o un modelo local** | ✅ | plugins | ❌ |
| No exige cuenta | ✅ | ✅ | ❌ |

**Dónde van por delante hoy:** ecosistema de plugins, apps móviles, colaboración en tiempo real y pulido. **Esa es la distancia que estamos cerrando**, versión tras versión.

### 🚀 Actualizaciones constantes

Publicamos de forma continua. Cada mejora llega a la vista de todos: mira las [Releases](https://github.com/Lessteps/NoteVault/releases) y el [CHANGELOG](CHANGELOG.md). Lo próximo en la [hoja de ruta](https://lessteps.com/docs/proyecto/hoja-de-ruta.html): Android, macOS, web, actualizaciones automáticas e instalador firmado.

## Características

- Editor Markdown con vista previa en vivo, enlaces, fórmulas y lienzos (`.canvas`).
- Tareas, proyectos, calendario, hábitos y metas.
- Finanzas, ejercicio (302 ejercicios con instrucciones) y alimentación.
- **Mentor:** plan de estudio que siempre cabe en tus fechas, con repasos espaciados, Pomodoro y el ritmo necesario por asignatura.
- **Skills:** las instrucciones con las que se generan notas, mapas y práctica; editables, con historial y detección automática de piezas desactualizadas.
- Formato de bóveda abierto y documentado ([`docs/VAULT_FORMAT.md`](docs/VAULT_FORMAT.md)); compatible con Obsidian.

## Instalación

Todo va incluido: **no necesitas instalar nada más**. Descarga desde [Releases](https://github.com/Lessteps/NoteVault/releases):

- **Windows:** `NoteVault-Setup-<versión>.exe` (instalador) o `NoteVault-Portable-<versión>.exe` (sin instalar).
- **Linux:** `.deb` (Ubuntu/Debian) o `.AppImage`.
- **macOS:** por ahora, desde el código fuente (abajo).

**Desde el código fuente (Windows, Linux, macOS):** requiere Node.js 20+ y npm 10+.

```bash
git clone https://github.com/Lessteps/NoteVault.git
cd NoteVault/frontend
npm install
npm run electron:dev
```

## Desarrollo

```bash
cd frontend
npm run typecheck    # tipos TypeScript
npx vitest run       # pruebas unitarias
npm run test:e2e     # pruebas end-to-end con Electron (requiere npx vite build)
npm run electron:build   # genera el instalador en frontend/release/
```

## Documentación

Documentación completa en **<https://lessteps.com/docs/>** (inglés: <https://lessteps.com/docs/en/>). Hecha con [MkDocs Material](https://squidfunnel.github.io/mkdocs-material/) desde [`docs_site/`](docs_site/):

```bash
pip install -r requirements-docs.txt
mkdocs serve
```

## Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md) y el [código de conducta](CODE_OF_CONDUCT.md). Para reportar una vulnerabilidad, usa [SECURITY.md](SECURITY.md). Ideas, errores y pull requests son bienvenidos.

## Licencia

El código se publica bajo **GPL-3.0-or-later** (ver [LICENSE](LICENSE)); la documentación, bajo CC BY-SA 4.0. El nombre y el logo «NoteVault» no se licencian con el código ([TRADEMARK.md](TRADEMARK.md)). Los créditos de terceros están en [CREDITS.md](CREDITS.md).

## Apoyar el proyecto

Somos estudiantes y no tenemos apoyo ni sustento económico. NoteVault es libre y gratuito, y cualquier ayuda, por pequeña que sea, nos permite seguir desarrollándolo.

- **PayPal:** <https://paypal.me/lessteps>
- **Colombia (Bre-B / Nequi):** llave `0093524288`
- **Código QR de PayPal y Nequi:** [verlo aquí](https://drive.google.com/file/d/1ea34-aOhxh8nAmhpLI0lX2B1oQqEDQG6/view?usp=sharing)

¿No puedes donar? Dale una estrella al repo ⭐, reporta errores, mejora la documentación o cuéntaselo a alguien.

## Sobre el nombre

**«NoteVault» es un nombre provisional** del producto. La empresa que lo representa es **Lessteps**. Si el nombre cambia, se anunciará en este repositorio.
