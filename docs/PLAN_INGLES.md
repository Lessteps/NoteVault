# Plan: sistema de estudio de Inglés (práctica, notas, canvas, skills)

Objetivo: que **Inglés** funcione como Matemáticas (temario por IA → teoría → mapas → matriz de competencias
→ práctica → repasos → registro de errores), pero con lo propio de un idioma: niveles MCER (A2 → C1), errores
por transferencia del español, vocabulario y escucha.

Reglas para quien ejecute esto: **no parar a preguntar**; todas las decisiones están cerradas abajo. Cada fase
termina con `npm run typecheck`, `npx vitest run` en verde, commit claro y, al final del plan, `git push origin main`
(y `npm run electron:build` porque el usuario abre la app por el `.exe`). Gastar pocos tokens: leer solo los archivos
citados.

---

## 0. Punto de partida (verificado en el código)

Ya sirve para cualquier materia, **incluido inglés**, sin tocar nada:
- Manifiesto de tema (`.practica.md`, `plan:` = matriz), repasos espaciados por tema (`<Materia>/Repaso/`) con
  calendario y recordatorios, registro de errores por competencia (`.notevault/estudio/aprendizaje/`), chat con
  tarjetas, generador de espacios de estudio (`api/modules/studySpace.ts`), detección de archivos (`core/fileKind.ts`).
- `subjectIdOf()` (`core/assistantActions.ts`) ya reconoce «inglés/english/idioma/gramática/vocabulario» → `english`.

Ya existe específico de inglés:
- `ENGLISH_SKILLS` (`core/practice/skills.ts`, espejo en `lib/skills.ts`): writing, rewrite, translate, cloze,
  true_false, explain, find_error.
- Disciplinas `english_grammar`, `english_vocabulary`, `english_writing` (`core/practice/disciplineCatalog.ts`
  ~L563-704): encuadre A2→C1 para hispanohablante y taxonomía de errores por transferencia.
- Herramientas: `EnglishVocabularyManager` (palabras con `level` CEFR y `mastery`, **sin fecha de repaso**),
  `api/modules/englishPlayer.ts` (subtítulos, `en_player_mine` extrae palabras), `components/english/EnglishPlayer.tsx`.
- Bóveda: `Inglés/00 Índice.md` (vacío). No hay temario, teoría ni `_skills` de inglés.

Lo que **no** funciona bien para inglés hoy:
1. `DEFAULT_SKILLS` (`core/defaultSkills.ts`: resumen_teorico, mapa, practica, temario, subtemas) están redactadas para
   matemáticas (`practica_skill` habla de drill/prove; los ejemplos son numéricos).
2. `core/practice/topicType.ts` no tiene rama para inglés: un tema como «Present perfect» se clasifica por palabras
   matemáticas y cae en `mixed` por defecto; `SKILL_FIT` (`skillSelection.ts` L33-54) solo trae `writing/rewrite/
   translate` como propias de inglés y **reutiliza** `cloze` (programación), `true_false/explain/find_error` (teóricas).
3. `buildExerciseGenerationPrompt` (`sessionBuilder.ts`) y `formatExerciseNote` no usan el encuadre de la disciplina
   ni escriben `discipline:` en los ejercicios (todo cae en `english_grammar`).
4. `study_space_propose` (`studySpace.ts`) propone áreas «por aprendizaje», no por nivel MCER ni por destreza.
5. No hay skills de **vocabulario de memoria**, **dictado/escucha** ni **habla**; el vocabulario no entra al
   calendario de repasos.

## 1. Decisiones cerradas

- **Estructura de la bóveda** (la crea el generador): `Inglés/<N Nivel — Bloque>/<N.M Tema>/`. Bloques por nivel y
  destreza, en este orden: `0 Fase 0 — Fundamentos`, `1 A2 — Gramática base`, `2 A2 — Vocabulario de trabajo y vida diaria`,
  `3 B1 — Gramática`, `4 B1 — Vocabulario y phrasal verbs`, `5 B1 — Escritura`, `6 B2 — Gramática`, `7 B2 — Vocabulario`,
  `8 B2 — Escritura`, `9 C1 — Uso avanzado`. Se generan por tandas (no todo de golpe).
- **Tipo de tema en idiomas**: punto gramatical = `mixed`; vocabulario/colocaciones/phrasal verbs = `procedural`;
  escritura = `procedural`; escucha = `procedural`. **Nunca `theoretical`** (no hay demostraciones): así `true_false`,
  `explain` y `find_error` siguen encajando en gramática (`mixed`) y se descartan en vocabulario.
- **Competencias nuevas** (subject `english`): `recall` (recordar vocabulario: ES→EN y EN→ES con contexto, sin ayuda,
  como el `drill` del vocabulario) y `dictation` (dictado: se da el texto en pantalla oculto tras «Mostrar» + el
  alumno reescribe de memoria/lo escucha con el reproductor; se corrige contra el texto). **Habla/shadowing queda fuera**
  de este plan (no hay reconocimiento de voz).
