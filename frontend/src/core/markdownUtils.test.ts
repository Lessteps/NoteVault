import { describe, expect, it } from "vitest";
import { countWords, extractHeadings, inline, toHtml } from "./markdownUtils";

describe("markdownUtils", () => {
  it("formats inline markdown", () => {
    expect(inline("**bold**")).toBe("<strong>bold</strong>");
    expect(inline("*italic*")).toBe("<em>italic</em>");
    expect(inline("`code`")).toBe("<code>code</code>");
    expect(inline("[[Target]]")).toContain('href="nv://note/Target"');
    expect(inline("[[Target|Alias]]")).toContain(">Alias</a>");
    expect(inline("[link](https://example.com)")).toBe('<a href="https://example.com">link</a>');
    expect(inline("#tag")).toContain("#tag</span>");
  });

  it("converts markdown structure to html", () => {
    const md = "# Title\n\n- Item 1\n- Item 2\n\n```\nconst a = 1;\n```";
    const html = toHtml(md);
    expect(html).toContain('<h1 id="title">Title</h1>');
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Item 1</li>");
    expect(html).toContain("<pre><code>const a = 1;</code></pre>");
  });

  it("extracts headings", () => {
    const md = "# Heading 1\n\ntext\n\n## Sub heading\n\n```\n# not heading\n```";
    const headings = extractHeadings(md);
    expect(headings).toEqual([
      { level: 1, text: "Heading 1", anchor: "heading-1" },
      { level: 2, text: "Sub heading", anchor: "sub-heading" },
    ]);
  });

  it("counts words excluding code and markdown syntax", () => {
    expect(countWords("# Hello world")).toBe(2);
    expect(countWords("```\ncode\n```\nReal text")).toBe(2);
    expect(countWords("")).toBe(0);
  });
});
