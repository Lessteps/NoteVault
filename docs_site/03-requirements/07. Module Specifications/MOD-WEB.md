# Especificación de Módulo: MOD-WEB (Navegador y Control de Enfoque)

**Fase:** 03 — Ingeniería de Requisitos  
**Módulo:** MOD-WEB (09)  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Alcance y Responsabilidades

- **Navegador Embebido Seguro:** Sesión aislada en Electron con partición `persist:nvweb` separada de la bóveda.
- **Control de Enfoque:** Modos `blocklist` (bloqueo de redes sociales/distracciones) y `allowlist` (solo sitios de estudio permitidos).
- **Métricas de Consumo:** Registro de segundos dedicados por dominio por día en `.notevault/web/uso/YYYY/MM/YYYY-MM-DD.json`.
- **Marcadores Portables:** Sincronización de enlaces de interés en `.notevault/web/marcadores.json`.

---

## 2. Marco Conceptual: Entidad Regla de Enfoque Web

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija una restricción de navegación (`focus_rule_id`: ej. `rule_block_social_media`) consultado por los filtros de red.
3. **Existe por sí misma en `restricciones.json` sin depender de extensiones del navegador externo**, y es la única responsable de interceptar y bloquear peticiones HTTP hacia dominios no autorizados.
4. **Punto de entrada y límite de consistencia:** Protege el tiempo y la atención del estudiante durante sus sesiones de estudio.

</div>
