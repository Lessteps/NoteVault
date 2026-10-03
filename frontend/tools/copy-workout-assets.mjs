// Copia los 906 PNGs de @bryllim/workout-guide a public/ para servirlos
// en local (offline, respeta el CSP img-src 'self'). Se ejecuta en
// postinstall para no commitear 30 MB de binarios.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "node_modules", "@bryllim", "workout-guide", "assets");
const dest = join(here, "..", "public", "workout-guide-assets");

if (!existsSync(src)) {
  console.warn("[workout-assets] paquete no instalado, omito copia");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[workout-assets] copiados a public/workout-guide-assets`);
