# NoteVault — Arquitectura Electron (TypeScript + React)

NoteVault corre 100% como una aplicación de escritorio nativa basada en **Electron**, **TypeScript** y **React**.
Toda la lógica de negocio, validaciones y acceso a disco se ejecutan en el proceso principal de Node.js en TypeScript (`frontend/src/core/`), comunicándose con el renderer a través de IPC seguro.

## Arquitectura

1. **Proceso Main (Node.js + TS)**:
   - Punto de entrada: `frontend/electron/main.ts`.
   - Carga el core de NoteVault (`frontend/src/core/**`) y gestiona el estado global (`AppState`).
   - Expone la capa API mediante un único despachador IPC: `ipcMain.handle("nv", ...)`.
   - Cada método recibido se resuelve en el registro central (`frontend/src/api/registry.ts`).

2. **Preload Script**:
   - `frontend/electron/preload.ts`.
   - Con `contextIsolation: true` y `nodeIntegration: false`.
   - Expone únicamente `window.nv = { invoke: (method, args) => ipcRenderer.invoke("nv", method, args) }`.

3. **Renderer (React + Vite + Tailwind)**:
   - La interfaz de usuario (`frontend/src/`) se comunica a través de `frontend/src/lib/bridge.ts`.
   - Al detectar `window.nv`, invoca los métodos directamente por IPC con tipado estricto.

## Comandos

### Desarrollo

```bash
cd frontend
npm install
npm run electron:dev
```

### Ejecutar pruebas y verificación

```bash
cd frontend
npm run typecheck    # Verificación de tipos TypeScript
npx vitest run       # Suite completa de pruebas unitarias
```

### Construcción del instalador (Windows .exe)

```bash
cd frontend
npm run electron:build
```

Esto compila el cliente Vite, empaqueta el proceso Electron y genera el instalador NSIS en `frontend/release/NoteVault Setup 0.1.0.exe`.

## Seguridad

- **Aislamiento**: `contextIsolation` activado, `nodeIntegration` desactivado en toda la ventana de renderizado.
- **Validación de rutas**: Toda ruta entrante se confina al vault raíz (`..`, rutas absolutas no permitidas y carpetas internas como `.trash` quedan aisladas).
- **DOMPurify**: Todo el HTML generado a partir de Markdown es sanitizado contra inyecciones XSS.
- **Ventana blindada**: La ventana principal no navega a páginas externas; los enlaces web (`http`, `https`, `mailto`) se abren exclusivamente en el navegador predeterminado del sistema operativo mediante `shell.openExternal`.
- **Adjuntos seguros**: Confinados al directorio del vault con extensiones y límites de tamaño estrictos (15 MB).
