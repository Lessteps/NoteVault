# Contribuir a NoteVault

Gracias por querer ayudar. Esta guía explica cómo hacerlo sin perder tiempo.

## Antes de escribir código

1. Busca en los [issues](https://github.com/Lessteps/NoteVault/issues) si ya existe lo que quieres hacer.
2. Para un cambio grande, abre primero un issue con la idea y espera respuesta.
3. Los errores se reportan con la plantilla de *Bug*; las ideas, con la de *Propuesta*.

## Entorno

Requisitos: Node.js 20+ y npm 10+.

```bash
git clone https://github.com/Lessteps/NoteVault.git
cd NoteVault/frontend
npm install
npm run electron:dev
```

## Reglas del proyecto

- **TypeScript estricto.** `npm run typecheck` debe pasar.
- **Tests.** Todo cambio de lógica lleva test (`npx vitest run`). Los cambios de interfaz con comportamiento nuevo, también.
- **Formato de la bóveda.** Si tocas lo que se escribe en disco, actualiza `docs/VAULT_FORMAT.md`, sube `FORMAT_VERSION` si rompe compatibilidad y ajusta los tests que lo fijan.
- **Puente IPC.** Una función nueva de la API se registra en `frontend/src/api/registry.ts` y en `frontend/src/lib/bridge.ts`; el test de contrato avisa si falta una de las dos.
- **Commits pequeños y con sentido.** Un cambio, un commit, un mensaje que diga el porqué.

## Antes de abrir el Pull Request

```bash
cd frontend
npm run typecheck
npx vitest run
```

Describe qué cambia, por qué, y cómo lo probaste.

## Licencia de tus aportes y firma de commits

El proyecto se publica bajo **GPL-3.0-or-later**. Al enviar un aporte aceptas que se publique bajo esa licencia y declaras que tienes derecho a hacerlo ([Developer Certificate of Origin](https://developercertificate.org/)). Firma tus commits:

```bash
git commit -s -m "feat: descripción"
```

## Contenido y marca

El contenido de pago (rutas de estudio, paquetes de notas) no está en este repositorio y no se acepta como aporte aquí. El nombre y el logo se rigen por [TRADEMARK.md](TRADEMARK.md).

## Conducta

Todas las personas que participan se comprometen con el [código de conducta](CODE_OF_CONDUCT.md).
