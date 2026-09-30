# Programación: decisiones y supuestos (2026-09-30)

Registro de lo que se decidió sin preguntar al crear el espacio `Programación/` (los temarios y mapas; la teoría de cada
tema queda para la fase siguiente).

## Estructura
1. **Once carpetas de área**, en el orden del plan: `1 Fundamentos`, `2.1 Python`, `2.2 JavaScript`, `2.3 TypeScript`,
   `3 Apps de escritorio (Electron)`, `4 Backend`, `5 Frontend`, `6 Bases de datos`, `7 Automatización`, `8 Móvil`,
   `9 Herramientas y calidad`. La app solo tiene dos niveles (área → tema), así que los lenguajes son áreas de pleno derecho
   con temas numerados `2.1.N`.
2. **Fundamentos** tiene 75 temas en 13 unidades (computador → pensamiento algorítmico → datos → control de flujo → funciones →
   estructuras → errores y depuración → archivos → recursión y algoritmos → funcional → objetos y diseño → calidad y concurrencia →
   programación con IA). El resto de áreas: entre 13 y 23 temas. Total: 242.
3. **Los temas de los lenguajes** salen de los bloques de los temarios de `FULLSTACK_PRACTICE` (Python, JavaScript,
   TypeScript), agrupados; los de Backend, Frontend, Bases de datos y Git, de sus temarios y del plan de áreas.
4. **Nombres**: se cortan en el «:» y no pasan de 72 caracteres, para no chocar con el límite de ruta de Windows (el nombre del
   tema aparece dos veces en la ruta).
5. **Mapas**: cada área tiene su mapa con flechas etiquetadas (cabeza de unidad → temas de la unidad, cabeza → cabeza de la unidad
   siguiente y dependencias concretas entre temas). El mapa del espacio encadena las áreas; las dependencias reales entre áreas
   (p. ej. Backend apoya a Móvil) están descritas en `mapa_skill` pero aún no dibujadas.
6. **`00 Rutas por rol.md`** guarda tres rutas (Windows + automatización, backend + automatización, renovación móvil).
   `FULLSTACK_PRACTICE` y `FULLSTACK_DEVELOPMENT` no se tocaron (el segundo es un repositorio compartido).

## Competencias (skills)
7. Se añadieron **siete competencias** a las ocho que ya había: `trace`, `review` (incluye código de IA), `test`, `analyze`,
   `decompose`, `port`, `query`. `review`, `analyze` y `port` no tienen nivel principiante. El modo de traducción del inglés se
   llama `translate`; el de programación, `port`, para no mezclarlos.
8. **Siete disciplinas nuevas** por área (typescript, backend, frontend, desktop, automation, mobile, devtools) además de las
   cinco que existían. La disciplina de un ejercicio se deduce de la carpeta del área (`programmingDisciplineOfPath`).
9. **Los ejercicios de programación ya no usan el prompt de matemáticas** (teoremas, LaTeX): tienen su propio prompt, con el
   lenguaje según el área, código en el enunciado, salidas esperadas exactas y fallos de comportamiento.
10. **Las skills por defecto de un espacio de programación** (`_skills/`) son propias: nada de LaTeX, y solo se hereda de un
    espacio del MISMO dominio. Antes un espacio de programación recibía las notas de matemáticas.
11. Las tarjetas por defecto de cada tema son una selección por área/unidad (6–7 competencias); la matriz real (cuántos ejercicios
    por nivel) se decide después, tema a tema.

## Otros cambios
12. Los mapas de tema entienden el código: un `#` dentro de un bloque de código ya no se toma por un encabezado y el código
    de los ejemplos conserva sus saltos de línea.
13. `00 Temario.md` se escribe con `type: index` (con `type: topic` el panel de estudio lo contaba como un tema más).
14. El generador de temarios admite hasta 120 temas por área y solo lista como área las carpetas que empiezan por un número
    (así `FULLSTACK_*` no entra en el temario).
15. La herramienta de dibujo LaTeX ya solo aparece en matemáticas (y en notas fuera de un espacio de estudio).
