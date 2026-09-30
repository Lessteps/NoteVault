# Plan inglés v2: escucha, habla y vocabulario (acordado 2026-09-30)

Principio: **toda la práctica de escucha y habla nace de comparar lo que el alumno produce con un texto de referencia**
(la transcripción). Con transcripción la corrección es exacta, gratis y sin internet; la IA queda solo para lo abierto
(resúmenes). Nada depende de tener conexión.

## Decisiones del usuario
- Sin dependencia de internet (el reconocimiento de voz local, p. ej. Whisper, queda como opción futura y opcional).
- Vocabulario: 20 repasos y 10 palabras nuevas por día como punto de partida.
- Tres iconos separados en la barra derecha, en inglés, bajo «Esquema de la nota»: Reproductor, Tabla IPA, Diccionario.

## Pasos
1. **Base común (HECHO):** comparador de texto (`core/english/textCompare.ts`), corrección local del dictado
   (`dictationGrade.ts`, sin IA), biblioteca de fuentes (`core/english/sources.ts`: podcast, película, TED con su transcripción
   .srt/.vtt) y el icono/panel **Reproductor** con sesiones de dictado, shadowing y podcast creadas desde una fuente.
2. **Escucha por episodio:** vista de episodio (pasos: predecir, idea general, dictado por fragmentos, huecos, shadowing,
   comparar, minar palabras al banco); huecos también corregidos por comparación; transcripciones SIN tiempos: sincronizarlas
   pulsando una tecla al empezar cada frase (funciona offline).
3. **Vocabulario:** repaso por palabra con tope diario (20 + 10 nuevas) y «añadir 10 al repaso» por tandas; dos vías de
   temario sobre un único banco (6A por clases/gramática, 6B por temas de la vida real) con competencias propias.
4. **Tabla IPA** (icono propio): símbolos, palabras de ejemplo, cómo se produce, hueco para video; práctica de fonética de
   palabras.
5. **Diccionario** (icono propio): vista del mismo banco (IPA, audio, ejemplos, colocaciones, familia); estar en el
   diccionario no implica estar en repaso.
6. **Habla con reconocimiento local (opcional, más adelante):** transcribir lo que dice el alumno y compararlo con el texto
   de referencia, igual que la escucha.

## Añadido tras probar el paso 1 (2026-09-30)
- **Micro reproductor** flotante (abajo a la derecha, minimizable) para podcasts; el reproductor completo queda para películas y TED.
  Corrige el fallo de la duración en 00:00 (el `<video>` la conocía pero no llegaba al estado del componente: el deslizador se
  quedaba con `max=1` y no dejaba avanzar/retroceder).
- **Carpeta de la biblioteca:** `<espacio>/Fuentes/{Podcasts,Películas,TED,Transcripciones,Grabaciones}`. «Añadir» copia los
  archivos ahí (o los deja donde están, a elección; por defecto las películas no se copian). Los archivos multimedia no deberían
  ir a git: conviene ignorar `Inglés/Fuentes/**/*.{mp3,mp4,…}` en el repositorio del vault.
- **Transcripciones pegadas** (con o sin tiempos) se guardan como archivo en `Fuentes/Transcripciones/` y pueden ser una fuente
  por sí solas: sin audio, la voz de la app lee las frases en los ejercicios.
- **Grabaciones de voz:** panel propio (icono de micrófono) con reproducción a 0.5×–2× y archivos en `Fuentes/Grabaciones/`.
- Pendiente: sincronizar transcripciones sin tiempos pulsando una tecla al empezar cada frase; integrar las fuentes en la vista de
  cada tema de escucha.
