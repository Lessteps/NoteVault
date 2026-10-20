# 08. Third-Party Integrations & File Sync Protocol

**Fase:** 06 — Diseño Técnico  
**Entregable:** 08  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Integraciones Externas y Protocolo de Sincronización

NoteVault prescinde de webhooks HTTP de backend y utiliza integraciones locales y de archivo:

### 1.1. Protocolo de Sincronización Syncthing / iCloud
- **Detección de Conflictos:** Cuando Syncthing genera un archivo con patrón `*.sync-conflict-*`, el parser lo preserva en disco y lo reporta a la interfaz mediante una alerta no bloqueante.
- **Resolución Determinista:** En caso de ediciones concurrentes en dos dispositivos, el usuario puede inspeccionar la diferencia visual y seleccionar qué archivo conservar.

### 1.2. Integración con Proveedores de Modelos de Lenguaje (LLM)
- **Asistente y Mentor IA:** Integración opcional mediante llamadas HTTPS directas a APIs de Anthropic Claude o modelos locales con **Ollama**.
- **Seguridad:** Las claves API se almacenan localmente y nunca se envían a servidores intermediarios.

---

## 2. Marco Conceptual: Conector de Integración Externa

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija el adaptador de integración (`integration_connector_id`: `CONN-SYNCTHING-FILE-SYNC`) consultado en el módulo de sincronización.
3. **Existe por sí misma en la capa de infraestructura sin depender de la lógica de negocio interna**, y es la única responsable de traducir eventos externos en operaciones válidas de la bóveda.
4. **Punto de entrada y límite de consistencia:** Asegura que una falla en un servicio externo (ej. caída de API de LLM) no interrumpa el funcionamiento local del sistema.

</div>
