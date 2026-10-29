# Plan de Reparación Integral: Modo Buscador / Navegador Web en NoteVault (Gemini 3.8 / Antigravity)

## 1. Resumen Ejecutivo y Diagnóstico Forense

El problema donde el navegador web muestra una pantalla completamente negra y no realiza búsquedas se debe a una combinación de 5 factores concretos en el renderer (React), los estilos CSS de `<webview>`, el gestor en el proceso principal (`browserManager.ts`), la configuración de Electron en Linux y la persistencia de estado corrupto en `localStorage`.

---

## 2. Causas Raíces Identificadas

### 2.1. Colapso de Estilo y Caja de Renderizado de `<webview>`
- **Archivo:** `frontend/src/components/web/BrowserPanel.tsx`
- **Causa:** `<webview>` es un Custom Element de Chromium. En especificación HTML/CSS su comportamiento por defecto es `display: inline`.
- Aunque tenga las clases `h-full w-full flex-1 border-none`, Tailwind v4 no aplica `display: flex` o `display: inline-flex` sobre un tag desconocido a menos que se especifique explícitamente (`flex` o `inline-flex`) o con estilo inline.
- Al revertir en el commit `d3c6c1b` el estilo `style={{ display: "flex", flex: 1, width: "100%", height: "100%" }}`, el `<webview>` colapsa su altura a 0 píxeles dentro del contenedor flex, dejando al descubierto el contenedor padre con fondo `#131317` (`bg-surface`), viéndose todo negro.

### 2.2. Falta de `key` en `BrowserPanel` y `useRef` Stale
- **Archivos:** `frontend/src/components/web/WebModule.tsx` y `frontend/src/components/web/BrowserPanel.tsx`
- **Causa:** En `WebModule.tsx`:
  ```tsx
  <BrowserPanel url={page.url} onPageState={...} />
  ```
  Al no tener `key={page.id}`, React reutiliza la misma instancia del componente.
- En `BrowserPanel.tsx`, la URL inicial del `<webview>` se captura con un ref:
  ```tsx
  const initialWebviewSrcRef = useRef(normalizeUrl(initialUrl));
  ```
  Este ref solo se evalúa una sola vez en el montaje. Si el usuario escribe una búsqueda o cambia de página, el tag `<webview src=...>` en el DOM no actualiza su atributo `src`, quedando congelado.

### 2.3. Envenenamiento de URL en `localStorage` (`https%3A`)
- **Archivos:** `frontend/src/lib/webUrl.ts`, `frontend/src/core/webStore.ts`, `frontend/src/store/webPages.ts`
- **Causa:** En la captura se aprecia la URL `https://www.google.com/search?q=https%3A`.
- Si el usuario introdujo accidentalmente `https:` en la barra, `normalizeUrl()` no detectó esquema completo (`://`), lo trató como texto plano de búsqueda y generó `https://www.google.com/search?q=https%3A`.
- Dicho objeto quedó guardado en `localStorage["nv.webPages"]` con el título `https: - Buscar con Google`. Cada vez que NoteVault arranca, recupera esa página corrupta de la caché persistida.

### 2.4. Caída del Proceso GPU en Linux Wayland (Exit Code 133)
- **Archivo:** `frontend/electron/main.ts` y log `~/.config/notevault-ui/crash.log`
- **Causa:** En sistemas Linux con tarjetas gráficas híbridas (AMD Ryzen + NVIDIA en Wayland), flags como `--enable-gpu-rasterization` e incompatibilidades entre `--ozone-platform=wayland` y las superficies out-of-process de `<webview>` generan fallas críticas de GPU (`SIGTRAP` 133):
  ```
  [child-process-gone] {"type":"GPU","reason":"crashed","exitCode":133,"serviceName":"GPU"}
  ```
- Al caer el GPU process de Chromium, todas las vistas web (`<webview>`) pierden el framebuffer compositado y se pintan en negro puro sin responder.

