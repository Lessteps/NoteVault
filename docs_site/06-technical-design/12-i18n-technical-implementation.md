# 12. i18n Technical Implementation

**Fase:** 06 — Diseño Técnico  
**Entregable:** 12  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Estrategia de Idioma y Localización

- **Idioma Principal No Negociable:** **Español**. Toda etiqueta de interfaz, nombre de vistas, títulos de paneles y botones en Desktop y Mobile se expresan estrictamente en español.
- **Formato Canónico de Fechas:** ISO 8601 (`YYYY-MM-DD`) para fechas y `YYYY-MM-DDTHH:MM` para fecha-hora local sin conversión de zona horaria (para evitar que una nota tomada a las 23:00 pase al día siguiente al sincronizar entre dispositivos).
- **Días de la Semana:** Clave estándar `0 = Lunes`, `1 = Martes`, ..., `6 = Domingo`. Nombres de claves en minúsculas sin tildes en archivos de configuración (`lunes`, `martes`, `miercoles`, `jueves`, `viernes`, `sabado`, `domingo`).
- **Moneda:** Formato decimal estándar con separación por puntos/comas según configuración del sistema operativo.

---

## 2. Marco Conceptual: Política de Localización de Dominio

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija la regla de internacionalización (`localization_policy_id`: `I18N-SPANISH-CANONICAL-ISO8601`) consultado por los formateadores de fechas.
3. **Existe por sí misma en el diseño de producto sin depender de librerías externas de traducción**, y es la única responsable de garantizar que las fechas y textos sean consistentes en TypeScript y Dart.
4. **Punto de entrada y límite de consistencia:** Prohíbe que se serialicen fechas con desfases de zona horaria UTC que alteren los días de registro de hábitos o ejercicios.

</div>
