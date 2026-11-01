// Cuándo se le recuerda a la persona que puede apoyar el proyecto. Es un aviso discreto: se enseña como mucho una vez cada
// REMIND_EVERY_DAYS días, y «No volver a mostrar» lo apaga para siempre. Todo vive en el navegador de la app (localStorage),
// nunca en la bóveda.

export const SUPPORT_KEY = "nv.support-notice";
export const REMIND_EVERY_DAYS = 14;
export const SUPPORT_URL = "https://lessteps.com/#apoyar";
export const PAYPAL_URL = "https://paypal.me/lessteps";

export interface SupportState {
  /** Última vez que se enseñó (ms desde 1970). */
  lastShown?: number;
  /** La persona pidió no volver a verlo. */
  never?: boolean;
}

export function readSupportState(storage: Pick<Storage, "getItem"> | null = safeStorage()): SupportState {
  try {
    const raw = storage?.getItem(SUPPORT_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as SupportState;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function writeSupportState(state: SupportState, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(SUPPORT_KEY, JSON.stringify(state));
  } catch {
    /* sin almacenamiento: el aviso saldrá la próxima vez, no pasa nada */
  }
}

/** ¿Toca enseñar el aviso ahora? */
export function shouldShowSupportNotice(state: SupportState, now: number): boolean {
  if (state.never) return false;
  if (typeof state.lastShown !== "number") return true;
  return now - state.lastShown >= REMIND_EVERY_DAYS * 86_400_000;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
