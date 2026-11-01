# La bóveda

La **bóveda** es una carpeta cualquiera de tu disco. NoteVault no necesita servidor ni base de datos: todo es texto que puedes leer y editar a mano.

## Principios del formato

1. Una bóveda es una carpeta normal. Puede ser la misma que usas en Obsidian.
2. Todo es texto legible: Markdown con frontmatter YAML, o JSON.
3. Un archivo por día o por entidad. Dos equipos pueden escribir a la vez mientras toquen entidades distintas, y una sincronización por carpeta no genera conflictos.
4. Fechas en ISO 8601 (`YYYY-MM-DD`), en hora local.
5. Codificación UTF-8.

## Estructura

```text
vault/
├── .notevault/        datos de los módulos (hábitos, tareas, metas, finanzas…)
├── tus-notas.md       tus notas .md y lienzos .canvas, donde prefieras
└── Programación/      ejemplo de materia de estudio
    ├── _skills/       instrucciones de generación de esa materia
    └── …              temas, prácticas y mapas
```

Los archivos de `.notevault/` los gestiona la app; el resto es tuyo.

## El contrato completo

El formato está especificado, versionado y protegido por tests: la versión actual es la **4**. El documento de referencia es [`docs/VAULT_FORMAT.md`](https://github.com/Lessteps/NoteVault/blob/main/docs/VAULT_FORMAT.md). Si cambias el formato, cambia ese documento y los tests que lo fijan.

## Sincronizar entre equipos

NoteVault no sincroniza por ti: usa lo que ya tengas sobre la carpeta (Syncthing, Git, iCloud Drive, Google Drive…). Los ajustes de la app (`~/.notevault/settings.json`) viven fuera de la bóveda y no se sincronizan con ella.

## Copias de seguridad

Copia la carpeta. Eso es todo.
