# NoteVault

NoteVault es un entorno de estudio, gestión personal y toma de notas construido con **Electron**, **TypeScript** y **React**.

## Requisitos previos

- **Node.js**: v20+ o v22+
- **npm**: v10+

## Instalación y Desarrollo

```bash
cd frontend
npm install
npm run electron:dev
```

## Pruebas y Control de Calidad

```bash
cd frontend
npm run typecheck    # Verificación de tipos TypeScript
npx vitest run       # Pruebas unitarias de core y API
```

## Compilación y Generación del Instalador (.exe)

En Windows, ejecuta:

```bash
cd frontend
npm run electron:build
```

Esto generará el instalador ejecutable en `frontend/release/NoteVault Setup 0.1.0.exe` y la versión portable desempaquetada en `frontend/release/win-unpacked/NoteVault.exe`.

## Documentación adicional

Para detalles sobre la arquitectura IPC y seguridad de la aplicación, consulta [docs/WEB_UI.md](docs/WEB_UI.md).
