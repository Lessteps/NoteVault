# Feature: Plantillas de rutina predefinidas (PPL, Torso/Pierna, Full Body)

## Contexto
Los usuarios que inician su programa o quieren cambiar de rutina se encuentran con 7 días vacíos y tienen que buscar 20-30 ejercicios uno por uno en la biblioteca.
Se añade:
1. `routineTemplates.ts`: 3 plantillas clásicas y estructuradas con ejercicios reales del catálogo (Push/Pull/Legs, Torso/Pierna, Full Body) con series, repeticiones y tiempos de descanso óptimos.
2. `RoutineTemplatesDialog.tsx`: Diálogo modal para explorar y seleccionar una plantilla con preview de días y ejercicios.
3. Botón "Plantillas" en la barra de herramientas de `Routine.tsx` y en el estado de "Programa vacío".
4. Reemplazo seguro con confirmación previa y notificación de éxito.
5. Tests unitarios en `routineTemplates.test.ts`.

## Evidencia
- Commit: `36da50d` (`feat(ejercicio): plantillas de rutina predefinidas PPL, Torso/Pierna y Full Body`)
- Vitest: Tests pasando al 100% (incluyendo `routineTemplates.test.ts`).
- Playwright: 15/15 tests E2E pasando (`exercise.spec.ts`, `exercise-piezas.spec.ts`, `exerciseGraph.spec.ts`).
- Build y TypeScript: `npm run build` y `tsc -b` limpios sin errores.

## Tareas

- [x] Task 1: Crear `routineTemplates.ts` con las 3 plantillas y tests unitarios en `routineTemplates.test.ts`.
- [x] Task 2: Crear diálogo modal de selección de plantillas con tarjetas descriptivas.
- [x] Task 3: Integrar botones de carga en `Routine.tsx` (en estado vacío y en barra de herramientas) con confirmación y refresco.
- [x] Task 4: Verificar suite completa (`tsc -b`, `vitest`, `playwright`).
- [x] Task 5: Consolidar evidencia y commit de unidad de trabajo.
