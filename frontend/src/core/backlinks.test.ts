import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotesService } from "./notesService";
import { VaultManager } from "./vaultManager";

describe("backlinks & mentions", () => {
  let tmp: string;
  let vault: VaultManager;
  let service: NotesService;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_bl_"));
    fs.writeFileSync(path.join(tmp, "Target.md"), "# Target\n\ncuerpo\n", "utf-8");
    fs.writeFileSync(
      path.join(tmp, "Source.md"),
      "# Source\n\nlinea dos\nenlaza a [[Target]] aqui\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmp, "Unlinked.md"),
      "# Unlinked\n\nhabla de Target sin enlace\n",
      "utf-8",
    );
    vault = new VaultManager(tmp);
    service = new NotesService(vault);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("detects linked and unlinked mentions", () => {
    const target = vault.getNote(path.join(tmp, "Target.md"))!;
    const [linked, unlinked] = service.mentions(target);

    expect(linked.length).toBe(1);
    expect(linked[0]!.title).toBe("Source");
    expect(linked[0]!.line_no).toBe(4);
    expect(linked[0]!.linked).toBe(true);

    expect(unlinked.length).toBe(1);
    expect(unlinked[0]!.title).toBe("Unlinked");
    expect(unlinked[0]!.linked).toBe(false);
  });

  it("linkifies an unlinked mention", () => {
    const unlinkedPath = path.join(tmp, "Unlinked.md");
    const ok = service.linkifyMention(unlinkedPath, 3, "Target");
    expect(ok).toBe(true);

    const updatedText = fs.readFileSync(unlinkedPath, "utf-8");
    expect(updatedText).toContain("[[Target]]");

    const target = vault.getNote(path.join(tmp, "Target.md"))!;
    const [linked, unlinked] = service.mentions(target);
    expect(linked.some((m) => m.title === "Unlinked")).toBe(true);
    expect(unlinked.length).toBe(0);
  });
});
