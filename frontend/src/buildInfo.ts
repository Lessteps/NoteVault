// La compilación en curso: `vite.config.ts` pone `__BUILD_STAMP__` (fecha y hora de `vite build`); en desarrollo y en pruebas queda «dev».
declare const __BUILD_STAMP__: string | undefined;

export const BUILD_STAMP: string = typeof __BUILD_STAMP__ === "string" ? __BUILD_STAMP__ : "dev";
