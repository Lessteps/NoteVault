# 11. Semantic HTML & ARIA Contracts

**Fase:** 06 — Diseño Técnico  
**Entregable:** 11  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Contratos Semánticos HTML5 y Roles WAI-ARIA

NoteVault estructura su árbol de componentes garantizando marcado semántico y accesibilidad para tecnologías de asistencia:

- **Estructura Semántica Principal:**
  - `<nav>`: Barra lateral de navegación y selector de bóvedas.
  - `<main id="main-content">`: Contenedor principal de la pestaña activa o editor.
  - `<aside>`: Panel secundario de backlinks, índice de contenidos o chat con el asistente.
  - `<article>`: Cuerpo de la nota Markdown activa.
- **Roles y Atributos ARIA:**
  - `role="tablist"`, `role="tab"`, `role="tabpanel"`: En la barra de pestañas múltiples.
  - `aria-selected="true/false"`: Indicación del estado activo de la pestaña.
  - `aria-label`: Etiquetas descriptivas en botones con iconos solitarios (ej: "Crear nota", "Dividir panel").
  - `aria-pressed`: En los chips de filtro por área en el calendario del Mentor.

---

## 2. Marco Conceptual: Contrato de Marcado Semántico

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija la estructura semántica de un componente (`aria_contract_id`: `ARIA-TAB-BAR-MULTIVIEW`) consultado en las pruebas de accesibilidad.
3. **Existe por sí misma en el diseño de marcado sin depender de los estilos CSS**, y es la única responsable de asegurar que los lectores de pantalla puedan interpretar la jerarquía de la vista.
4. **Punto de entrada y límite de consistencia:** Asegura la navegabilidad total mediante teclado y herramientas de asistencia.

</div>
