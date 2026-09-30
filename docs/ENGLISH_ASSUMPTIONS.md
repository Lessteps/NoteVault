# English study system — ASSUMPTIONS log

Every ambiguous decision taken while building English as a second domain (phases 6–13), with the reason. Nothing
here was asked back to the user; each entry can be reversed by changing the one place named.

## Domains (phase 6)

1. **The existing skill set stays as is and becomes math-only in effect.** Mathematics (and, untouched,
   programming) keep their skills, prompts, topic types and default `_skills`; English gets its own catalogue with
   its own ids, so nothing is shared. `core/practice/mathGolden.test.ts` freezes what mathematics produces (catalogue,
   topic types, every prompt, the default skill notes) — it passes unchanged, which is the proof that mathematics did
   not move. Programming was outside the brief, so it was left alone.
2. **Domain = subject.** `domainOfSubject()` maps `english/ingles/inglés` → english, `programming*` → programming and
   anything else → math (the pre-existing behaviour for unknown subjects; unchanged).
3. **English has a branch, not a topic type.** Branches: grammar, writing, reading, listening, speaking. Vocabulary is
   NOT a branch. An English topic never gets `topic_type`.
4. **No default for languages.** A topic is classified by `branch:` in its `.practica.md` or by a branch folder in its
   path (`Inglés/3 Lectura/…`). Otherwise it is *unclassified*: it is logged in
   `.notevault/estudio/clasificacion-pendiente.json`, the AI/plan calls refuse with an explicit message, and the topic
   view shows a banner to pick the branch (`study_topic_classify`). A name-based **suggestion** is offered but never
   applied. Where mathematics still uses "mixed" as its fallback, it is unchanged.
5. **English exercises cannot take a maths mode** (and English-only modes are rejected in other subjects):
   `modeFor` throws instead of falling back to `solve`. Existing first-generation English modes (`translate`,
   `rewrite`, `writing`, `cloze`, `explain`, `true_false`, `find_error`) stay valid so old exercises keep working
   (`disciplineCatalog` still lists them), but they are no longer offered in the English catalogue.
6. **Difficulty 1/2/3 = CEFR A2/B1/B2+.** Session parameters (difficulty, quantity, hints, "hints don't count") are
   the same code as mathematics; `noBeginner` and `noHelper` flags express per-skill rules.

## Catalogue (phase 7)

7. **Ids are namespaced** (`gr_`, `wr_`, `rd_`, `ls_`, `sp_`, `vc_`), 34 skills: grammar 6, writing 6, reading 6,
   listening 5, speaking 6, vocabulary 5. They live in one pure table (`lib/englishSkillData.ts`) read by the UI and
   the core, so the two cannot drift.
8. **Vocabulary skills fit every branch**; a branch skill fits only its own branch. When a branch topic's skills are
   recommended by default, only its own branch's are (vocabulary is chosen, not assumed).
9. **Speaking has no speech recognition.** The learner speaks aloud and types a transcript / self-report; that text is
   what is graded. `sp_*` skills are therefore text exercises whose framing says so.
10. **Listening audio** is played by the app (browser speech synthesis or the media player) and the text stays
    hidden; `ls_dictation`, `ls_gap` and `vc_recall` are always without help (a hint would give the answer away).
