# Feature: Coach de Entrenamiento IA en Ejercicio

Objetivo del usuario: "La idea es que en ese apartado de Ejercicios sea un coach de entrenamiento completo. Como lo implementamos obviamente vamos a testarlo conectandolo a una api de ia. Pero ojo esa ia tipo coach solamente tiene que quedar en ese apartado como asi que si me voy para el modulo de nota, Funcione ese modulo de notas y que no interfiera con la IA de Ejercicios".

## Specs
- S0: Base limpia: resolver los errores de compilación TypeScript en `BodyProfile.tsx`, `bridge.ts`, `exercise.ts` y tests para que `npm run typecheck` pase en verde.
- S1: Aislamiento estricto: el Coach de Entrenamiento solo se activa en `module === "ejercicio"`. El módulo `notas` y `mentor` mantienen sus asistentes independientes sin contaminación de estado, historial ni prompts.
- S2: Contexto del Coach: Generador de system prompt (`exerciseCoachPrompt.ts` o módulo correspondiente) que inyecte de forma estructurada y concisa:
  - Perfil atlético: objetivo (`goal`), notas (`goal_note`), peso actual y tendencia de pesajes (`weight_history`).
  - Rutinas actuales en el vault: nombres, ejercicios, series, repeticiones y días asignados.
  - Conocimiento de biblioteca: capacidad de sugerir ejercicios de `@bryllim/workout-guide` / Workout Guide.
- S3: Persistencia e Historial del Coach: Gestión de conversaciones aisladas del coach bajo el almacenamiento de ejercicio (`${DATA_DIR}/ejercicio/coach/` o archivo dedicado), con soporte para nueva conversación, renombrar, historial y borrado.
- S4: Store independiente: `useExerciseCoach` para manejar mensajes, streaming de respuesta, estado ocupado/espera, selección de modelo y persistencia aislada de `useAssistant` (notas) y `useMentor`.
- S5: Componente UI `ExerciseCoachAssistant`: Panel derecho específico de ejercicio con:
  - Encabezado con título del coach, botón de "Nueva conversación", historial y opciones.
  - Chips de sugerencias rápidas ("¿Cómo ajusto mi rutina para hipertrofia?", "¿Qué ejercicio reemplaza X?", "Analiza mi evolución de peso").
  - Renderizado de mensajes con markdown limpio y estado de generación/pensamiento.
- S6: Verificación y pruebas: Tests unitarios de core, api, store y componente, validando aislamiento estricto y typecheck limpio.
- S7: Acciones ejecutables del Coach: El Coach puede sugerir agregar uno o más ejercicios a un día específico (`lunes`..`domingo`) emitiendo un bloque estructurado `coach-action`. La UI renderiza una tarjeta interactiva con botón para aplicar los ejercicios al vault con un clic vía `api.exSave`, recargando `useExercise` en tiempo real.
- S8: Progreso profundo en System Prompt: inyectar el historial de cargas recientes levantadas (pesos, repeticiones y 1RM estimado) y cumplimiento de sesiones de los últimos 14 días.
- S9: Catálogo de biblioteca en System Prompt: inyectar conocimiento del catálogo Workout Guide y ejercicios propios del usuario (equipamiento y grupos musculares).
- S10: Acción `add_to_library`: el coach puede proponer crear ejercicios propios permanentes en la biblioteca con tarjeta interactiva `[ + Guardar en mi Biblioteca ]` vía `api.exLibrarySave`.

## Tasks
- T0 (S0): Limpieza de tipos y errores TypeScript en la rama actual (`npm run typecheck` en verde). (Route: inline, status: done)
- T1 (S2, S3): Core & API: Generador de contexto del coach y gestión de conversaciones de ejercicio aisladas. (Route: inline, status: done)
- T2 (S4): Store `useExerciseCoach`: Estado reactivo de chat, streaming e historial del coach. (Route: inline, status: done)
- T3 (S5): Componente `ExerciseCoachAssistant`: Interfaz del coach con chips de consulta rápida y chat. (Route: inline, status: done)
- T4 (S1): Integración en `AssistantPanel`: Renderizado condicional estricto por módulo (`ejercicio` -> `ExerciseCoachAssistant`). (Route: inline, status: done)
- T5 (S6): Pruebas unitarias de regresión y verificación completa. (Route: inline, status: done)
- T6 (S7): Parser y prompt de acciones del Coach (`splitCoachAction`, instrucciones de formato `coach-action`). (Route: inline, status: done)
- T7 (S7): Componente `CoachActionCard` e integración en `ExerciseCoachAssistant` con ejecución en `api.exSave`. (Route: inline, status: done)
- T8 (S7): Tests unitarios de parsing, renderizado y ejecución de acciones del Coach. (Route: inline, status: done)
- T9 (S8): Contexto de progreso profundo: inyectar cargas recientes y 1RM en prompt del Coach. (Route: inline, status: done)
- T10 (S9): Contexto de biblioteca: catálogo Workout Guide y biblioteca propia en prompt del Coach. (Route: inline, status: done)
- T11 (S10): Acción `add_to_library` en parser y tarjeta `CoachActionCard` con ejecución en `api.exLibrarySave`. (Route: inline, status: done)
- T12 (S8, S9, S10): Verificación completa, suite de tests y typecheck en verde. (Route: inline, status: done)

## Log
- L1: "La idea es que en ese apartado de Ejercicios sea un coach de entrenamiento completo. Como lo implementamos obviamente vamos a testarlo conectandolo a una api de ia"
- L2: "Pero ojo esa ia tipo coach solamente tiene que quedar en ese apartado como asi que si me voy para el modulo de nota, Funcione ese modulo de notas y que no interfiera con la IA de Ejercicios"
- L3: Implementación y verificación completadas: 56 tests de ejercicio y coach pasando, typecheck limpio (0 errores en tsc -b), vite build pasando y aislamiento estricto validado por tests en AssistantPanel.
- L4: Acciones ejecutables del Coach completadas: soporte para bloques `coach-action`, tarjeta `CoachActionCard` interactiva con botón de impacto directo en el vault vía `api.exSave`, 62 tests pasando y typecheck en verde.
- L5: Coach 100% omnisciente del módulo: lectura de cargas reales de los últimos 30 días con 1RM estimado, sesiones completadas, catálogo Workout Guide (302 ejercicios) y biblioteca propia, más acción interactiva `add_to_library` para guardar nuevos ejercicios en `.notevault/ejercicio/biblioteca.json`. 66 tests unitarios pasando, typecheck en verde y build verificado.
