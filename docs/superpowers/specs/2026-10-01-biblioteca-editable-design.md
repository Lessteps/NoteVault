# Biblioteca de Ejercicio editable

## El problema

La Biblioteca son 302 ejercicios de `@bryllim/workout-guide`, un paquete instalado, más
las instrucciones en español propias (`exerciseInstructions.*.json`). Es **código
empaquetado**: no hay forma de añadirle un ejercicio desde la interfaz.

Hoy el formulario del programa tiene un único botón, «Guardar ejercicio», que escribe
en el programa de la persona. Añadir a la Biblioteca no existe como operación, y esa
es exactamente la falta que se ha reportado.

Peor: al copiar un ejercicio de la Biblioteca al programa, la copia es **independiente**.
No guarda de dónde salió, así que corregir la Biblioteca no llega a las copias, y no hay
forma de responder «¿este ejercicio viene de la Biblioteca?» con un dato en vez de
comparando nombres a mano.

## La dirección

Dos botones separados en el formulario, y una Biblioteca que se comporta como **una capa
editable sobre el catálogo**, no como una segunda pila.

La razón de que sea una capa y no una pila: con dos pilas, «Press banca» y «Bench Press»
conviven como duplicados, y quien quiere puede tener los dos. Con una capa hay **un solo
Bench Press**, con las correcciones encima y las imágenes del paquete.

## Decisiones tomadas

1. **Sin duplicados por construcción.** Guardar un nombre que ya existe edita esa
   entrada; no crea otra. No existe ruta en el código que produzca el duplicado.
2. **Editar no destruye.** Un campo tuyo vacío significa «déjalo como estaba», no
   «bórralo». Solo lo que rellenes manda.
3. **Las copias avisan, no se actualizan solas.** Un sincronizado automático pisaría
   textos que la persona escribió a propósito. Avisa y decide ella.
4. **El aviso solo toca lo que vino de la Biblioteca.** Nunca series, descanso ni video.
5. **Un ejercicio tuyo es un duplicado imposible**, porque guarda el `slug` de origen.

## Almacenamiento

Un fichero nuevo, de la persona:

```
.notevault/ejercicio/biblioteca.json
```

```json
{
  "entries": [
    {
      "slug": "mia-a1b2c3",
      "name": "Press banca",
      "equipment": "Barra",
      "muscles": { "primary": ["pectoral"], "secondary": ["triceps", "hombro"] },
      "how_to": "1. Baja la barra al pecho\n2. Empuja sin bloquear"
    }
  ]
}
```

Campos opcionales en `equipment` y `how_to`; `name` y `muscles.primary` siempre presentes.
Si el fichero no existe, la biblioteca es la del paquete, sin nada tuyo encima.
Se añade `library: ${DATA_DIR}/ejercicio/biblioteca.json` a `LAYOUT` en `core/vaultFormat.ts`.

## La mezcla (overlay)

En `lib/exerciseLibrary.ts`. Hoy `searchExercises()` devuelve el paquete entero; ahora se
cruza con las entradas de la persona, **por `slug`**:

- Un `slug` del paquete con entrada tuya → se fusiona campo a campo.
- Un `slug` propio (`mia-…`) → se añade a los resultados, sin frames.

Regla de fusión, por campo, sobre el valor empaquetado:

| Campo tuyo | Resultado |
|---|---|
| relleno (string no vacío tras `trim`) | el tuyo |
| vacío / ausente | el del paquete |

Las entradas propias no tienen `equipment` si no lo rellenas; el filtro «Todo el equipo»
las incluye, igual que ahora incluye las de valor vacío. `guidePrimary` de una entrada
propia se toma de `muscles.primary` unido con comas, y `localPrimary` es directamente lo
que guardaste, porque ya son ids locales de `muscles.ts` (no hay que mapear desde el
nombre del catálogo). `LIBRARY_MUSCLES` se construye a partir de las entradas ya mezcladas,
así que un músculo que solo usen tus ejercicios aparece en el desplegable.

## Guardar sin duplicar

Método nuevo en `api/modules/exercise.ts`: `ex_library_save(fields)`.

```
nombre normalizado = name.trim().toLowerCase(), con las series de espacios
                    internas colapsadas a una sola

existe una entrada (propia o del paquete) con ese nombre normalizado
  → sí → se actualiza esa. Nunca se crea otra.
  → no → se crea con slug propio "mia-" + id corto.
```

