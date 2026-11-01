# Instalación

NoteVault lleva todo lo necesario dentro: **no tienes que instalar nada más** (ni Node.js, ni Python, ni otras librerías). Descarga desde la página de [Releases](https://github.com/Lessteps/NoteVault/releases).

## Windows

**Instalador (recomendado)**

1. Descarga `NoteVault-Setup-<versión>.exe`.
2. Ejecútalo y sigue el asistente. Puedes elegir la carpeta.
3. Abre NoteVault desde el menú Inicio.

**Versión portátil (sin instalar)**

1. Descarga `NoteVault-Portable-<versión>.exe`.
2. Haz doble clic. No instala nada y puedes llevarla en una memoria USB. Tarda unos segundos más en abrir.

!!! note "Instalador sin firmar"
    Mientras el instalador no esté firmado, Windows puede mostrar «Windows protegió su PC». Pulsa **Más información → Ejecutar de todas formas**. Comprueba siempre que lo descargaste del repositorio oficial.

## Linux

- **Paquete `.deb` (Ubuntu, Debian y derivadas):** descarga `NoteVault-<versión>-amd64.deb` e instálalo con doble clic o con `sudo apt install ./NoteVault-<versión>-amd64.deb`. Aparece en el menú de aplicaciones.
- **AppImage:** descarga `NoteVault-<versión>-x86_64.AppImage`, hazlo ejecutable y ábrelo. Necesita FUSE 2 (`sudo apt install libfuse2t64`); sin ella, ábrelo con `--appimage-extract-and-run`.

## macOS y desarrollo (desde el código fuente)

Todavía no hay paquete para macOS. Requisitos: **Node.js 20 o superior** y **npm 10 o superior**.

```bash
git clone https://github.com/Lessteps/NoteVault.git
cd NoteVault/frontend
npm install
npm run electron:dev
```

## Compilar tu propio instalador

```bash
cd frontend
npm run electron:build
```

Genera el instalador en `frontend/release/`. El objetivo configurado hoy es Windows (NSIS).

## Comprobar que todo funciona

```bash
cd frontend
npm run typecheck
npx vitest run
```

## Dónde guarda NoteVault tus datos

| Qué | Dónde |
| :--- | :--- |
| Tu contenido (la bóveda) | Una carpeta que eliges; por defecto `~/NoteVault`. |
| Ajustes de la app | `~/.notevault/settings.json`, fuera de la bóveda. |

Desinstalar la app no borra tu bóveda.
