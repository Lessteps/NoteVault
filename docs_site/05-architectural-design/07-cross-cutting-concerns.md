# 07. Cross-Cutting Concerns

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 07  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Estrategias Transversales de Arquitectura

| Preocupación Transversal | Estrategia de Implementación Técnica | Ubicación en el Código |
| :--- | :--- | :--- |
| **Manejo Global de Errores** | Errores estructurados con clase `ApiError` que retornan código, mensaje legible y nunca exponen trazas de pila a la UI. | `frontend/src/api/common.ts` |
| **Logging y Diagnóstico** | Logs estructurados locales con niveles `INFO`, `WARN`, `ERROR` confinados al almacenamiento de sesión del cliente. | Proceso Electron Main y terminal de desarrollo. |
| **Caché en Memoria** | Caché de segundo nivel para rutinas de ejercicios, estado de navegación y árbol de notas con invalidación por mtime. | `scheduleManager.ts`, `navState.ts` |
| **Sanitización de Seguridad** | Sanitización obligatoria con `DOMPurify` antes de renderizar cualquier salida Markdown, KaTeX o HTML. | `components/notes/MarkdownPreview.tsx` |
| **Resolución de Rutas Confinadas**| Toda ruta relativa solicitada por la interfaz se valida en `appState.resolve()` bloqueando *Path Traversal*. | `frontend/src/api/appState.ts` |

---

## 2. Marco Conceptual: Interceptor Transversal (Cross-Cutting Concern)

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija una política transversal del sistema (`cross_cutting_id`: `CROSS-PATH-CONFINEMENT`) consultado por todos los handlers.
3. **Existe por sí misma en la infraestructura de la aplicación sin pertenecer a un módulo funcional específico**, y es la única responsable de asegurar que las políticas de seguridad, logging y caché se apliquen de forma homogénea en toda la aplicación.
4. **Punto de entrada y límite de consistencia:** Envuelve la ejecución de cada operación antes de tocar el dominio.

</div>
