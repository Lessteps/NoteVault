# 09. Frontend Component & State Architecture (React & Zustand)

**Fase:** 06 — Diseño Técnico  
**Entregable:** 09  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Arquitectura de Estado y Componentes en React 19

```mermaid
graph TD
    subgraph Capa de Estado Global (Zustand)
        NAV["useNavState (Rutas y Pestañas Abiertas)"]
        STORE["useStore (Bóveda Activa y Notificaciones)"]
        CARDS["useCardState (Estado de Tarjetas del Mentor)"]
    end

    subgraph Árbol de Componentes de Interfaz
        APP["App.tsx (Layout Principal y Split View)"]
        TABS["TabBar.tsx (Pestañas Draggable)"]
        SIDEBAR["Sidebar.tsx (Explorador y Accesos)"]
        EDITOR["EditorArea.tsx (CodeMirror 6 / Milkdown)"]
        VIEWS["ModuleViews (Dashboard, Hábitos, Gym, Tareas)"]
    end

    APP --> TABS
    APP --> SIDEBAR
    APP --> EDITOR
    APP --> VIEWS

    TABS <--> NAV
    SIDEBAR <--> STORE
    VIEWS <--> CARDS
```

---

## 2. Marco Conceptual: Gestor de Estado de Interfaz

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija el almacén reactivo (`state_store_id`: `STORE-ZUSTAND-NAV-STATE`) consultado por los componentes de React.
3. **Existe por sí misma en la memoria de la interfaz sin acoplamiento a las llamadas de disco**, y es la única responsable de sincronizar el estado visual con `localStorage` y emitir re-renderizados eficientes.
4. **Punto de entrada y límite de consistencia:** Centraliza las mutaciones de la vista activa y la división de paneles.

</div>
