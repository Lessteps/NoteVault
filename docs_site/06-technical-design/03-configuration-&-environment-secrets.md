# 03. Configuration & Environment Secrets

**Fase:** 06 — Diseño Técnico  
**Entregable:** 03  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Gestión de Configuración y Claves API

- **Filosofía Local:** NoteVault no almacena secretos en servidores centrales. Toda configuración reside localmente en el dispositivo.
- **Configuración Global de la Aplicación (`appConfig.ts`):** Almacenada en el directorio de configuración del sistema operativo (`userData` de Electron / `SharedPreferences` en Android / `NSUserDefaults` en iOS) conteniendo:
  - Bóvedas recientes abiertas.
  - Pestañas fijadas por bóveda (`nv.pinnedTabs:<vaultPath>`).
  - Preferencias de tema visual (claro / oscuro) y zoom.
- **Claves de IA (Claude / OpenAI / Ollama):** Si el usuario activa el asistente de IA, las claves API se almacenan localmente en memoria o en el gestor de credenciales seguro del sistema operativo, transmitiéndose exclusivamente por HTTPS directo hacia el proveedor sin intermediarios.

---

## 2. Marco Conceptual: Almacén de Configuración Local

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija la clave de preferencia del usuario (`config_key_id`: `CONFIG-APP-RECENT-VAULTS`) consultado al inicializar la aplicación.
3. **Existe por sí misma en el almacenamiento seguro del cliente sin viajar a la nube**, y es la única responsable de recordar las rutas de bóveda autorizadas y las credenciales locales.
4. **Punto de entrada y límite de consistencia:** Si el archivo de configuración local se borra, la aplicación inicia en modo bienvenida sin comprometer las bóvedas en disco.

</div>
