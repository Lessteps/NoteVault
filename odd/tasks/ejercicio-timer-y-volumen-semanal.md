# Feature: Temporizador de Descanso en Vivo y Analítica de Volumen Muscular Semanal en Ejercicio

Objetivo del usuario: "Haz el 2. Ejercicio: Temporizador de descanso en vivo (Rest Timer) y 3. Ejercicio: Analítica de volumen muscular semanal".

## Specs
- S1: Store y lógica del Temporizador de Descanso (`useRestTimer.ts`):
  - Estado reactivo: ejercicio activo, segundos totales, segundos restantes, estado de marcha (`running`), sonido activado.
  - Acciones: `start(exerciseName, seconds)`, `pause()`, `resume()`, `addSeconds(delta)`, `stop()`, `toggleSound()`.
  - Notificación de finalización mediante Web Audio API (doble tono armónico sin dependencias externas de archivos de audio).
- S2: Componente UI `RestTimerBar.tsx`:
  - Widget flotante no invasivo (`fixed bottom-4 right-6`) visible en todo el módulo de Ejercicio.
  - Indicador de tiempo en tipografía monospace (`MM:SS`), barra/anillo de progreso, nombre del ejercicio.
  - Botones de acción rápida: Pausar/Reanudar, `+30s`, Silenciar sonido y Saltar/Cerrar.
  - Estado de éxito al llegar a 0 con mensaje motivacional y auto-cierre opcional.
- S3: Disparo automático e interacción en `ExerciseRow.tsx` y montaje en `ExerciseModule.tsx`:
  - Al marcar como completada una serie (`done: true`), si el ejercicio tiene tiempo de descanso configurado (`ex.rest`), el temporizador se activa automáticamente.
  - El botón `⏱ {ex.rest}` en la fila activa o abre directamente el temporizador flotante.
  - Montaje de `RestTimerBar` en `ExerciseModule` para persistencia visual entre vistas.
- S4: Motor de cálculo de volumen muscular semanal (`volumeCalculator.ts`):
  - Parseo de series efectivas a partir de `series_reps` (ej. `4x10` -> 4 series, `3 x 8-12` -> 3 series).
  - Agrupación por grandes grupos anatómicos: Pecho, Espalda, Piernas, Hombros, Brazos, Core.
  - Asignación de volumen planificado (rutina semanal) y volumen completado en la semana activa.
  - Clasificación según literatura de hipertrofia: Mantenimiento (<6), Mínimo efectivo (6-10), Óptimo hipertrofia (10-20), Fatiga alta (>20).
- S5: Componente UI `WeeklyMuscleVolume.tsx`:
  - Sub-vista "Volumen semanal" en la pestaña "Músculos" de `Progress.tsx`.
  - Tarjetas por grupo muscular con barra de progreso, series completadas vs planificadas y desglose de ejercicios aportantes.
  - Resumen ejecutivo superior con métricas clave de la semana.
- S6: Verificación completa: Pruebas unitarias de timer, calculador de volumen y componentes UI, con typecheck `tsc -b` limpio.

## Tasks
- T1 (S1): Store `useRestTimer.ts`: Estado reactivo de descanso, temporizador y generador de audio Web Audio API + tests. (Route: inline, status: done)
- T2 (S2): Componente UI `RestTimerBar.tsx`: Widget flotante con barra de progreso, controles interactivos (+30s, pausa, sonido) + tests. (Route: inline, status: done)
- T3 (S3): Disparo automático en `ExerciseRow.tsx` y montaje en `ExerciseModule.tsx`. (Route: inline, status: done)
- T4 (S4): Lógica de cálculo `volumeCalculator.ts`: Parseo de series, asignación por grupo muscular y rangos de hipertrofia + tests. (Route: inline, status: done)
- T5 (S5): Componente UI `WeeklyMuscleVolume.tsx` e integración en `Progress.tsx` bajo la pestaña Músculos. (Route: inline, status: done)
- T6 (S6): Verificación completa con Vitest y typecheck `tsc -b`. (Route: inline, status: done)

## Log
- L1: Inicio de especificación de Temporizador de Descanso en vivo y Analítica de Volumen Muscular Semanal.
- L2: Implementación y verificación completadas: Store global useRestTimer con chime Web Audio API, widget flotante RestTimerBar persistente en todo el módulo con controles (+30s, pausar, silenciar), auto-activación al completar series en ExerciseRow, calculadora de volumen y rangos de hipertrofia volumeCalculator.ts, vista WeeklyMuscleVolume en Progreso > Músculos, 73 tests en verde y compilación tsc -b limpia con 0 errores.
- L3: Evolución interactiva del Rest Timer: Botón explícito "Iniciar ({rest})" en la fila del ejercicio. Al iniciarse vincula un callback onComplete que, al llegar a 00:00 o al pulsar "Listo", tilda automáticamente el ejercicio (done: true) y lo guarda en el Vault con api.exMark, emitiendo el chime sonoro y actualizando la sesión sin intervención manual.
