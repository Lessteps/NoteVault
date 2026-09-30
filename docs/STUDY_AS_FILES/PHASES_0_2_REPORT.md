# Fases 0–2 del paquete de estudio: informes y registro de supuestos

Una entrada por decisión: **decisión · alternativas · por qué**. Las fases 3, 4 y 5
no están empezadas (§11).

## Informes por fase

### Fase 0a · la vista de carpeta tarda una eternidad — hecho (`3bfc4e7`)

- **Diagnóstico (medido, no supuesto).** Con el arnés `studyProfile.test.ts` sobre el
  vault real (2 107 notas, 593 carpetas): `scanVault` en frío = **29 954 ms** de E/S
  (0,35 ms por nota ya en caliente: el coste es abrir y leer, no CPU);
  el descubrimiento de temas, subiendo carpeta por carpeta y releyendo cada `.md`,
  = **2 680–3 042 ms** para 42 temas; `study_topic_dashboard` en frío = **3 097 ms**
  dentro del proceso principal, que además era lo que se llamaba al abrir la vista.
- **Arreglado.** Un solo `vaultScan` memoizado (antes: seis sitios llamaban a
  `scanVault` por su cuenta), los temas salen de las notas que el escaneo ya leyó
  (`manifestsFromNotes`, 16 ms, sin E/S), y el vault se lee **en segundo plano** por
  lotes 4 s después de arrancar (`warmNoteCache` con `setImmediate`), así que el
  primer clic no espera los 30 s y la ventana sigue viva mientras calienta.
- **Probado.** `study_topic_dashboard` en frío: 3 097 → **557 ms**, los mismos 42
  temas; `manifestsFromNotes` contrasta con el recorrido viejo en
  `manifestsFromNotes.test.ts` (3/3); suite completa verde; medido en la app
  empaquetada.
- **Riesgos que quedan.** El escaneo sigue siendo síncrono dentro del IPC: si el
  disco está muy frío, el primer estudio que abras puede seguir pagando parte del
  coste (memoizado a partir de ahí). La caché del escaneo caduca con el mismo TTL
  que los snapshots (30 s) más la invalidación explícita; el camino de escritura de
  notas (que no limpia esas cachés) puede dejar hasta 30 s de dato viejo, que ya era
  el comportamiento anterior.

### Fase 0b · notas que rompen al abrir — red entregada, causa no reproducida (`b3209db`)

- **Lo que pediste**: reproducir, encontrar qué tienen en común, arreglar y añadir
  una garantía de que una nota mala no pueda tumbar la app.
- **Reproducción: no la conseguí.** Abrí **las 2 107 notas** con los componentes
  reales y el core real (`vaultOpenProfile.test.ts`): **0 fallos** en modo lectura y
  **0 fallos** en modo editar (con CodeMirror y la vista indexada montados). El render
  puro de las 2 107 tampoco falla (`vaultRenderProfile.test.ts`, 0 fallos, la más
  lenta 855 ms). En la app empaquetada abrí las 9 más sospechosas (las 4 más grandes,
  una con incrustados, una materia entera, un `.practica`, un `.resumen`, un
  ejercicio): todas pintan y ninguna lanza excepción.
- **La garantía sí está.** `ErrorBoundary` alrededor de la superficie de la nota y
  del panel derecho (muestra qué nota y qué error, y la nota se sigue pudiendo abrir
  en crudo), `renderMarkdown` cae a texto plano si el parser falla, y la vista
  indexada se rinde sin marcas si construir sus rangos lanza.
- **Riesgos que quedan.** Sin la nota concreta que falla, esto sigue sin causa raíz:
  hace falta que me digas cuál es (o que la app te muestre ahora el aviso en vez de
  quedarse en blanco, que es la información que antes se perdía).

### Fase 1 · el problema sistémico de la práctica — hecho (`cc48244`)

- **Auditoría**: los 41 `.practica` del vault declaraban **los mismos 8 skills**.
  `1.1 Proposiciones y conectivos lógicos` ofrecía «Cálculo rápido».
- **Catálogo** con `competencies` y `topicTypes` por skill (drill = sólo
  procedimental), alta de skills propias del vault, y **tipo de tema** (`topic_type`)
  derivado de la evidencia: modos de los propios ejercicios (≥60 %), si no el nombre,
  si no mixto.
- **Selección detrás de una interfaz** (`SkillSelector`): sustituible por una IA sin
  tocar nada más.
- **Migración** de los 41 manifiestos (textual, idempotente, dry run por defecto):
  11 teóricos (8 → 5 skills, sin cálculo rápido), 8 procedimentales (8 → 3) y 22
  mixtos (8 → 6). Segunda pasada: 0 cambios.
- **Probado**: 11 tests unitarios del catálogo/selección/tipo + el plan sobre el
  vault real + suite completa verde.
- **Riesgos que quedan.** El tipo se apoya en los ejercicios existentes: un tema con
  ejercicios poco representativos puede quedar en `mixed`. La interfaz gráfica sigue
  leyendo `manifest.skills` directamente (`TopicConfiguratorDialog`): la fase 4 es la
  que la lleva al catálogo.

### Fase 2 · parámetros de sesión y «no cuenta» — hecho (`a4fb967`)

