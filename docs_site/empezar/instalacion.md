# Instalación

## Windows (instalador)

1. Descarga `NoteVault Setup <versión>.exe` desde la página de [Releases](https://github.com/Lessteps/NoteVault/releases).
2. Ejecútalo y sigue el asistente.
3. Abre NoteVault desde el menú Inicio.

!!! note "Instalador sin firmar"
    Mientras el instalador no esté firmado, Windows puede mostrar «Windows protegió su PC». Pulsa **Más información → Ejecutar de todas formas**. Comprueba siempre que lo descargaste del repositorio oficial.

## Linux y macOS (desde el código fuente)

Requisitos: **Node.js 20 o superior** y **npm 10 o superior**.

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
