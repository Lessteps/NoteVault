const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const BARE_SCHEMES = ["chrome:", "about:", "data:", "file:", "javascript:"];
const HOSTLIKE_RE = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:[/?#]|$)/;
const HOME_URL = "https://www.google.com";
const SEARCH_URL = "https://www.google.com/search?q={q}";

function quotePlus(text: string): string {
  return encodeURIComponent(text).replace(/%20/g, "+");
}

export function normalizeUrl(text: string | null | undefined): string {
  const t = (text || "").trim();
  if (!t || /^https?:\/?\/?$/i.test(t) || /google\.com\/search\?q=https?%3A/i.test(t)) return HOME_URL;
  if (SCHEME_RE.test(t) || BARE_SCHEMES.some((s) => t.toLowerCase().startsWith(s))) {
    return t;
  }
  if (!t.includes(" ") && HOSTLIKE_RE.test(t)) {
    return (t.startsWith("localhost") ? "http://" : "https://") + t;
  }
  return SEARCH_URL.replace("{q}", quotePlus(t));
}

