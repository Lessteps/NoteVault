# 06. Communication Pattern Decision (ADR-004)

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 06  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Decisión de Patrones de Comunicación Interna e Inter-Dispositivo

- **Estado:** Aprobado / Vigente
- **Comunicación Interna en Desktop (Renderer <-> Main):**
  - **Patrón:** Solicitud-Respuesta asíncrona sobre IPC seguro (`ipcRenderer.invoke` <-> `ipcMain.handle`) a través de un único canal `"nv"`.
  - **Payload:** Objetos JSON serializables con tipado estricto.
  - **Notificaciones Reactivas (Main -> Renderer):** Emisión de eventos para cambios detectados en el sistema de archivos mediante el observador de ficheros (*File Watcher*).
- **Comunicación Inter-Dispositivo (PC <-> Móvil):**
  - **Patrón:** Replicación eventual de archivos en disco (*Eventual File-Level Replication*).
  - La app móvil no se conecta por sockets directos con la app de escritorio; ambas observan la presencia de archivos nuevos en disco y reaccionan de manera determinista.

---

## 2. Marco Conceptual: Patrón de Comunicación IPC

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija el protocolo de transporte de mensajes (`communication_pattern_id`: `COMM-IPC-SINGLE-CHANNEL`) consultado en el diseño de APIs.
3. **Existe por sí misma en el diseño de arquitectura sin depender del contenido de los mensajes**, y es la única responsable de garantizar el paso seguro y validado de datos a través del límite del proceso.
4. **Punto de entrada y límite de consistencia:** Centraliza el registro y captura de errores de todas las operaciones del frontend.

</div>
