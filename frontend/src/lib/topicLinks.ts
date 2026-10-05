// Mirror of the string helpers of `src/core/practice/topicLinks.ts` (the renderer project
// cannot import `core/`). `topicLinks.test.ts` keeps both copies in step.
//
// A `topic_links` entry is `<topic folder>` or `<topic folder>#skill1+skill2`; in the folder
// `%`, `,` and `#` are escaped as `%25`, `%2C`, `%23`.

export interface TopicLink {
  topic: string;
  /** empty = every skill of the topic */
  skills: string[];
}

const SKILL_RE = /^[a-z0-9_]+$/;

export function parseTopicLink(raw: unknown): TopicLink | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const hash = text.indexOf("#");
  const pathPart = hash === -1 ? text : text.slice(0, hash);
  const topic = pathPart
    .replace(/%2C/gi, ",").replace(/%23/g, "#").replace(/%25/g, "%")
    .replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!topic) return null;
  const skills: string[] = [];
  if (hash !== -1) {
    for (const s of text.slice(hash + 1).split("+")) {
      const sk = s.trim().toLowerCase();
      if (sk && SKILL_RE.test(sk) && !skills.includes(sk)) skills.push(sk);
    }
  }
  return { topic, skills };
}

export function formatTopicLink(link: TopicLink): string {
  const skills = [...new Set(link.skills.map((s) => s.trim().toLowerCase()).filter((s) => SKILL_RE.test(s)))];
  const base = link.topic.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
    .replace(/%/g, "%25").replace(/,/g, "%2C").replace(/#/g, "%23");
  return skills.length ? `${base}#${skills.join("+")}` : base;
}
