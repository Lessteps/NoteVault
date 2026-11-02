# App móvil (Android)

NoteVault Mobile abre **la misma carpeta de bóveda** que la app de escritorio y lee y escribe los mismos archivos de texto. No hay cuenta, ni servidor, ni telemetría: tu teléfono solo habla con la carpeta que elijas (la que ya sincronizas con tu computador con Syncthing, Google Drive u otra herramienta).

!!! warning "Software en fase inicial"
    La app móvil está en desarrollo activo (Fase 1 de 3) y todavía no se ha probado en muchos teléfonos. Tus notas están a salvo por diseño —nunca sobrescribe un archivo que cambió en otro dispositivo—, pero espera detalles por pulir. Por favor, reporta los problemas.

## Qué funciona hoy

| Área | Qué puedes hacer |
| :--- | :--- |
| **Notas** | Navegar carpetas, leer Markdown, editar, crear, buscar por nombre, seguir `[[enlaces]]`, mover a la papelera. |
| **Tareas** | Ver atrasadas, de hoy, próximas y hechas; completar y reabrir (las repetitivas pasan a su siguiente fecha como en el escritorio); añadir nuevas. |
| **Hábitos** | Marcar los hábitos de hoy (o de cualquier día) y ver tu progreso. |
| **Agenda** | Las rutinas, eventos, tareas y hábitos con hora del día en una sola lista. |
| **Finanzas** | Añadir gastos e ingresos con categorías; ver los totales del día. |
| **Nota rápida** | Anotar una línea en `Inbox.md` con un toque. |
| **Recordatorios** | Notificaciones locales opcionales para recordatorios de tareas y horas de hábitos (apagadas hasta que las actives). |

Lo que viene: edición del calendario, metas, proyectos, ejercicio, alimentación y el Mentor.

## Instalar

1. Descarga el último `NoteVault-<versión>-build<N>.apk` desde los [lanzamientos del repositorio móvil](https://github.com/Lessteps/notevault-mobile/releases/tag/nightly) (privado mientras probamos; pídenos acceso en lesstepscompany@gmail.com).
2. Abre el archivo en tu teléfono y permite instalar desde esa fuente.
3. Abre NoteVault y elige la carpeta de tu bóveda. Android te pedirá permitir el acceso.

## Conviene saber

- **La sincronización es externa.** La app no sincroniza; tu herramienta mueve los archivos. Si el mismo archivo se edita en dos dispositivos, NoteVault muestra un conflicto y te deja elegir en vez de sobrescribir.
- **Inglés por defecto**, español en *Ajustes → Idioma*.
- El formato es el mismo documentado en [`VAULT_FORMAT.md`](https://github.com/Lessteps/NoteVault/blob/main/docs/VAULT_FORMAT.md); una comprobación en el repositorio móvil falla si se aparta del escritorio.
- iPhone está planeado (el código ya corre allí; publicar requiere una cuenta de desarrollador de Apple).
