# NoteVault — Registro de Progreso del Paquete de Rendimiento

Bitácora de fases ejecutadas de acuerdo al plan en `docs/PERFORMANCE/PLAN.md`.

- **Fase 0 — Configuración de renderizado + Switches GPU (Proceso Main)**: commit `760aa8a`, tests green (`appConfig.test.ts`, switches antes de `app.whenReady()`, helper `readGpuStatus`).
- **Fase 1 — IPC + Bridge**: commit `962cf2c`, tests green (`app.test.ts` con get_rendering, set_rendering, gpu_status, relaunch_app, bridges y tipos).
- **Fase 2 — Panel de Configuración («Configuración»)**: commit `1d3fa6b`, tests green (`SettingsDialog.tsx`, botón de engranaje en IconRail, paleta de comandos, `appRendering.test.ts`).
- **Fase 3 — Modo de Rendimiento «Lite»**: commit `0726048`, tests green (overrides en `styles.css` bajo `[data-perf="lite"]` y `[data-motion="reduced"]`, neutralización de blurs, sombras, gradientes de canvas y precomputación de `--nv-active-line`).
- **Fase 4 — Optimizaciones de Renderizado de Nivel Superior**: commit `3492f11`, tests green (hook `useVirtualList`, virtualización de `FileTree`, `SearchPanel`, `BacklinksBar`, y `content-visibility: auto` en `.nv-prose > *`).
- **Fase 5 — Verificación y Documentación**: commit pendiente, tests green (`npm run typecheck`, 73 suites / 488 tests pasando en vitest, `npm run electron:build` generando `release/win-unpacked/NoteVault.exe`, y documentación en `docs/PERFORMANCE/README.md`).
