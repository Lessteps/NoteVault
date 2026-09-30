// @vitest-environment jsdom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { heading, togglePrefix } from "./editorCommands";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function edit(doc: string): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, selection: EditorSelection.range(0, doc.length) }),
    parent: document.body,
  });
  return view;
}

describe("togglePrefix", () => {
  it("does not double the mark on lines that already had it", () => {
    const v = edit("> uno\ndos");
    togglePrefix(v, "> ");
    expect(v.state.doc.toString()).toBe("> uno\n> dos");
  });

  it("removes the mark when every line has it, and adds it when none does", () => {
    const v = edit("> uno\n> dos");
    togglePrefix(v, "> ");
    expect(v.state.doc.toString()).toBe("uno\ndos");
    togglePrefix(v, "> ");
    expect(v.state.doc.toString()).toBe("> uno\n> dos");
  });
});

describe("heading", () => {
  it("turns a list item into a heading instead of keeping its bullet inside", () => {
    const v = edit("  - anidada");
    heading(v, 2);
    expect(v.state.doc.toString()).toBe("## anidada");
  });

  it("removing a heading leaves a normal list item alone", () => {
    const v = edit("- punto");
    heading(v, 0);
    expect(v.state.doc.toString()).toBe("- punto");
  });
});
