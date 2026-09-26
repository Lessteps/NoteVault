# Batch 10 — Cierre (cutover) para Antigravity

**Para: Antigravity.** Rama `main`, en la máquina Windows del usuario. La
migración de Python a TypeScript/Electron **ya está completa**: los 20 módulos
de la capa API están portados, la app arranca y el puente IPC funciona.
**467 tests verdes.** Tu trabajo aquí es cerrar: borrar el Python muerto,
actualizar docs y **generar el `.exe` final**.

## ⚡ ANTES DE EMPEZAR

```
cd frontend
git pull origin main
npm install
npm run typecheck        # debe salir limpio
npx vitest run           # deben ser ~467 verdes; si algo está rojo, PARA y arréglalo antes
```
Si typecheck o tests están en rojo, NO sigas con el borrado: arréglalo primero.

---

## TAREA A — Generar el `.exe` (esto es lo más importante; hazlo PRIMERO)

Estás en Windows, así que puedes construir el instalador real:

```
cd frontend
npm run electron:build
```

Esto corre typecheck + `vite build` + `electron-builder` y deja el instalador
NSIS en `frontend/release/`.

1. Si el build **falla**, copia el error completo y arréglalo antes de seguir.
   - Si se queja del icono (NSIS exige 256×256), crea un `frontend/build/icon.ico`
     de 256×256, o quita cualquier `icon` del campo `build` de `package.json`
     para usar el icono por defecto de Electron.
2. Cuando el build **pase**, **abre el `.exe` instalado y haz clic por CADA
   módulo** (Notas, Tareas, Hábitos, Calendario, Proyectos, Metas, Finanzas,
   Ejercicio, Estudio, Práctica, Canvas, WEB, Asistente IA, Reproductor de
   inglés, Vista general). Anota cualquier apartado que dé error en pantalla o
   en la consola (DevTools → Console). Reporta los fallos; si son pequeños
   (un método mal nombrado, un dato faltante), arréglalos en el módulo TS
   correspondiente y vuelve a construir.

**No borres nada de Python (Tarea B) hasta que el `.exe` abra y los módulos
respondan.** El Python es tu red de seguridad por si hay que comparar
comportamiento.

---

## TAREA B — Borrar el Python (solo cuando el `.exe` ya funcione)

Borra el código Python muerto. Todo está en git, es recuperable, pero es el
corte oficial.

```
git rm -r notevault_app
git rm run_app.py run_web.py app_entry.py launcher.py
git rm NoteVault.spec web_runtime.spec "Iniciar NoteVault.vbs" NoteVault.exe
git rm -r tests            # los 91 tests de pytest; los de verdad ahora están en frontend/src/**/*.test.ts
```

Config Python que ya no aplica (bórrala si existe y es solo de Python):
`pyproject.toml`, `mise.toml`, cualquier `requirements*.txt`.

**Deja `tools/` en paz** por ahora (son scripts de utilidad; no los ejecuta la
app). Si están claramente huérfanos, coméntalo con el usuario antes de borrar.

Tras borrar, **verifica que nada del frontend se rompió**:
```
cd frontend && npm run typecheck && npx vitest run
```
Deben seguir verdes (el frontend no depende de Python).

---

## TAREA C — Actualizar docs

- `docs/WEB_UI.md`: reescríbelo para describir la arquitectura Electron actual
  (proceso main Node con el core TS, preload con `window.nv.invoke`, un único
  `ipcMain.handle("nv", …)` que despacha al `registry`, renderer React sin
  cambios). Quita las menciones a pywebview / bridge HTTP / Python.
- `README.md`: actualiza cómo se corre y se construye la app:
  - Desarrollo: `cd frontend && npm install && npm run electron:dev`
  - Build del instalador: `cd frontend && npm run electron:build`
  - Quita instrucciones de Python (`run_web.py`, PyInstaller, etc.).

---

## TAREA D — (Opcional) Ventana WEB reforzada

Hoy `web_open` (en `frontend/src/api/modules/web.ts`) abre en el navegador del
sistema. El original abría una 2ª ventana pywebview con las restricciones
aplicadas dentro de la app, vigilada por `BrowserSession` (ya portado).

Si te da tiempo: cuando `app.window !== null`, crea una segunda
`BrowserWindow` de Electron, cárgale la URL, y arranca un `setInterval` de 1s
que llame a `BrowserSession.poll()` (adaptando la ventana a la interfaz
`BrowserLike`: `getCurrentUrl` → `win.webContents.getURL()`, `getTitle` →
`win.webContents.getTitle()`, `loadHtml` → `win.webContents.loadURL('data:text/html,'+encodeURIComponent(html))`).
Esto va en `electron/` o en el módulo, no rompas la ruta actual de fallback al
navegador del sistema. **Si no te da tiempo, déjalo — no bloquea nada.**

---

## Reglas

- **Nunca dejes typecheck ni vitest en rojo.** Verifica tras cada tarea.
- Commit por tarea y push:
  `git add -A && git commit -m "cutover: <qué>" && git pull --no-edit origin main && git push origin main`
- No toques `frontend/src/core/**` ni los módulos de `frontend/src/api/modules/**`
  salvo para arreglar un bug que veas al probar el `.exe`.

## Cuando termines

Avisa al usuario: el `.exe` está en `frontend/release/`, el Python está borrado,
y la app corre 100% en TypeScript/Electron. Di qué módulos probaste y si alguno
dio problemas.
