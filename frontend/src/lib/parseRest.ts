// Segundos de descanso desde el texto libre de `rest`.
//
// `rest` lo escribe la persona ("90", "90s", "1:30", "2 min", "60-90s"),
// así que aquí no se valida nada: se interpreta lo común y lo demás es null,
// que la fila muestra como editor manual.

export function parseRestSecs(raw: unknown): number | null {
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return null;
  // Rango en minutos "2-3 min": la cota alta es el descanso completo.
  const minRange = t.match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*min/);
  if (minRange) {
    const secs = Number(minRange[2]!.replace(",", ".")) * 60;
    return Number.isFinite(secs) && secs > 0 ? Math.round(secs) : null;
  }
  // Rango "60-90s": la cota alta es el descanso completo.
  const range = t.match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)/);
  const text = range?.[2] ? range[2]! : t;
  // m:ss
  const clock = text.match(/(\d+)\s*:\s*(\d{1,2})/);
  if (clock) {
    const secs = Number(clock[1]) * 60 + Number(clock[2]);
    return Number.isFinite(secs) && secs > 0 ? Math.round(secs) : null;
  }
  // minutos explícitos
  const min = text.match(/(\d+(?:[.,]\d+)?)\s*min/);
  if (min) {
    const secs = Number(min[1]!.replace(",", ".")) * 60;
    return Number.isFinite(secs) && secs > 0 ? Math.round(secs) : null;
  }
  // segundos (número solo o con s)
  const sec = text.match(/(\d+(?:[.,]\d+)?)\s*s?$/);
  if (sec) {
    const secs = Number(sec[1]!.replace(",", "."));
    return Number.isFinite(secs) && secs > 0 ? Math.round(secs) : null;
  }
  return null;
}