- **Contenido**: enunciados y ejemplos en **inglés**, instrucciones y explicaciones en **español**; nivel MCER del
  ejercicio siempre indicado; errores y correcciones (`description`/`fix`) siguen en inglés como el resto del corrector.
- **Contrato de la teoría de inglés** = el mismo que matemáticas (lo lee `frontend/tools/kb_canvas.ts` para generar el
  mapa del tema): `## Requiere`, `## Explicación` (`### Qué es`, `### Modelo mental`), `## Ejemplos` (`### Ejemplo N` con
  los 4 campos Contexto / Caso / Resultado esperado / Por qué funciona), `## Errores comunes` (Error / Síntoma / Causa /
  Solución), `## Conexiones`, `## Tarjetas`. En inglés, «Errores comunes» = errores de **transferencia del español**.

## 2. Fases

### Fase 1 — Skills por defecto de inglés
Archivos: `src/core/defaultSkills.ts`, `src/api/modules/studySpace.ts`, `src/core/defaultSkills.test.ts` (o
`studySpace.test.ts`).
1. Añadir `ENGLISH_SKILLS_TEXT` con las 5 notas: `resumen_teorico_skill` (contrato de arriba con ejemplos en inglés y
   glosa en español, sección «Falsos amigos / transferencia» dentro de Errores comunes), `mapa_skill` (igual que el
   de matemáticas), `practica_skill` (tabla de encaje para inglés: gramática → rewrite, find_error, cloze, true_false,
   explain, translate; vocabulario → recall, cloze, translate; escritura → writing, rewrite; **prohibido** drill/prove;
   niveles de dificultad = A2/B1/B2), `temario_skill` (áreas por nivel MCER y destreza, 6–12 temas por área, Fase 0
   solo si el nivel real lo exige), `subtemas_skill`.
2. `ensureDefaultSkills(root, folder, refresh, subjectId = "mathematics")`: si `subjectId === "english"` usa el juego de
   inglés; el resto igual. `studySpace.ts` le pasa `subjectId` (ya lo calcula con `subjectIdOf`).
3. Test: un espacio `english` recibe las skills de inglés (contienen «MCER» y no «drill»), uno de matemáticas
   sigue igual, y nunca se sobrescribe una skill editada por el usuario.
Commit: `feat(english): default _skills for English spaces`.

### Fase 2 — Tipo de tema y encaje de competencias
Archivos: `src/core/practice/topicType.ts`, `skillSelection.ts`, `skills.ts` + `lib/skills.ts` (espejo),
`modes.ts`, `disciplineCatalog.ts`, tests `topicType.test.ts`, `skillSelection.test.ts`.
1. `detectTopicType({name, subject})`: si `subject === "english"` → palabras de vocabulario/colocaciones/phrasal/
   falsos amigos/word formation → `procedural`; email/párrafo/ensayo/redacción/writing → `procedural`; resto → `mixed`.
   (Añadir el parámetro `subject` opcional; los llamadores actuales pasan `manifest.subject`.)
2. Skills nuevas `recall` y `dictation` en `ENGLISH_SKILLS` (ambos archivos), con `SKILL_FIT`: `recall` →
   `procedural`+`mixed`, `dictation` → `procedural`+`mixed`; `allowedDifficulties` 1–3 (recall/dictation), helper
   **no** permitido en `recall`.
3. `modes.ts`: modos `recall` y `dictation` (`act`, rúbrica, formato de respuesta) siguiendo `cloze`/`translate`.
   `disciplineCatalog.ts`: añadirlos a `modes` de `english_vocabulary` (`recall`) y de una disciplina nueva
   `english_listening` (`dictation`, encuadre A2→C1, errores típicos: contracciones, terminaciones -s/-ed, homófonos).
4. Tests: «Present perfect» → `mixed`; «Phrasal verbs» → `procedural`; un tema de inglés `procedural` descarta
   `prove/true_false`; `catalogFor("english")` incluye `recall` y `dictation`.
Commit: `feat(english): topic types and competencies for languages (recall, dictation)`.

### Fase 3 — Generadores conscientes del idioma
Archivos: `src/core/practice/sessionBuilder.ts`, `src/api/modules/studySpace.ts`, `src/core/practice/practicePlan.ts`,
tests `sessionBuilder.test.ts`.
1. `buildExerciseGenerationPrompt`: si `manifest.subject === "english"`, usar `disciplineFor(...).framing` y añadir:
   «enunciado en inglés, instrucciones en español, indica el nivel MCER, apunta a la transferencia del español». Escribir
   en el ejercicio `discipline:` (`english_grammar` | `english_vocabulary` | `english_writing` | `english_listening`
   según la skill: recall→vocabulary, writing/rewrite→writing, dictation→listening, resto→grammar) en
   `formatExerciseNote`.
2. `study_space_propose`: si la materia es inglés, el prompt de sistema pide áreas por nivel MCER y destreza (la lista de
   bloques de la sección 1) y numeración natural; conservar el resto.
