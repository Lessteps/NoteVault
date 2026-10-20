# 05. Architectural Style Selection (ADR-003)

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 05  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Selección del Estilo Arquitectónico Base

- **Estado:** Aprobado / Vigente
- **Decisión:** Implementar el patrón de **Arquitectura Hexagonal (Puertos y Adaptadores)** adaptado a un entorno Local-First:
  - **Núcleo de Dominio (Hexágono Interior):** Las entidades de negocio (`Note`, `Habit`, `Task`, `StudySRS`, `MentorPlan`) y sus funciones de cálculo son 100% puras, sin conocimiento de Electron, React ni Flutter.
  - **Puertos de Entrada:** La interfaz de llamadas IPC en Desktop (`api/registry.ts`) y los controladores en Dart en Mobile.
  - **Puertos de Salida (Adaptadores de Persistencia):** `VaultManager` y `NotesService` en Node.js, y `VaultService` en Dart, encargados de interactuar con el sistema de archivos real.
- **Ventajas:** Permite probar el 100% de la lógica de negocio con pruebas unitarias puras y cambiar el motor de renderizado o el shell sin tocar las reglas de dominio.

---

## 2. Marco Conceptual: Estilo Arquitectónico Hexagonal

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija la separación en capas (`architectural_style_id`: `STYLE-HEXAGONAL-PORTS-ADAPTERS`) consultado en las revisiones de dependencias.
3. **Existe por sí misma en el marco arquitectónico sin depender del framework de interfaz**, y es la única responsable de garantizar la Inversión de Dependencias (DIP) entre el dominio y el almacenamiento.
4. **Punto de entrada y límite de consistencia:** Prohíbe que las clases de dominio importen APIs del sistema operativo directamente.

</div>
