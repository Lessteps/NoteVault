# Feature: Último peso registrado en fila de ejercicio (Sobrecarga Progresiva)

## Contexto
Para aplicar sobrecarga progresiva sin fricción, el usuario necesita ver en la sesión de hoy qué peso y repeticiones logró en su sesión anterior más reciente sin tener que abrir la ficha de historial.
Se añade:
1. Carga de la sesión anterior (`date < day`) de ese ejercicio vía `api.exHistory(ex.id)`.
2. Indicador visual sutil `prev: {kg}kg × {reps}` en la fila (`ExerciseRow.tsx`), con tooltip explicativo.
3. Al hacer clic sobre `prev: ...`, autocompleta el peso y reps para no tipear de cero.
4. Tests unitarios en `ExerciseRow.test.tsx`.

## Evidencia
- Commit: `bb0b206` (`feat(ejercicio): ultimo peso registrado y clic para copiar en fila de ejercicio`)
- Vitest: 127/127 tests unitarios pasando en ejercicio (+1 test nuevo en `ExerciseRow.test.tsx`).
- Playwright: 15/15 tests E2E pasando (`exercise.spec.ts`, `exercise-piezas.spec.ts`, `exerciseGraph.spec.ts`).
- Build y TypeScript: `npm run build` y `tsc -b` limpios sin errores.

## Tareas

- [x] Task 1: Integrar carga y estado de `lastSession` en `ExerciseRow.tsx`.
- [x] Task 2: Renderizar el badge `prev: {kg}kg × {reps}` con clic para autocompletar en `ExerciseRow.tsx`.
- [x] Task 3: Añadir tests unitarios en `ExerciseRow.test.tsx`.
- [x] Task 4: Verificar suite completa (`tsc -b`, `vitest`, `playwright`).
- [x] Task 5: Consolidar evidencia y commit de unidad de trabajo.
