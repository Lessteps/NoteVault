// How the embedded browser introduces itself. Sites such as WhatsApp Web refuse anything that is
// not a plain, recent Chrome ("actualiza tu navegador"), and Electron's default identity gives it
// away twice: the user agent carries `Electron/<v>` and the app's own name, and the client hints
// (`sec-ch-ua`) list an "Electron" brand. Both are cleaned so the page sees the Chromium it is.

/** The user agent without the Electron and application tokens. */
export function cleanUserAgent(ua: string): string {
  return ua
    .replace(/\s+(?:Electron|notevault-ui|notevault|NoteVault)\/[\w.+-]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** A client-hints header (`sec-ch-ua`, `sec-ch-ua-full-version-list`) without the "Electron" brand. */
export function cleanBrandHeader(value: string): string {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/electron/i.test(part))
    .join(", ");
}

const BRAND_HEADERS = /^sec-ch-ua(?:-full-version-list)?$/i;

/** The request headers with the Electron brand removed from the client hints. */
export function cleanRequestHeaders(headers: Record<string, string | string[]>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = BRAND_HEADERS.test(name) && typeof value === "string" ? cleanBrandHeader(value) : value;
  }
  return out;
}