Se **avisa antes** de pisar una entrada del paquete: el botón pasa a decir
«Actualizar en la Biblioteca» y el guardado muestra qué campos van a cambiar.
`ex_library_remove(slug)` borra una entrada **propia**; no puede borrar una del paquete,
para que los 302 no se pierdan aunque alguien vacíe su fichero.

## La copia recuerda su origen

`Exercise` gana un campo opcional:

```ts
/** slug de la entrada de la que se copió. Vacío si se escribió a mano. */
source?: string;
```

- Al añadir desde la Biblioteca, `source` = el slug de la entrada.
- Al escribir a mano, `source` queda vacío. **Eso es la respuesta a «¿esto es de la
  Biblioteca?»**: un dato, no una comparación de nombres.
- `ex_dict` lo expone; `ex_save` lo acepta y lo conserva.

Esto sustituye a la heurística de nombres que hay hoy en el buscador del formulario
(`Routine.tsx`, `routineNames.has(...)`), que solo comparaba en minúsculas.

## Los dos botones

En `ExerciseForm` (`Routine.tsx`):

- **«Añadir al programa»** — el guardado de hoy. Escribe en el programa y nada más.
- **«Guardar en la Biblioteca»** — nuevo. Escribe solo en `biblioteca.json`, y **no
  toca el programa**.

Si el nombre ya existe en la Biblioteca, el segundo pasa a **«Actualizar en la
Biblioteca»** y avisa antes de escribir.

## El aviso de desfasado

Al cargar el programa, se comparan los `source` guardados contra la Biblioteca actual.
Si una entrada cambió desde que se copió, sale un aviso en el programa:

> «Press banca cambió en la Biblioteca. Lo usas en 2 días.» 〔Actualizar〕 〔Ahora no〕

Actualizar escribe **solo** `name`, `how_to` y `muscles` de esas copias. **Nunca** toca
`series_reps`, `rest`, `video_path` ni `day`: son campos de la persona.

## Un ejercicio tuyo, sin imágenes

`LibraryEntry` ya tiene `frames: string[]` y `frame1: string | null`, ambos pueden estar
vacíos. En `LibraryDetail` el detalle solo pinta la tira de frames cuando hay; si no la
hay, una línea «Sin imágenes» y sigue con datos e instrucciones. Sin recuadros vacíos.

## Errores

- `biblioteca.json` ilegible → se trata como vacío, con un aviso. **Nunca impide
  arrancar la app**: es una personalización, no datos de entrenamiento.
- Escritura fallida → el error se muestra en el formulario; el estado en memoria no se
  considera guardado hasta que `save` responde.
- Dos ventanas abiertas editando a la vez → gana la última. Es una app personal.

## Qué NO entra

- Adjuntar imágenes o videos a un ejercicio propio. No hay editor; queda para otro día.
- Un `slug` por cada ejercicio del paquete editable más allá de la fusión por nombre.
- Sincronización automática entre copias.
- Migrar las copias ya existentes para que tengan `source`. Sin `source`, se consideran
  escritas a mano: siguen funcionando, y no mienten.

## Pruebas

Primero los tests, con TDD:

| Prueba | Qué garantiza |
|---|---|
| `biblioteca.json` ausente | la biblioteca es la del paquete |
| fichero ilegible | vacío + aviso, sin romperse |
| fusión, campo tuyo relleno | gana el tuyo |
| fusión, campo tuyo vacío | se queda el del paquete |
| `ex_library_save` con nombre existente | edita; no crea una segunda |
| `ex_library_save` con nombre nuevo | crea con slug `mia-…` |
| los dos botones | guardar en la Biblioteca no escribe en el programa |
| `source` al copiar | queda el slug; a mano, vacío |
| aviso de desfasado | aparece si la entrada cambió |
| actualizar copias | cambia `name`/`how_to`/`muscles` y **no** `series_reps`/`rest`/`video_path` |

E2E: montar un ejercicio propio desde el formulario, verlo en la Biblioteca, usarlo en
un día, editarlo en la Biblioteca y comprobar que salta el aviso de desfasado.

## Riesgo

El más probable: que el `slug` de las copias antiguas no exista y el aviso no aparezca
para lo que ya está en los programas de gente. Aceptado: sin `source` no hay forma
correcta de saberlo, y preferimos no adivinar por nombre.
