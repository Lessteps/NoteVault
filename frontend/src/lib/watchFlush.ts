// Qué hace la ventana tras una ráfaga de eventos del vigilante. Un AUTOGUARDADO propio (nota ya abierta, mismo contenido) no cambia el árbol de archivos:
// releerlo (y recontar las notas de toda la vault) en cada guardado era trabajo inútil en el proceso principal.

/** ¿Hay que refrescar el árbol? Sí, salvo que TODOS los cambios de la ráfaga sean el eco de un guardado propio de una nota abierta. */
export function shouldRefreshTree(rels: readonly string[], isOwnSave: (rel: string) => boolean): boolean {
  return rels.length === 0 || rels.some((rel) => !isOwnSave(rel));
}
