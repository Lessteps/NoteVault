# Guía del módulo WEB

## Abrirlo

**Ctrl+P** → escribe **web** → *WEB: Abrir navegador WEB* → Enter.
Funciona en cualquier módulo. Se abre en una ventana aparte; al cerrarla se
detiene todo (ningún video sigue sonando) y la próxima vez reabre tus pestañas.

Otros comandos de la paleta: *Abrir una dirección en WEB…*, *Restricciones de
contenido…*, *Añadir página web al canvas…* (con un canvas abierto).

## Navegar

| Acción | Cómo |
|---|---|
| Buscar o ir a una web | Escribe en la barra y Enter (sin `https://` también sirve) |
| Nueva pestaña / cerrar | Ctrl+T / Ctrl+W, o ＋ y ✕ |
| Atrás / adelante / recargar | Alt+← / Alt+→ / F5 |
| Guardar en marcadores | ☆ o Ctrl+D (aparecen en la barra de marcadores) |
| Historial | 🕘 o Ctrl+H |
| Buscar en la página | Ctrl+F |
| Zoom | Ctrl + / Ctrl − / Ctrl 0 |
| Descargas | Van a tu carpeta *Descargas* |

## Iniciar sesión (Google, YouTube, etc.)

Inicia sesión dentro de WEB una vez; la sesión queda guardada en este equipo
(`~/.notevault/web_profile`) y la comparten las tarjetas web del canvas. No se
sincroniza con otros dispositivos ni con Chrome. *⋮ → Cerrar sesión en todos los
sitios* la borra.

## Restricciones (🛡)

- **Plantillas**: *Shorts y Reels*, *Redes sociales*, *Noticias y entretenimiento*.
- **Sitios bloqueados**: uno por línea (`tiktok.com` bloquea también `m.tiktok.com`).
- **Partes de dirección**: bloquea solo una sección (`youtube.com/shorts` deja ver videos normales).
- **Modo enfoque**: solo se abren los sitios que pongas en la lista.
- **Límites diarios**: minutos por sitio; al agotarse se bloquea hasta mañana. El
  tiempo se cuenta solo mientras la pestaña está visible.
- **Pedir confirmación**: para aflojar cualquier regla hay que escribir «quiero desbloquear».

Las reglas se guardan en la vault (`.notevault/web/restricciones.json`).

## Páginas web dentro del canvas

- Pega una URL con **Ctrl+V** en el canvas, arrástrala desde el navegador, usa la
  herramienta 🔗 (tecla **S**) o, en WEB, el botón **⧉**.
- La tarjeta muestra una vista previa. **Doble clic** en el cuerpo = página en vivo
  (se puede desplazar, hacer clic, escribir). Clic fuera = vuelve a vista previa y la actualiza.
- Botones de la cabecera: **✎** cambiar dirección · **◉** mantener siempre en vivo ·
  **▶/■** en vivo / vista previa · **↗** abrir en WEB.
- Doble clic en la cabecera abre la página en WEB.

## Si WEB no abre

Aparece un aviso si falta la carpeta `web_runtime` junto a `NoteVault.exe`.
Se genera con `python tools/build_web_runtime.py` (solo hace falta al actualizar PySide6).