- Los tres mandos (dificultad, cantidad, ayuda) ya existían y el plan de sesión ahora
  los devuelve explícitos (`quantity`, `hints`).
- **Definido y documentado** (`docs/STUDY_AS_FILES/SESSION_PARAMETERS.md`): un
  intento cuenta si se calificó, no se vio la solución, no se usó pista y no se
  abandonó. Si no cuenta, se guarda con `counted: false` + motivo, alimenta el
  registro de errores, pero no mueve progreso, bandas, «mejor», SRS ni la próxima
  revisión; vuelve a contar al rehacerse sin ayuda.
- **Probado**: 8 tests nuevos + el motor (`replay`) filtrando, y dos tests previos
  actualizados a propósito con el porqué escrito al lado.
- **Riesgos que quedan.** La interfaz todavía no enseña «esta sesión no cuenta» (el
  API ya devuelve `counted`); el histórico no se migra porque la regla se deduce de
  sus campos (los intentos antiguos con pistas cambian de comportamiento: a partir de
  ahora no cuentan).

## Registro de supuestos

1. **Perfilar antes de tocar (fase 0a).** *Alternativas*: leer el código y optimizar
   lo que parecía caro. *Por qué*: el perfil contradijo la intuición (30 s de E/S, no
   CPU) y sin él habría optimizado la parte equivocada.
2. **Arreglar el coste, no esconderlo (fase 0a).** *Alternativas*: mover el escaneo a
   un worker thread; dejarlo y mostrar un spinner. *Por qué*: el API es síncrono en
   todo el core; un worker cambia el modelo de concurrencia por un bug de
   rendimiento. Quitar los dos costes medidos no cambia ningún contrato.
3. **Calentar 4 s después de crear la ventana (fase 0a).** *Alternativas*: al
   arrancar (compite con el primer pintado y con `stats`/`note_index`); no calentar
   (el primer clic paga 30 s). *Por qué*: deja pasar el arranque y mantiene la ventana
   viva gracias a los lotes con `setImmediate`.
4. **Declarar el bloqueo de la 0b en vez de inventar una causa.** *Alternativas*:
   culpar a algo plausible (los rangos de la vista indexada) sin evidencia. *Por qué*:
   sin la nota que falla, cualquier «arreglo» sería superstición; la garantía
   (ErrorBoundary + degradaciones) sí se podía entregar y se entregó.
5. **El tipo de tema sale de los modos de sus propios ejercicios.** *Alternativas*:
   sólo el nombre (frágil: «Teorema de Pitágoras» es aplicado); un campo declarado a
   mano (no existía); una IA (fase futura). *Por qué*: la evidencia está en los datos
   del usuario, es determinista y auditable, y hace que los 11 temas de lógica y
   demostración salgan teóricos por sus ejercicios, no por una lista de palabras.
6. **Sólo se estrechan los manifiestos que llevaban el catálogo entero.** *Por qué*:
   una lista corta es una decisión deliberada; el defecto era exactamente «las ocho de
   siempre».
7. **«Cálculo rápido» es sólo procedimental**, así que ni los temas teóricos ni los
   mixtos lo ofrecen. *Alternativas*: permitirlo en mixtos. *Por qué*: tu ejemplo
   («natural numbers and their theory») cae en mixto y no debía recibirlo.
8. **El catálogo va en un módulo nuevo** (`skillSelection.ts`) en vez de extender
   `skills.ts` en el sitio. *Alternativas*: cambiar `SkillDefinition` (más limpio a
   largo plazo, pero toca a todos los consumidores y al espejo del renderer).
   *Por qué*: la fase 1 debía ser aditiva; unificar es trabajo de la fase 4.
9. **Los registros antiguos no se migran (fase 2).** *Por qué*: la regla se deduce de
   los campos que ya tienen (`hints_used`, `solution_seen`, `verdict`), así que el
   histórico funciona sin tocarlo; un `counted` explícito manda cuando existe.
10. **Un intento con ayuda no arranca el skill** (queda `not_started`).
    *Alternativas*: dejarlo pasar a «practicando» pero sin consolidar (lo de antes).
    *Por qué*: «no actualiza el progreso» incluye el arranque; dos tests que decían lo
    contrario se actualizaron con el porqué escrito al lado.
11. **La práctica con ayuda sigue alimentando el registro de errores.** *Por qué*: el
    registro no es progreso, es evidencia de qué falla; borrarlo empobrecería el
    digest de errores.
12. **Los arneses son tests de vitest con puerta por variable de entorno**
    (`NV_VAULT`, `NV_MODE`, `NV_APPLY`), no scripts sueltos. *Alternativas*: scripts
    en un directorio temporal. *Por qué*: quedan en el repo, se ejecutan igual y
    sirven como regresión cuando toquemos estas zonas.
13. **Fases 3, 4 y 5: no empezadas.** *Alternativas*: empezarlas y dejar el build a
    medias. *Por qué*: presupuesto de la sesión tras tres commits verificados; es una
    decisión de alcance, no un bloqueo técnico — el estado está limpio y cada fase
    tiene su commit, así que se puede seguir desde la fase 3 sin deshacer nada.
