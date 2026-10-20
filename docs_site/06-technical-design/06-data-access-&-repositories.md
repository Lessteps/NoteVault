# 06. Data Access & Repositories (Sistema de Archivos)

**Fase:** 06 — Diseño Técnico  
**Entregable:** 06  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Especificación del Patrón Repositorio sobre Archivos

En NoteVault, la persistencia se abstrae mediante clases de repositorio que leen y escriben en disco:

- **`NotesService` (`frontend/src/core/notesService.ts`):** Repositorio de notas Markdown. Se encarga de:
  - Leer contenido y parsear frontmatter con `gray-matter` / analizador propio.
  - Escribir de forma atómica respetando saltos de línea `\n`.
  - Escanear carpetas ignorando directorios no deseados (`node_modules`, `.git`, `__pycache__`).
- **`Store` / `VaultService` en Dart (`notevault_mobile/lib/core/`):** Réplica en Flutter que implementa las mismas operaciones de lectura y guardado atómico mediante `dart:io`.

---

## 2. Marco Conceptual: Repositorio de Almacenamiento Local

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija la interfaz de acceso a disco (`repository_contract_id`: `REPO-NOTES-SERVICE`) consultado por los gestores de negocio.
3. **Existe por sí misma en la capa de datos sin exponer detalles de bajo nivel del sistema operativo**, y es la única responsable de transformar cadenas de texto plano en entidades de dominio tipadas.
4. **Punto de entrada y límite de consistencia:** Asegura que toda escritura a disco sea atómica y libre de corrupción.

</div>
