import { describe, expect, it } from "vitest";
import { cleanBrandHeader, cleanRequestHeaders, cleanUserAgent } from "./webUserAgent";

const ELECTRON_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) notevault-ui/0.1.0 Chrome/144.0.7559.60 Electron/44.4.5 Safari/537.36";

describe("cleanUserAgent", () => {
  it("looks like plain Chrome: no Electron token and no app name", () => {
    expect(cleanUserAgent(ELECTRON_UA)).toBe(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.7559.60 Safari/537.36",
    );
  });

  it("leaves a user agent that is already clean", () => {
    const clean = cleanUserAgent(ELECTRON_UA);
    expect(cleanUserAgent(clean)).toBe(clean);
  });
});

describe("client hints", () => {
  it("drops the Electron brand and keeps the rest", () => {
    expect(cleanBrandHeader('"Chromium";v="144", "Electron";v="44", "Not?A_Brand";v="24"')).toBe('"Chromium";v="144", "Not?A_Brand";v="24"');
  });

  it("cleans only the brand headers of a request", () => {
    const out = cleanRequestHeaders({
      "sec-ch-ua": '"Chromium";v="144", "Electron";v="44"',
      "Sec-CH-UA-Full-Version-List": '"Electron";v="44.4.5", "Chromium";v="144.0.1"',
      "sec-ch-ua-mobile": "?0",
      Accept: "text/html",
    });
    expect(out["sec-ch-ua"]).toBe('"Chromium";v="144"');
    expect(out["Sec-CH-UA-Full-Version-List"]).toBe('"Chromium";v="144.0.1"');
    expect(out["sec-ch-ua-mobile"]).toBe("?0");
    expect(out.Accept).toBe("text/html");
  });
});