### 2.5. Carrera Asíncrona en el Acoplamiento (`attachGuest`)
- **Archivo:** `frontend/electron/browserManager.ts`
- **Causa:** `BrowserPanel` llama a `api.browserAttach(bounds, url)` inmediatamente en `useEffect`. Sin embargo, el evento nativo de Electron `win.webContents.on("did-attach-webview")` se emite de forma asíncrona unos milisegundos después.
- Si `browserAttach` se procesa antes de que exista `this.guestWc`, la llamada a navegación no se ejecuta sobre el guest contents, quedando el navegador en blanco/negro si el `src` original no cargó.

---

## 3. Plan de Acción y Corrección Paso a Paso

### Paso 1: Sanitización Robusta de URLs y Limpieza de Páginas Corruptas
1. Modificar `frontend/src/lib/webUrl.ts` y `frontend/src/core/webStore.ts`:
   - Tratar cualquier variante de `https:`, `http:`, `https:/`, `http:/` o búsquedas de `https%3A` como entrada vacía que redirige a `https://www.google.com`.
2. Actualizar `frontend/src/store/webPages.ts`:
   - En `sanitizeStoredPage()`, si la página contiene `https%3A` o título `https: - Buscar con Google`, reemplazarla de inmediato por `https://www.google.com` y título `Google`.

### Paso 2: Corrección de Estilos y Montaje de `<webview>` en el Renderer
1. Modificar `frontend/src/components/web/BrowserPanel.tsx`:
   - Asegurar que la etiqueta `<webview>` tenga estilos inline explícitos obligatorios:
     ```tsx
     <webview
       ref={webviewRef}
       src={initialWebviewSrcRef.current}
       partition="persist:nvweb"
       allowpopups="true"
       className="h-full w-full flex-1 border-none"
       style={{ display: "flex", flex: 1, width: "100%", height: "100%" }}
     />
     ```
   - Escuchar directamente los eventos de carga de `<webview>` en el elemento DOM (`did-start-loading`, `did-stop-loading`, `did-fail-load`) como respaldo directo al renderer.
2. Modificar `frontend/src/components/web/WebModule.tsx`:
   - Añadir `key={page.id}` a `<BrowserPanel key={page.id} url={page.url} ... />` para garantizar ciclo de vida limpio y remonte de la superficie web al cambiar de pestaña.

### Paso 3: Sincronización y Robustez en `BrowserManager` (Proceso Main)
1. Modificar `frontend/electron/browserManager.ts`:
   - En `attachGuest(wc)`: si `this.currentUrl` tiene una URL pendiente que no sea `about:blank`, invocar de inmediato `wc.loadURL(this.currentUrl)` si no ha comenzado a cargar.
   - En `attach(bounds, url)`: guardar `this.pendingUrl = targetUrl`. Si `guestWc` aún no está presente, guardarla para que `attachGuest` la consuma al conectarse.
   - En `will-attach-webview` (`main.ts`): asegurar que `params.src` sea válido y nunca quede vacío (`about:blank` como fallback).

### Paso 4: Blindaje del Proceso GPU en Linux
1. Modificar `frontend/electron/main.ts`:
   - En Linux, verificar si hay Wayland activo o si la GPU experimentó fallas previas.
   - Añadir `--disable-features=UseChromeOSDirectVideoDecoder` y evitar flags conflictivos con la rasterización en segundo plano de webviews en Wayland.
   - Manejar el evento `app.on("child-process-gone")`: si el proceso es `GPU` con motivo `crashed`, reiniciar suavemente o degradar a rasterización por software sin congelar la ventana.

---

## 4. Matriz de Verificación y Comandos

| Verificación | Comando / Acción | Criterio de Éxito |
|---|---|---|
| Pruebas Unitarias Web | `npm --prefix frontend test src/components/web/` | 9/9 tests pasando |
| Verificación de Tipos | `npm --prefix frontend run typecheck` | 0 errores TypeScript |
| Prueba de Carga del Navegador | Abrir NoteVault en modo dev (`npm --prefix frontend run dev`) | Google carga visualmente en `<webview>`, sin pantalla negra |
| Prueba de Búsqueda | Escribir un término (ej. "wikipedia") en la barra de URL | Navega a Google Search y muestra resultados |
| Cambio de Pestañas | Abrir 2 páginas en el riel y alternar entre ellas | Cada página conserva su estado y carga al seleccionarse |

