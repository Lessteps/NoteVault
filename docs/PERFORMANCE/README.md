# NoteVault — Rendimiento y Aceleración Gráfica

Este documento describe la arquitectura de rendimiento gráfico, los modos de renderizado y las optimizaciones introducidas en NoteVault.

## Contexto y Diagnóstico

En equipos con GPUs híbridas o entornos donde Chromium/Electron no inicializa el backend de GPU por hardware (`gpu_compositing: disabled_software`, `rasterization: disabled_software`), todo el pipeline de composición y rasterizado de la interfaz corre sobre la CPU.

Esto provoca latencia al redimensionar ventanas, alternar notas largas o interactuar con listas extensas si se utilizan efectos visuales de alto costo computacional (`backdrop-filter`, desenfoques blur, sombras multicapa, gradientes radiales procedurales en canvas y Live `color-mix` en cada frame).

Para resolver esto sin depender únicamente del soporte de hardware, NoteVault implementa dos vías complementarias:
1. **Configuración de aceleración por hardware y backends ANGLE**: Permite forzar switches GPU y seleccionar backend de gráficos.
2. **Modo Lite ("Reducir efectos visuales") y virtualización de listas**: Elimina el costo de rasterizado en CPU y procesa únicamente lo visible en pantalla.

---

## Modos de Renderizado

Se configuran desde el panel de **Configuración** (icono de engranaje en la barra de módulos izquierda o desde la paleta de comandos `Ctrl+Shift+P` → *Configuración*):

### 1. Modos de Renderizado (`mode`)
- **Automático (`auto`)**: Chromium decide la mejor estrategia disponible en el sistema.
- **Hardware (`hardware`)**: Fuerza flags para omitir la lista negra de GPUs (`ignore-gpu-blocklist`, `enable-gpu-rasterization`, `enable-zero-copy`).
- **Software (`software`)**: Desactiva explícitamente la aceleración por hardware (`app.disableHardwareAcceleration()`). Recomendado si el controlador GPU presenta inestabilidad o artefactos gráficos.

> **Nota sobre reinicio**: Cambiar el modo de renderizado o el backend ANGLE requiere reiniciar NoteVault para aplicar los switches de inicio de Electron. El panel incluye un botón directo de «Reiniciar para aplicar».

### 2. Backend de Gráficos ANGLE (`angle`)
Disponible cuando el modo no es *Software*:
- **Automático (`default`)**: Backend predeterminado de Chromium.
- **Direct3D 11 (`d3d11`)**: Backend nativo estándar en Windows.
- **D3D11on12 (`d3d11on12`)**: Traducción D3D11 sobre runtime DirectX 12.
- **OpenGL (`gl`)**: Backend basado en controladores OpenGL clásicos.
- **Direct3D 9 (`d3d9`)**: Modo de compatibilidad para hardware legacy.
- **Vulkan (`vulkan`)**: Habilita runtime Vulkan nativo en Chromium.

### 3. Reducir Efectos Visuales (`liteEffects`)
Aplica instantáneamente sin necesidad de reiniciar (`html[data-perf="lite"]`):
- **Eliminación de filtros y desenfoques**: `backdrop-filter: none` y `filter: none`.
- **Simplificación de sombras**: Sustituye `shadow-2xl`/`shadow-xl` por bordes sólidos limpios de 1px (`border-line-strong`) y sombras planas de bajo costo.
- **Eliminación de gradientes pesados**: En el canvas infinito, desactiva el `radial-gradient` procedural repetitivo, utilizando un fondo sólido neutro.
- **Precomputación de colores**: Sustituye llamadas en caliente a `color-mix(...)` (como la línea activa del editor CodeMirror o el hover en tablas) por variables CSS precalculadas (`--nv-active-line`).

### 4. Reducir Animaciones (`reduceMotion`)
Aplica instantáneamente (`html[data-motion="reduced"]` y `@media (prefers-reduced-motion: reduce)`):
- Desactiva transiciones CSS y animaciones secundarias para respuesta táctil inmediata.

---

## Optimizaciones de Renderizado de Nivel Superior

1. **Virtualización de listas (`useVirtualList`)**:
   - `FileTree`: En vaults con miles de archivos y múltiples carpetas desplegadas, la vista se aplana y solo se montan en el DOM los elementos visibles en el viewport (con un pequeño overscan de scroll).
   - `SearchPanel`: Los resultados de búsqueda global se calculan por ventana visible.
   - `BacklinksBar`: Listas de menciones y enlaces inversos virtualizadas sin límite arbitrario de 50 ítems.
2. **`content-visibility: auto` en Lectura (`ReadView`)**:
   - Cada bloque de la vista de lectura (`.nv-prose > *`) utiliza `content-visibility: auto` con `contain-intrinsic-size: auto 60px`. El motor omite el cálculo de layout y paint para todo contenido que esté fuera del viewport.
   - El desplazamiento directo a líneas (`scrollIntoView` de búsquedas y menciones) se mantiene intacto gracias al soporte nativo de Chromium.
3. **Viewport rendering en CodeMirror 6**:
   - El editor preserva la arquitectura nativa de renderizado por viewport, garantizando edición fluida incluso en notas de miles de líneas.

---

## Estado de GPU en Tiempo Real

El diálogo de Configuración consulta el estado real reportado por Chromium mediante IPC (`app.getGPUFeatureStatus()` y `app.getGPUInfo("basic")`):
- Si `gpu_compositing` está activo, muestra confirmación con el nombre de la tarjeta gráfica aceleradora.
- Si la composición se realiza por CPU (`disabled_software`), informa honestamente que el procesamiento es por software e invita al usuario a activar el modo *Reducir efectos visuales*.
