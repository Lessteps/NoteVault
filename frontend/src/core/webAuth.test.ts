import { describe, expect, it } from "vitest";
import { googleSignInPageHtml, isGoogleSignIn } from "./webAuth";

describe("isGoogleSignIn", () => {
  it("reconoce las páginas de acceso de Google", () => {
    expect(isGoogleSignIn("https://accounts.google.com/v3/signin/identifier?hl=es")).toBe(true);
    expect(isGoogleSignIn("https://accounts.google.com.mx/ServiceLogin")).toBe(true);
    expect(isGoogleSignIn("https://accounts.youtube.com/accounts/SetSID")).toBe(true);
  });
  it("no toca otros sitios ni dominios parecidos", () => {
    expect(isGoogleSignIn("https://www.google.com/search?q=a")).toBe(false);
    expect(isGoogleSignIn("https://accounts.google.com.evil.example/")).toBe(false);
    expect(isGoogleSignIn("https://evil.example/accounts.google.com")).toBe(false);
    expect(isGoogleSignIn("file:///etc/passwd")).toBe(false);
    expect(isGoogleSignIn("no es url")).toBe(false);
  });
  it("la página explica el motivo", () => {
    expect(googleSignInPageHtml()).toContain("navegador del sistema");
  });
});
