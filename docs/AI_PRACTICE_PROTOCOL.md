# AI practice protocol — how any AI grades NoteVault exercises

NoteVault's practice view sends the learner's answer to an AI teacher and expects one JSON object
back. Any AI can play that role through one of three transports; all of them carry the **same
messages** and must return the **same JSON**.

| Transport | Who uses it | How |
|---|---|---|
| HTTP | LM Studio, Ollama, any OpenAI-compatible server, OpenAI/Anthropic with a key | the app calls `POST <base_url>/chat/completions` itself (`core/ai_client.py`) |
| Clipboard bridge | Claude web, ChatGPT web, Antigravity web | the app copies the prompt and opens the site; the learner pastes the reply back with «Pegar corrección» |
| File handoff | Antigravity, Claude Code, Cursor, a local model with file tools | the app writes a request file; the agent writes a response file; the app picks it up by itself |

The teacher **never executes** the learner's code, SQL or commands. It reads them and reasons
about their behaviour, checks good practices and shows a corrected example.

## 1. The grade JSON (the only valid answer)

```json
{
  "score": 72,
  "verdict": "partial",
  "rubric": [true, true, false, true, false],
  "errors": [
    {
      "category": "logical",
      "anchor": "assumes the conclusion in the inductive step",
      "description": "The inductive step starts from P(n+1) instead of deriving it from P(n).",
      "evidence": "Supongamos que 1+…+(n+1) = (n+1)(n+2)/2",
      "fix": "Start from the hypothesis P(n), add (n+1) to both sides and simplify to reach P(n+1)."
    }
  ],
  "feedback": "La base está bien y la idea general es correcta, pero en el paso inductivo das por hecho lo que querías probar.",
  "next_step": "¿Qué igualdad tienes disponible como hipótesis y qué le sumarías para llegar al caso n+1?",
  "example": "1+2+…+n+(n+1) = n(n+1)/2 + (n+1) = (n+1)(n+2)/2"
}
```

Rules:
- `score`: integer 0-100. `verdict`: `correct` | `partial` | `incorrect`.
- `rubric`: one boolean per rubric item of the exercise, **same order**, same count.
- `errors[].category`: one of `conceptual, logical, procedural, calculation, syntax,
  implementation, grammar, vocabulary, listening, reading, pronunciation`.
- `errors[].anchor`: copy the exact anchor text from the list given in the request when the
  mistake matches one; otherwise `""`.
- `description`, `fix`: **English**, one sentence each (they go into the learner's error log that
  other AIs read). `evidence`: a short quote from the learner's answer.
- `feedback`, `next_step`: **Spanish**, teacher voice. If the verdict is not `correct`, do not
  reveal the full solution: name the blocking concept and ask one guiding question in
  `next_step`.
- `example`: a short corrected snippet (code, SQL, command, formula or sentence) whenever there
  is an error; `""` if the answer is correct.
- Reply with the JSON only. A ```json fenced block is accepted too.

The app computes the spaced-repetition quality (0-5) from `score`, hints used and whether the
solution was seen — do not include it.

## 2. File handoff

All paths are relative to the vault root.

```
.notevault/estudio/handoff/
  requests/<req_id>.json    ← written by the app: {id, kind, created, note_id, note_path, messages, response_file}
  requests/<req_id>.md      ← same prompt, flattened for humans and agents, with instructions at the end
  responses/<req_id>.json   ← written by the AI: the grade JSON of §1
  requests/done/            ← the app moves answered requests here
```

An agent processing requests must:
1. List `requests/*.json` (not `done/`) whose `responses/<req_id>.json` does not exist yet.
2. Read the request. `messages` is a chat conversation: the `system` messages define the judge's
   role and rules; the `user` message carries the exercise, the model solution (for the judge
   only), the rubric and the learner's answer.
3. Grade exactly as the messages say and write the grade JSON to `responses/<req_id>.json`
   (UTF-8, no extra text).
4. Never modify the request, the exercise note or anything else in the vault.

The practice view polls the response file every 2 seconds while it waits, so the result appears
by itself. Requests that nobody answers stay in `requests/` and can be answered later.

## 3. Error log for generation and review

After every graded attempt the app rewrites `.notevault/estudio/errores/ERROR_LOG.md`: the
learner's unresolved errors in English, most repeated first, with subject, discipline, skill,
anchor, description, fix and where they were last seen. Any AI that **generates** exercises or
**reviews** the learner's work should read it first, target the repeated anchors, and avoid
re-asking what the learner already masters.

## 4. Invocation prompts

Ready-to-paste prompts for editor agents live in `docs/prompts/`:
- `GRADE_PENDING_PRACTICE.md` — grade every pending request.
