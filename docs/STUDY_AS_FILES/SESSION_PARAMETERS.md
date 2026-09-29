# Parámetros de sesión y qué cuenta

Fase 2 del paquete de estudio. Dos cosas: los tres mandos de una sesión y, sobre
todo, **cuándo una sesión no cuenta** (estilo chess.com).

## Los tres mandos

Toda sesión de práctica se define con tres parámetros, que el configurador del tema
(`TopicConfiguratorDialog`) ya pedía y que el plan de sesión
(`SessionPlanResult`, `core/practice/sessionBuilder.ts`) devuelve explícitos:

| Mando | Valores | Qué hace |
| --- | --- | --- |
| Dificultad | 1 · 2 · 3 | Filtra los ejercicios por nivel (`difficulty:` del ejercicio). |
| Cantidad | 3-5 · 6-10 · todo | Cuántos ejercicios entran (`resolveTargetQuantity`). |
| Ayuda | `no_help` · `helper` | Si los ejercicios se generan con pistas/andaimes (`hints`). Con `helper`, la sesión admite pistas. |

Además, durante la sesión el ejercicio lleva su propio contador de pistas usadas y
una marca de si se vio la solución (`solution_seen`).

## Qué cuenta

Un intento cuenta para el **progreso**, la **maestría** del tema y la
**programación de repasos** solo si se cumplen las cuatro condiciones:

1. se llegó a calificar (`verdict` ≠ `ungraded`);
2. no se vio la solución;
3. no se usó ninguna pista ni la ayuda (`hints_used` = 0);
4. no se abandonó el ejercicio (`gave_up`).

Si falta alguna, el intento **se guarda igual** en el registro
(`.notevault/estudio/…`, con `counted: false` y `no_count_reason`), porque es
práctica, alimenta el registro de errores y se ve en el historial — pero no mueve
nada:

- no cambia el estado del skill (no pasa a «practicando» / «consolidado»);
- no suma bandas de dificultad superadas;
- no actualiza el «mejor» resultado;
- no reprograma la próxima revisión (el SRS no se toca);
- no cuenta para el mínimo de ejercicios por skill del tema.

Vuelve a contar cuando el ejercicio se **rehace sin ayuda**: el intento limpio entra
en el motor y la programación sigue donde estaba. No hay que «deshacer» nada: la
práctica con ayuda simplemente se ignora.

Implementación: `countAttempt` / `attemptCounts` en `core/practice/ledger.ts` (la
regla, en un sitio) y `replay()`, que es el motor de estado, bandas, intervalo y
próxima revisión: filtra los intentos que no cuentan antes de mover nada. El
registro lo escribe `applyResult` (`core/practice/errorLog.ts`), que además solo
llama al SRS cuando el intento cuenta. Los registros antiguos, que no traen
`counted`, se deducen de sus propios campos, así que el histórico no hay que
migrarlo.
