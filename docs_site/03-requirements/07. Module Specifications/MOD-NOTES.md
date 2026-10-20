# Especificación de Módulo: MOD-NOTES (Notas y Markdown)

**Fase:** 03 — Ingeniería de Requisitos  
**Módulo:** MOD-NOTES (01)  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Alcance y Responsabilidades

El módulo `MOD-NOTES` es el núcleo central de edición de texto y gestión del conocimiento en NoteVault.

- **Editor Híbrido WYSIWYG / Markdown:** Implementado con CodeMirror 6 y Milkdown Kit.
- **Renderizado Matemático:** Integración nativa de KaTeX para fórmulas matemáticas complejas inline (`$...$`) y en bloque (`$$...$$`).
- **Parseo de Frontmatter:** Lectura y escritura determinista de metadatos YAML al inicio de los archivos.
- **Grafo de Enlaces:** Detección y resolución de enlaces bidireccionales `[[Nombre de Nota]]`.
- **Gestión de Adjuntos:** Almacenamiento local automático de imágenes y videos en subcarpetas `attachments/` contiguas a la nota.

---

## 2. Marco Conceptual: Entidad Nota en el Dominio

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que corresponde a su ruta relativa POSIX dentro de la bóveda (`note_path`: ej. `1.PERSONAL/Estudio/Algebra.md`) consultado por el buscador y el grafo.
3. **Existe por sí misma en el sistema de archivos sin depender de un catálogo central en base de datos**, y es la única responsable de validar que su contenido y frontmatter cumplan las reglas antes de guardar.
4. **Punto de entrada y límite de consistencia:** El guardado se ejecuta de forma atómica sobre su propio archivo `.md`.

</div>
