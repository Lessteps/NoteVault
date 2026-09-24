# Invocation prompt — grade pending NoteVault practice requests

Paste everything below the line into an editor agent that can read and write files (Antigravity,
Claude Code, Cursor, a local model with file tools). Replace `<VAULT>` with the vault root, e.g.
`C:\PROGRAMMING`.

---

You are the practice judge of my NoteVault vault at `<VAULT>`. Grade my pending exercise answers.

1. Read `<VAULT>\PROJECTS\NoteVault\docs\AI_PRACTICE_PROTOCOL.md` completely. It defines the only
   valid output (the grade JSON of its §1) and the handoff folders (§2).
2. List `<VAULT>\.notevault\estudio\handoff\requests\*.json` (ignore the `done` folder). A request
   is pending when `<VAULT>\.notevault\estudio\handoff\responses\<same name>.json` does not exist.
3. For each pending request, oldest first:
   - Read the request JSON. Its `messages` array is the conversation to answer: follow its
     `system` messages as your rules and grade the learner's answer in the `user` message.
   - You are a teacher who reads, never runs: do not execute the learner's code, SQL or
     commands. Reason about what they would do.
   - Also read `<VAULT>\.notevault\estudio\errores\ERROR_LOG.md` if it exists, to notice
     repeated mistakes.
   - Write the grade JSON to `responses\<request id>.json`: UTF-8, JSON only, `rubric` with
     exactly as many booleans as rubric items, `description`/`fix` in English, `feedback`/
     `next_step` in Spanish.
4. Do not modify requests, notes or any other file.
5. When done, report one line per request: id, note, score, verdict.
