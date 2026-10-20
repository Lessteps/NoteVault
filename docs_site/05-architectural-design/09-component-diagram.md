# 09. Component Diagram (C4 Nivel 3)

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 09  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Diagrama de Componentes C4 Nivel 3

```mermaid
graph TD
    subgraph Proceso Principal Electron (Node.js Core)
        REG["api/registry.ts (IPC Dispatcher)"]
        STATE["api/appState.ts (AppState)"]
        VMGR["core/vaultManager.ts (VaultManager)"]
        NSVC["core/notesService.ts (NotesService)"]

        subgraph Gestores de Módulos
            HMGR["HabitManager"]
            TMGR["TaskManager"]
            PMGR["ProjectManager"]
            EMGR["ExerciseManager"]
            FMGR["FinanceManager"]
            SMGR["StudySRSManager"]
            MMGR["MentorPlanBuild"]
            WMGR["WebStore"]
        end
    end

    subgraph Interfaz de Usuario (React 19 + Zustand)
        BRIDGE["lib/bridge.ts (Client API Bridge)"]
        STORES["store/ (Zustand Stores)"]
        UI_VIEWS["components/ (React Views & Tabs)"]
        EDITOR["CodeMirror 6 / Milkdown (Editor)"]
    end

    UI_VIEWS --> BRIDGE
    EDITOR --> BRIDGE
    BRIDGE -->|IPC nv.invoke| REG
    REG --> STATE
    STATE --> VMGR
    STATE --> NSVC
    STATE --> HMGR
    STATE --> TMGR
    STATE --> PMGR
    STATE --> EMGR
    STATE --> FMGR
    STATE --> SMGR
    STATE --> MMGR
    STATE --> WMGR
```

---

## 2. Marco Conceptual: Componente Arquitectónico C4

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija un módulo de código ejecutable (`c4_component_id`: `C4-COMP-REGISTRY-DISPATCHER`) consultado en los diagramas de dependencias.
3. **Existe por sí misma como unidad de código cohesiva sin depender de la UI que la invoca**, y es la única responsable de encapsular la lógica de su submódulo funcional.
4. **Punto de entrada y límite de consistencia:** Expone una interfaz pública tipada hacia los demás componentes.

</div>
