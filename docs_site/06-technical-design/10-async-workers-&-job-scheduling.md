# 10. Async Workers & Job Scheduling (File Watcher & Reminders)

**Fase:** 06 — Diseño Técnico  
**Entregable:** 10  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Tareas Asíncronas en Segundo Plano

A falta de colas de backend tipo RabbitMQ o Celery, NoteVault ejecuta tareas asíncronas en el proceso Node.js y en segundo plano en Flutter:

- **Observador de Archivos (`FileWatcher`):**
  - Implementado en `frontend/src/core/fileWatcher.ts`.
  - Escucha eventos `change`, `add` y `unlink` en la bóveda con debounce de 300 ms.
  - Al detectar un cambio externo (ej. archivo sincronizado por Syncthing), notifica al frontend para refrescar la vista sin recargar la app completa.
- **Programador de Recordatorios (`ReminderScheduler`):**
  - Escanea tareas con fecha y hora programada.
  - En Desktop: Emite notificaciones nativas de Electron (`Notification` API).
  - En Móvil: Usa `flutter_local_notifications` integrado con el gestor de alarmas exactas del sistema operativo.

---

## 2. Marco Conceptual: Tarea Asíncrona en Segundo Plano

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que categoriza el worker local (`async_job_id`: `WORKER-FILE-WATCHER-SYNC`) consultado en el ciclo de vida del proceso principal.
3. **Existe por sí misma en el hilo de ejecución sin bloquear la interfaz gráfica del usuario**, y es la única responsable de escuchar eventos del sistema operativo y programar recordatorios.
4. **Punto de entrada y límite de consistencia:** Si un worker falla, el proceso de renderizado de la UI continúa operando sin interrupción.

</div>
