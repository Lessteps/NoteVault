# Feature: Perfil Atlético en Ejercicio (Peso y Objetivo)

Objetivo del usuario: "Me gustaria que en ejercicios se añada algo como tu peso y para que estas entrenando. Pero no se en que parte ponerlo o como ponerlo sin que moleste".
Respuestas del usuario:
1. Historial de pesos: sí (poder registrar evolución en el tiempo).
2. Objetivo: opciones típicas (hipertrofia, fuerza, definición, etc.).
3. Ubicación: Opción C recomendada (Pestaña "Cuerpo" en Progreso con objetivo, registro de pesaje e historial, sin estorbar la rutina diaria).

## Specs
- S1: En `VAULT_FORMAT.md` y `vaultFormat.ts`, definir la ruta `${DATA_DIR}/ejercicio/perfil.json` (`exercise_profile`).
- S2: En `exerciseManager.ts`, proveer métodos de lectura y escritura del perfil (`getProfile()`, `saveProfile(goal, goalNote)`, `addWeightEntry(date, weight)`, `removeWeightEntry(date)`). Valores por defecto sanos si no existe el archivo.
- S3: En `api/modules/exercise.ts` y `lib/bridge.ts`, exponer los endpoints correspondientes: `ex_profile()`, `ex_profile_save(...)`, `ex_weight_add(...)`, `ex_weight_remove(...)`.
- S4: En `components/exercise/Progress.tsx`, añadir la pestaña "Cuerpo" a `TABS` (`rejilla`, `musculos`, `cuerpo`, `anio`).
- S5: Implementar el componente `BodyProfile.tsx` (o `BodyProgress.tsx`):
  - Selector de objetivo típico (Hipertrofia, Fuerza / Potencia, Definición / Pérdida de grasa, Resistencia, Salud general / Mantenimiento) con nota opcional.
  - Registro de peso corporal actual / fecha (input numérico simple y botón registrar).
  - Métricas rápidas: peso actual, variación reciente (último pesaje vs anterior / vs mes).
  - Gráfica/lista limpia del historial de pesajes con opción de eliminar registro erróneo.
- S6: Integración y tests unitarios de core, api y componente.

## Tasks
- T1 (S1, S2): Modelo de datos en `vaultFormat.ts` y métodos en `exerciseManager.ts` con tests unitarios. (Route: inline, commit: a2867ca)
- T2 (S3): Exponer endpoints en `api/modules/exercise.ts`, `lib/bridge.ts` y store `exercise.ts` con tests. (Route: inline, commit: 43a56b9)
- T3 (S4, S5): Componente `BodyProfile` en la pestaña Progreso > Cuerpo con selector de objetivo e historial de pesos. (Route: inline, commit: 474d6ca)
- T4 (S6): Tests finales de integración, regresión y verificación completa. (Route: inline, commit: 6c750b3)

## Log
- L1: Solicitud inicial del usuario para añadir peso corporal e intención de entrenamiento en Ejercicio sin entorpecer el flujo habitual.
- L2: Implementación finalizada y verificada con 239 tests de ejercicio pasando sin regresiones.
