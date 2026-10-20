# 04. Security Implementation & IPC Middleware

**Fase:** 06 — Diseño Técnico  
**Entregable:** 04  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Especificación del Blindaje IPC y Validación de Rutas

### 1.1. Preload Script Blindado (`frontend/electron/preload.ts`)
```typescript
import { contextBridge, ipcRenderer } from "electron";

// Aislamiento estricto: solo se expone el método invoke() tipado
contextBridge.exposeInMainWorld("nv", {
  invoke: (method: string, args?: unknown) =>
    ipcRenderer.invoke("nv", method, args),
});
```

### 1.2. Middleware de Validación de Rutas (`appState.resolve`)
Toda llamada que reciba una ruta relativa (`relPath`) es interceptada por el método `AppState.resolve()`:
1. **Rechazo de Tipos no Válidos:** Si `rel` no es string, se lanza `ApiError("Ruta inválida.")`.
2. **Rechazo de Bytes Nulos:** Si incluye `\x00`, se aborta la operación.
3. **Bloqueo de Rutas Absolutas:** Si inicia por `/` o tiene formato de unidad (`C:`), se lanza `ApiError("Solo se aceptan rutas dentro del vault.")`.
4. **Bloqueo de Escape:** Si cualquier segmento contiene `..`, se lanza `ApiError("Solo se aceptan rutas dentro del vault.")`.
5. **Protección de Carpetas Internas:** Se prohíbe el acceso a carpetas que comiencen por punto que no formen parte del contrato de `.notevault/`.

---

## 2. Marco Conceptual: Middleware de Validación de Seguridad

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija la regla de saneamiento de entrada (`security_filter_id`: `FILTER-PATH-CONFINEMENT-RESOLVE`) ejecutado antes de cada acceso a I/O.
3. **Existe por sí misma en la capa de API sin depender de los gestores de módulos**, y es la única responsable de garantizar que ninguna petición originada en el frontend pueda leer o escribir fuera de los límites de la bóveda.
4. **Punto de entrada y límite de consistencia:** Detiene cualquier intento de escalamiento de privilegios o *Path Traversal*.

</div>