3. `buildReevaluationMessages` / `buildSkillOptionsMessages`: para inglés, añadir al prompt la regla «un tema de idiomas
   es `mixed` o `procedural`, nunca `theoretical`» y el ejemplo de tipos.
4. Tests: el prompt de un tema de inglés contiene el encuadre y «MCER»; el ejercicio generado lleva `discipline`.
Commit: `feat(english): language-aware exercise, syllabus and plan prompts`.

### Fase 4 — Registro de errores y repasos para inglés
Archivos: `src/core/practice/learningLog.ts` (nada que cambiar, ya es por tema+competencia),
`src/core/englishVocabularyManager.ts`, `src/core/practice/reviewFiles.ts`.
1. Comprobar con un test que un intento de inglés crea `Inglés/Repaso/<tema>.md` y su registro de errores.
2. Vocabulario al calendario: añadir a `VocabItem` los campos `next_review` y `level_srs` (opcionales, migración
   tolerante en `sanitizeVocabItem`), `EnglishVocabularyManager.review(wordId, correct, today)` con la escalera
   `[1, 3, 7, 14, 30, 60]`, y `listReviews` devuelve además los repasos de palabras agrupados por `topic` de vocabulario
   como **un** elemento por tema (`kind: "vocab"`), de modo que el calendario los muestre sin cambiar su interfaz.
3. Tests: escalera, agrupación y que un fallo devuelve la palabra a mañana.
Commit: `feat(english): vocabulary reviews in the review calendar`.

### Fase 5 — Reproductor: dictado desde subtítulos
Archivos: `src/api/modules/englishPlayer.ts`, `src/components/english/EnglishPlayer.tsx`, test `englishPlayer.test.ts`.
1. `en_player_dictation(mediaId, seconds)`: toma la línea de subtítulo en curso (y la siguiente) y crea una nota
   ejercicio `type: exercise`, `mode: dictation`, `discipline: english_listening` en `Inglés/<bloque de escucha>/<tema>/
   Ejercicios/dictation/`, con el texto original como solución y el enlace al medio (`en_player_link`).
2. Botón «Dictado de esta frase» en el reproductor: crea la nota y la abre en la vista de práctica (el resto —corrección
   por la IA, registro de errores, repaso— ya existe).
3. Test del módulo con un subtítulo simulado.
Commit: `feat(english): dictation exercises from player subtitles`.

### Fase 6 — Canvas y mapas de inglés
Archivos: `src/core/defaultSkills.ts` (skill de canvas), `src/core/areaMap.ts` (sin cambios de código).
1. Añadir `canvas_skill` de inglés a `ENGLISH_SKILLS_TEXT`: mapa de **tiempos verbales** en línea de tiempo (pasado /
   presente / futuro con flechas etiquetadas «cuándo se usa»), mapa de **familias de palabras** y de **phrasal verbs
   por partícula**; siguen las reglas del vault (encabezado → nota «How to» → ejemplo; toda flecha con etiqueta).
2. Los mapas de área y de espacio ya salen de `buildAreaMapCanvas`/`buildSpaceMapCanvas` (`00 Mapa — …`,
   `00 Mapa de Inglés N`): comprobar que el nombre del espacio con nivel («Inglés 1») funciona con `fileKind`.
Commit: `feat(english): canvas skill (tense timeline, word families)`.

### Fase 7 — Prueba real con DeepSeek (obligatoria antes de dar por terminado)
1. Abrir la app con `--remote-debugging-port=9333` y, con «Generar espacio de estudio»: materia «Inglés», alcance
   «Solo `1 A2 — Gramática base` y `2 A2 — Vocabulario de trabajo`», carpeta «Inglés 1». Comprobar en disco: cada tema
   con teoría (pasa `generateConcept`), mapa del tema, `.practica.md` con `topic_type` `mixed`/`procedural`, **sin**
   `drill`/`prove`; mapas de área y de espacio; `00 Temario.md`.
2. Practicar un tema de gramática con cada competencia de su matriz respondiendo mal a propósito (patrón de
   `scratchpad/modes.mjs`): comprobar corrección, sección ERRORES y que aparece `Inglés 1/Repaso/<tema>.md`.
3. Activar «Activar registro de errores» en una competencia, fallar, generar otra sesión y verificar que los ejercicios
   nuevos atacan ese error.
4. Vocabulario: minar 3 palabras en el reproductor, practicar `recall`, ver el repaso en el calendario.
Capturas y notas en el commit.

## 3. Cierre

```bash
cd frontend
npm run typecheck && npx vitest run
npm run electron:build
git add -A && git commit -m "feat(english): study system for English (skills, topic types, generators, dictation, reviews)"
git push origin main
```

Orden recomendado si hay poco tiempo: Fase 1 → 2 → 3 → 7 (con lo mínimo de las otras). Las fases 4, 5 y 6 son
independientes entre sí.
