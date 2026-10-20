# 03. Deployment Topology Decision (ADR-001)

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 03  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Decisión de Topología de Despliegue Multi-OS

- **Estado:** Aprobado / Vigente
- **Contexto:** La aplicación debe ejecutarse con máximo rendimiento en computadoras personales (**PC con Windows, Linux, macOS**) y teléfonos móviles (**Android e iOS/iPhone**).
- **Decisión:** Desplegar una arquitectura de **Dos Clientes Nativos Desacoplados y Cero Servidores en la Nube**:
  1. **Cliente Desktop (PC / Mac):** Aplicación empaquetada con Electron (`.exe` NSIS en Windows, `.dmg` en macOS, `AppImage` en Linux).
  2. **Cliente Móvil (Android / iPhone):** Aplicación compilada en Flutter (`.apk` / `.aab` en Android, `.ipa` en iOS).
  3. **Medio de Transporte:** La replicación de datos no depende de un servidor central, sino del sistema de archivos local sincronizado por herramientas P2P como Syncthing o servicios en la nube del usuario (iCloud Drive / Google Drive).
- **Consecuencias Positivas:** Cero costos de infraestructura, privacidad absoluta, funcionamiento 100% offline.
- **Consecuencias Negativas:** No se soporta edición colaborativa simultánea en tiempo real estilo Google Docs.

---

## 2. Marco Conceptual: Topología de Despliegue Local-First

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que formaliza la topología física de instalación (`deployment_topology_id`: `TOPO-DUAL-NATIVE-SYNC`) archivado en el histórico de arquitectura.
3. **Existe por sí misma en el registro de decisiones sin depender de servidores en producción**, y es la única responsable de fijar que cada cliente acceda al sistema de archivos mediante sus APIs nativas del SO.
4. **Punto de entrada y límite de consistencia:** Declara formalmente que el almacenamiento de disco es la única fuente de verdad compartida.

</div>
