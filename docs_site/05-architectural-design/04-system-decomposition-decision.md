# 04. System Decomposition Decision (ADR-002)

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 04  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Decisión de Descomposición del Sistema

- **Estado:** Aprobado / Vigente
- **Contexto:** Se analizó si NoteVault debía construirse como una Progressive Web App (PWA) única, como un conjunto de microservicios con backend en la nube, o como una suite modular local.
- **Decisión:** Descomponer el sistema como un **Monolito Modular Local de Dos Clientes**:
  - En Desktop: Monolito modular en TypeScript donde cada módulo (`notes`, `habits`, `tasks`, etc.) encapsula su gestor (`Manager`) y se despacha a través de un registro IPC centralizado (`registry.ts`).
  - En Mobile: Monolito modular en Dart (`notevault_mobile`) donde cada gestor replica las mismas invariantes de negocio.
  - La sincronización entre módulos no utiliza bus de eventos de red distribuido, sino invocaciones directas en memoria y persistencia atómica en disco.
- **Alternativas Descartadas:**
  - *Microservicios en la nube:* Descartado por violar el principio de privacidad local y generar costos mensuales continuos.
  - *PWA pura:* Descartado por el soporte deficiente de acceso persistente al sistema de archivos en iOS y Android.

---

## 2. Marco Conceptual: Descomposición en Monolito Modular Local

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija el patrón de empaquetado del software (`system_decomposition_id`: `DEC-MODULAR-MONOLITH-LOCAL`) consultado en el diseño de paquetes.
3. **Existe por sí misma en el registro de arquitectura sin depender de la infraestructura de red**, y es la única responsable de garantizar que los módulos mantengan bajo acoplamiento y alta cohesión dentro del mismo proceso.
4. **Punto de entrada y límite de consistencia:** Permite compilar binarios autocontenidos sin servicios satélites requeridos.

</div>
