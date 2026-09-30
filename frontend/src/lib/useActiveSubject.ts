// The study subject of the note that is open ("" when it is not inside a study space). The right-hand tools
// depend on it: handwriting-to-LaTeX makes sense in mathematics, not in an English space.

import { useEffect, useState } from "react";
import { useApp } from "../store/app";
import { api } from "./bridge";

const cache = new Map<string, string>();

export function topFolderOf(path: string | null): string {
  return (path ?? "").split(/[\\/]/)[0] ?? "";
}

export function useActiveSubject(): string {
  const active = useApp((s) => s.active);
  const top = topFolderOf(active);
  const [subject, setSubject] = useState<string>(() => cache.get(top) ?? "");

  useEffect(() => {
    if (!top) {
      setSubject("");
      return;
    }
    const known = cache.get(top);
    if (known !== undefined) {
      setSubject(known);
      return;
    }
    let live = true;
    api
      .studySpaceSubject(top)
      .then((s) => {
        cache.set(top, s);
        if (live) setSubject(s);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [top]);

  return subject;
}

/** Handwriting to LaTeX is a mathematics tool: English and programming spaces do not offer it (a plain note keeps it). */
export const subjectUsesLatex = (subject: string): boolean => !["english", "programming"].includes(subject.toLowerCase());
