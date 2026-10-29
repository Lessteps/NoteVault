// Google (and Microsoft-style identity providers) refuse sign-in inside an embedded browser: «Este navegador o app podría no ser seguro».
// That is a deliberate protection against phishing by apps that could read the password, not a bug to dodge — so the app does NOT try to
// disguise itself further. Sign-in pages open in the user's real browser instead, and the embedded one says so.

const GOOGLE_SIGN_IN_HOSTS = /^(?:accounts\.google\.(?:com?\.[a-z]{2}|[a-z]{2,3})|accounts\.youtube\.com|accounts\.gstatic\.com)$/i;

/** Is this URL a Google sign-in / account-chooser page? */
export function isGoogleSignIn(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && GOOGLE_SIGN_IN_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}


/** The page shown in the embedded browser after the sign-in was handed to the system browser. */
export function googleSignInPageHtml(): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><title>Inicia sesión en tu navegador</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#131317;color:#e6e6eb;font-family:system-ui,sans-serif;padding:24px;box-sizing:border-box}
.card{max-width:480px;background:#1b1b22;border:1px solid #2b2b36;border-radius:12px;padding:24px}h1{margin:0 0 8px;font-size:16px}p{margin:0 0 10px;font-size:13px;color:#9ca0b0;line-height:1.5}</style></head>
<body><div class="card"><h1>Google no permite iniciar sesión aquí</h1>
<p>Google bloquea el inicio de sesión dentro de apps con navegador integrado para proteger tu contraseña. Es una medida de seguridad, no un fallo.</p>
<p>Se abrió la página de acceso en tu navegador del sistema. Inicia sesión allí; esta app nunca ve tu contraseña de Google.</p>
<p>Para usar un servicio de Google, ábrelo en tu navegador habitual.</p></div></body></html>`;
}

export const googleSignInDataUrl = (): string => `data:text/html;charset=utf-8,${encodeURIComponent(googleSignInPageHtml())}`;
