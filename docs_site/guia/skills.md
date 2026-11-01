# Skills

Una **skill** es el archivo de instrucciones con el que se genera una pieza de un tema. NoteVault trabaja con tres tipos por materia:

| Skill | Genera |
| :--- | :--- |
| Notas de teoría (md) | La nota `<tema>.md`. |
| Mapa (canvas) | El mapa explicativo `<tema> — mapa.canvas`. |
| Archivos de práctica | El archivo `<tema>.practica.md` y sus ejercicios. |

Viven en `<materia>/_skills/` dentro de tu bóveda, así que son archivos tuyos.

## El panel Skills

Está en la barra derecha, debajo del Mentor. Desde ahí puedes:

- **Ver y editar** cada skill a mano.
- **Ver las versiones anteriores** (se conservan las 3 últimas) y **restaurar** una.
- **Pedir un cambio en lenguaje normal.** Tienes tres caminos:
    - con la **IA de la app** (API o modelo local);
    - copiando un **prompt** para pegarlo en Antigravity o en cualquier otra IA;
    - escribiendo el texto tú mismo.

Una petición nunca guarda por sí sola: te devuelve una propuesta y decides si la guardas.

## Versionado

Cada skill tiene una versión de 8 caracteres calculada a partir de su contenido. Cada nota, mapa o práctica que se genera lleva en su frontmatter la versión con la que se hizo:

```yaml
skill_version: "15f0185c"
```

Con eso, la app detecta sola qué piezas se hicieron con una versión anterior de la skill y te las marca como desactualizadas, sin que tengas que revisarlas una a una.
