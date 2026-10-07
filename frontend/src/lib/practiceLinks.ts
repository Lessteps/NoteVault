// Mirror of the string helpers of `src/core/practice/practiceLinks.ts` (the renderer project
// cannot import `core/`). `practiceLinks.test.ts` keeps both copies in step.
//
// A `practice_links` entry: `kata:daily[#week=N|#streak=N]`, `project:weekly|monthly[#focus]`,
// `project:folder:<folder>` (in the folder `%`, `,` and `#` are escaped as `%25`, `%2C`, `%23`).

export const PRACTICE_FOCUS_IDS = ["backend", "databases", "frontend", "desktop", "mobile", "automation"] as const;
export const KATA_DEFAULT_WEEK_TARGET = 5;

export type PracticeLink =
  | { kind: "kata"; week?: number; streak?: number }
  | { kind: "project"; scope: "weekly" | "monthly"; focus?: string }
  | { kind: "project"; scope: "folder"; folder: string };

const escapePath = (p: string): string => p.replace(/%/g, "%25").replace(/,/g, "%2C").replace(/#/g, "%23");
const unescapePath = (p: string): string => p.replace(/%2C/gi, ",").replace(/%23/g, "#").replace(/%25/g, "%");
const intIn = (s: string, lo: number, hi: number): number | null => {
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= lo && n <= hi ? n : null;
};

export function parsePracticeLink(raw: unknown): PracticeLink | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const hash = text.indexOf("#");
  const head = (hash === -1 ? text : text.slice(0, hash)).trim();
  const tail = hash === -1 ? "" : text.slice(hash + 1).trim();
  const colon = head.indexOf(":");
  if (colon < 0) return null;
  const kind = head.slice(0, colon).toLowerCase();
  const rest = head.slice(colon + 1).trim();
  if (kind === "kata") {
    if (rest.toLowerCase() !== "daily") return null;
    const m = /^(week|streak)=(\d+)$/i.exec(tail);
    if (!m) return tail ? null : { kind: "kata" };
    if (m[1]!.toLowerCase() === "week") {
      const n = intIn(m[2]!, 1, 7);
      return n === null ? null : { kind: "kata", week: n };
    }
    const n = intIn(m[2]!, 1, 365);
    return n === null ? null : { kind: "kata", streak: n };
  }
  if (kind === "project") {
    const lower = rest.toLowerCase();
    if (lower === "weekly" || lower === "monthly") {
      const focus = tail.toLowerCase();
      if (focus && !(PRACTICE_FOCUS_IDS as readonly string[]).includes(focus)) return null;
      return { kind: "project", scope: lower, ...(focus ? { focus } : {}) };
    }
    if (lower.startsWith("folder:")) {
      if (hash !== -1) return null;
      const folder = unescapePath(rest.slice("folder:".length)).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      return folder ? { kind: "project", scope: "folder", folder } : null;
    }
  }
  return null;
}

export function formatPracticeLink(link: PracticeLink): string {
  if (link.kind === "kata") {
    if (link.streak) return `kata:daily#streak=${link.streak}`;
    if (link.week) return `kata:daily#week=${link.week}`;
    return "kata:daily";
  }
  if (link.scope === "folder") return `project:folder:${escapePath(link.folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))}`;
  return `project:${link.scope}${link.focus ? `#${link.focus}` : ""}`;
}

export function practiceLinkLabel(link: PracticeLink): string {
  if (link.kind === "kata") {
    if (link.streak) return `Kata diario · racha de ${link.streak}`;
    return `Kata diario · ${link.week ?? KATA_DEFAULT_WEEK_TARGET} días/semana`;
  }
  if (link.scope === "folder") return `Proyecto ${link.folder.split("/").pop()}`;
  const per = link.scope === "weekly" ? "semanal" : "mensual";
  return `Proyecto ${per}${link.focus ? ` · ${link.focus}` : ""}`;
}
