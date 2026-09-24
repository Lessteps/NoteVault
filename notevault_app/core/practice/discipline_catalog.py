"""Discipline specs: skills, anchors (real failure modes) and exercise framing.

The programming disciplines mirror the Skill Ledgers and anchor tables of the
user's training systems in FULLSTACK_PRACTICE (0.*_TRAINING_SYSTEM.md); skill
titles stay in Spanish as written there, anchors are condensed into English.
"""

from dataclasses import dataclass

from .modes import mode_for


@dataclass(frozen=True)
class Skill:
    code: str
    title: str
    anchors: tuple


@dataclass(frozen=True)
class Discipline:
    id: str
    subject: str
    title: str
    modes: tuple
    framing: str
    skills: tuple


def _skills(*rows) -> tuple:
    """Rows of (title, anchor, anchor, ...) numbered "01", "02", ... in order."""
    return tuple(Skill(f"{i:02d}", row[0], tuple(row[1:])) for i, row in enumerate(rows, 1))


# Skill 8 of every programming ledger has no anchor row; these come from its protocol
# (hypothesis -> evidence -> root cause vs symptom).
_DELIBERATE_DEBUGGING = (
    "Debugging deliberado",
    "fixes the symptom instead of the root cause",
    "changes code without stating a hypothesis first",
    "guesses or prints everywhere instead of gathering targeted evidence at the failure point",
    "never states explicitly 'the symptom was X, the root cause is Y'",
)

_NO_TOY_NAMES = ("Every exercise is real and applied; never toy drills with placeholder names "
                 "like data1 or valueA.")

_CATALOGUE = (
    Discipline(
        "math_general", "mathematics", "Matemáticas generales",
        ("prove", "solve", "counterexample", "true_false", "find_error", "explain"),
        "Exercises are precise mathematical tasks with every object defined. Statements are "
        "self-contained, use standard notation (LaTeX between $...$) and ask for exactly one "
        "product: a proof, a value with its justification, a verified counterexample, a "
        "justified true/false verdict, the location of an error, or an explanation.",
        _skills(
            ("Escritura de demostraciones",
             "assumes the conclusion in the inductive step (circular reasoning)",
             "checks only examples instead of proving the general statement",
             "uses a hypothesis that was not given, or never uses one that was",
             "proves the converse instead of the stated implication",
             "skips the base case or checks the wrong starting value"),
            ("Cálculo y procedimiento",
             "sign error when distributing a minus",
             "applies (a+b)^2 = a^2 + b^2 or a similar false linearity",
             "cancels terms across a sum instead of common factors",
             "arithmetic slip early on that propagates through the rest of the work"),
            ("Recuerdo de conceptos",
             "states a definition with a missing or misplaced quantifier",
             "confuses a theorem with its converse",
             "forgets the hypotheses under which a result holds",
             "mixes up similar notations or terms"),
            ("Pensamiento abstracto",
             "generalizes from a single example",
             "proposes a counterexample that does not satisfy every hypothesis",
             "negates 'for all' / 'there exists' incorrectly",
             "treats a necessary condition as sufficient"),
        ),
    ),
    Discipline(
        "math_drill", "mathematics", "Cálculo rápido",
        ("drill",),
        "Short timed calculations generated and checked by the app, with exact answers.",
        _skills(
            ("Aritmética",
             "sign error with negative operands",
             "ignores operator precedence (adds before multiplying)",
             "carry or borrow slip in multi-digit operations"),
            ("Fracciones",
             "adds numerators and denominators directly",
             "leaves the result unreduced",
             "inverts the wrong fraction when dividing",
             "loses the sign of a negative fraction"),
            ("Potencias y raíces",
             "multiplies base by exponent instead of repeated multiplication",
             "adds exponents when the bases differ",
             "takes the root of a sum as the sum of the roots"),
            ("Porcentajes",
             "divides by 10 instead of 100",
             "adds successive percentages instead of compounding them",
             "misplaces the decimal point"),
            ("Derivadas",
             "forgets to lower the exponent by one (power rule)",
             "gives a non-zero derivative for a constant term",
             "drops the coefficient when differentiating",
             "sign error on negative terms"),
        ),
    ),
    Discipline(
        "programming_logic", "programming", "Lógica de programación",
        ("implement", "find_error", "explain", "cloze"),
        "Language-agnostic logic exercises (pseudocode or simple Python) set in small real "
        "situations: processing a list of orders, validating form input, counting events in "
        "a log. " + _NO_TOY_NAMES,
        _skills(
            ("Control de flujo",
             "off-by-one error in loop bounds",
             "conditions in the wrong order make a branch unreachable",
             "loop never terminates because the variable in its condition never changes",
             "else attached to the wrong condition"),
            ("Estructuras de datos",
             "uses a list where a dict or set gives the needed lookup",
             "modifies a collection while iterating over it",
             "indexes into a collection that can be empty"),
            ("Descomposición de problemas",
             "one block does everything instead of named steps",
             "steps in the wrong order (a value is used before it is computed)",
             "repeats code instead of extracting a reusable function"),
            ("Traza de ejecución",
             "loses track of a variable's value between iterations",
             "assumes the loop runs one time more or less than it does",
             "assumes a function modifies its argument in place when it returns a new value"),
        ),
    ),
    Discipline(
        "python", "programming", "Python",
        ("implement", "debug", "refactor", "explain"),
        "Every exercise must be framed as an automation task, not a generic backend or "
        "algorithm drill: a script reacting to a webhook, a batch job processing a CSV/JSON "
        "export, a pipeline step feeding data from one system into another, a scheduled job, "
        "a retry policy against a flaky external API. The stack is Python scripts and FastAPI "
        "endpoints that trigger or are triggered by n8n, read/write PostgreSQL and call "
        "external APIs. " + _NO_TOY_NAMES + " Bugs must be found by reasoning about "
        "behaviour and output, never by spotting a syntax error.",
        _skills(
            ("Control de flujo (if/else, for, while)",
             "return or break inside the loop stops processing the remaining records",
             "off-by-one in range() or in the while condition processes one item too many "
             "or too few",
             "while loop whose stop condition never becomes false on an unexpected upstream "
             "value"),
            ("Estructuras de datos (listas, dicts, sets, tuplas, JSON anidado)",
             "assumes a dict/JSON key always exists",
             "mutates a shared list/dict by reference unintentionally",
             "shallow vs deep copy bug",
             "KeyError on nested access into a real API payload"),
            ("Manejo de strings/texto (parsing, formatting, encoding real)",
             "encoding assumptions when reading or writing text",
             "does not strip whitespace/newlines from a real CSV/API export",
             "off-by-one in slicing",
             "locale-dependent case or date handling"),
            ("Lógica de I/O (archivos, streams, CSV/JSON)",
             "file handle not closed",
             "assumes a file or path exists",
             "reads before the write has finished",
             "silently overwrites existing data",
             "loads a large export fully into memory instead of streaming it"),
            ("Descomposición de problemas",
             "one function mixes I/O, validation and business logic, and the execution order "
             "silently breaks validation (the external call happens before validating)",
             "function name promises 2 responsibilities but performs 3-4 (typical of "
             "AI-generated code)",
             "hidden coupling through a shared variable/dict between sub-steps that should be "
             "independent",
             "function that works but no part can be touched without risking another"),
            ("Manejo de errores + lectura de tracebacks",
             "except Exception swallows real bugs",
             "catches the wrong exception type",
             "does not re-raise when the caller must know about the failure",
             "validates the type but not the value range"),
            ("Composición funcional (comprehensions, map/filter/reduce)",
             "comprehension with a hidden side effect",
             "map/filter iterator exhausted after the first pass",
             "wrong initial value in reduce"),
            _DELIBERATE_DEBUGGING,
            ("Integración con APIs externas (requests/httpx, auth, timeouts, reintentos, "
             "rate limits)",
             "no timeout on the external call",
             "retries a non-idempotent operation and duplicates its effect",
             "assumes success without checking the status code",
             "hardcoded credentials",
             "ignores Retry-After on a rate limit"),
            ("Procesamiento por lotes / pipelines de datos (leer → transformar → escribir, "
             "idempotencia, fallo parcial)",
             "batch is not idempotent (a second run duplicates the effect)",
             "no handling of a partial failure in the middle of the batch",
             "assumes the source format without validating it",
             "hardcoded file paths"),
            ("Configuración y manejo de credenciales (.env, variables de entorno, separación "
             "dev/prod)",
             "secrets in source code instead of .env",
             "no separation between dev and production configuration",
             "assumes an environment variable always exists, with no default or validation"),
            ("Programación Orientada a Objetos (clases, encapsulamiento, herencia, "
             "polimorfismo, dataclasses, enums)",
             "mutable class attribute shared between instances",
             "class that does too much",
             "inheritance where composition would avoid fragile coupling",
             "compares objects with == without defining __eq__",
             "internal state exposed directly instead of through @property"),
            ("Decoradores y context managers",
             "decorator without functools.wraps",
             "side effect at decoration time instead of call time",
             "stacked decorators in the wrong order",
             "decorator swallows exceptions without re-raising",
             "synchronous decorator applied to an async function"),
            ("Asyncio (async/await, event loop, gather, tasks)",
             "blocking call inside an async function",
             "coroutine created but never awaited",
             "gather() over tasks that share mutable state",
             "exception inside a gather() task silently swallowed",
             "inconsistent mixing of sync and async code"),
            ("Testing (pytest, fixtures, mocking, parametrización)",
             "test without a real assert",
             "mocks the function under test instead of its external dependency",
             "fixture with shared mutable state",
             "only the happy path, no pytest.raises",
             "flaky test because of a real network call"),
        ),
    ),
    Discipline(
        "javascript", "programming", "JavaScript",
        ("implement", "debug", "refactor", "explain"),
        "Every exercise must be framed as a real frontend/automation task: a component "
        "consuming a REST API, a form validation pipeline, a data transformation feeding a "
        "React list, a scheduled fetch job, a retry handler; never an isolated algorithm "
        "puzzle. The stack is React + TypeScript calling FastAPI backends and third-party "
        "APIs. " + _NO_TOY_NAMES + " Bugs must be found by reasoning about behaviour and "
        "output, never by spotting a syntax error.",
        _skills(
            ("Control de flujo (if/else, switch, for, while, for...of, for...in)",
             "== instead of === causes silent bugs with null, 0 or \"\"",
             "infinite loop from a stop condition built on a Promise",
             "switch without break falls through silently"),
            ("Estructuras de datos (Array, Object, Map, Set, destructuring, spread)",
             "mutates an array/object directly instead of copying it (classic React state bug)",
             ".find() returns undefined and it is not checked",
             "iterates Object.keys() assuming a reliable insertion order",
             "one-level spread (shallow copy) of a nested object"),
            ("Manejo de strings/texto (template literals, parsing, .split()/.join(), "
             ".replace(), .trim())",
             "does not .trim() user input",
             "parseInt() without the radix argument",
             "split() leaves a trailing empty string",
             "template literal prints the word \"undefined\""),
            ("Funciones y scope (let/const/var, closures, this, arrow vs regular, hoisting)",
             "this lost in a callback (should be an arrow function)",
             "closure captures a var loop variable by reference",
             "hoisted var creates unexpected behaviour",
             "function implicitly returns undefined"),
            ("Descomposición de problemas (SRP en funciones, separar lógica de rendering, "
             "contratos claros)",
             "one function mixes fetch, validation, transformation and render",
             "hidden coupling through an object shared between functions that should be "
             "independent",
             "function name promises 2 responsibilities but performs 4"),
            ("Manejo de errores (try/catch/finally, errores custom, errores de API, "
             "Promise.reject)",
             "empty catch swallows the error without logging it",
             "async call without await inside the catch body",
             "fetch resolves with a 4xx/5xx status and it is not handled",
             "throws a string instead of an Error object"),
            ("Composición funcional (.map()/.filter()/.reduce(), encadenamiento, funciones de "
             "orden superior)",
             ".map() with a hidden side effect that mutates the original array",
             ".reduce() with a wrong or missing initialValue",
             "chain consumes an iterator only once (exhaustion)",
             ".filter() always returns true because of a weak comparison"),
            _DELIBERATE_DEBUGGING,
            ("Async/await y Promises (async/await, Promise.all, fetch, manejo de errores "
             "async)",
             "forgotten await: the variable holds an unresolved Promise",
             "Promise.all: one rejected promise discards all the other results",
             "async callback inside .forEach is not awaited",
             "nested async callback without error handling"),
            ("Consumo de APIs externas (fetch con auth, timeouts, retry, rate limits, "
             "validación de respuesta)",
             "calls .json() without checking response.ok",
             "no AbortController timeout",
             "retries a non-idempotent POST and duplicates its effect",
             "assumes the response shape without optional chaining",
             "credentials in source code"),
            ("Variables de entorno y configuración (.env, import.meta.env, separación "
             "dev/prod)",
             "uses process.env in Vite instead of import.meta.env",
             "does not handle a missing variable",
             "exposes a private value through the VITE_ prefix"),
            ("POO en JS (clases, #privado, get/set, herencia, instanceof)",
             "mutable attribute on the prototype shared between instances",
             "compares objects with === without valueOf/equals",
             "this lost when a method is extracted from the instance",
             "extends without calling super() in the constructor"),
            ("Tipado dinámico y validación en runtime (typeof, duck typing, zod/yup, "
             "optional chaining ?., ??)",
             "typeof null === \"object\" produces a false positive",
             "chained ?. silences a real missing-data bug",
             "?? vs || confusion when 0 or \"\" are legitimate values",
             "assumes the API shape without validating it (zod/yup)"),
            ("Testing (Jest/Vitest, expect, vi.fn(), beforeEach, mocking de fetch)",
             "test without expect (always passes)",
             "mocks the function under test instead of its external dependency",
             "beforeEach with mutable state shared between tests",
             "test calls the real fetch (flaky)",
             "forgets async/await in an async test"),
        ),
    ),
    Discipline(
        "sql", "programming", "SQL (PostgreSQL)",
        ("design", "implement", "debug", "refactor", "explain"),
        "Every exercise must be framed as a real database/automation task: a schema for a "
        "webhook-driven pipeline, a query feeding an n8n workflow, a transaction wrapping a "
        "multi-table upsert, a trigger maintaining audit state; never an isolated textbook "
        "puzzle with placeholder table names like tabla1 or data. PostgreSQL is the "
        "persistence layer for FastAPI, a queue/trigger source for n8n and the destination "
        "of data pipelines. Bugs must be found by reasoning about behaviour, result or side "
        "effect, never by spotting a syntax error.",
        _skills(
            ("Tipos de datos y DDL (CREATE TABLE, constraints, tipos, ALTER)",
             "TIMESTAMP without time zone instead of TIMESTAMPTZ",
             "VARCHAR(n) where TEXT was correct",
             "missing NOT NULL on a critical column",
             "SERIAL where UUID would avoid collisions between environments",
             "foreign key without an explicit ON DELETE"),
            ("Normalización y diseño de esquemas (1FN/2FN/3FN, relaciones, naming, soft "
             "delete)",
             "repeated data that violates 2NF/3NF",
             "multi-valued column (violates 1NF)",
             "unnecessarily coupled N:M pivot table",
             "inconsistent snake_case naming",
             "SELECT * in production"),
            ("DML — CRUD básico (SELECT, INSERT, UPDATE, DELETE, RETURNING, filtros)",
             "UPDATE without WHERE updates every row",
             "DELETE without checking foreign keys",
             "omits RETURNING when the id was needed",
             "duplicate INSERT without ON CONFLICT",
             "LIKE '%term%' that cannot use an index on a large table"),
            ("JOINs y agregaciones (INNER/LEFT/FULL, GROUP BY, HAVING, subqueries, CTEs)",
             "LEFT JOIN produces unexpected NULLs that are not filtered",
             "GROUP BY with a non-aggregated column",
             "HAVING confused with WHERE",
             "CTE materialized when it was unnecessary"),
            ("Índices y performance (CREATE INDEX, EXPLAIN ANALYZE, B-tree vs GIN, índice "
             "parcial)",
             "index on a low-cardinality column (useless)",
             "no GIN index on a frequently queried JSONB column",
             "EXPLAIN without ANALYZE (estimated plan, not the real one)",
             "index on a foreign key that is never queried"),
            ("Transacciones y concurrencia (BEGIN/COMMIT/ROLLBACK, niveles de aislamiento, "
             "locking, SKIP LOCKED)",
             "BEGIN without an explicit COMMIT in a migration script",
             "wrong isolation level (allows phantom reads)",
             "deadlock from inconsistent lock order between transactions",
             "queue UPDATE without FOR UPDATE under concurrency"),
            ("Idempotencia en automatización (ON CONFLICT, tablas de eventos procesados, "
             "diseño de colas de trabajo)",
             "pipeline run twice duplicates rows (no ON CONFLICT)",
             "does not record the event in a processed-events table before executing the "
             "effect",
             "upsert overwrites valid data because DO UPDATE SET has no condition"),
            _DELIBERATE_DEBUGGING,
            ("Funciones, procedimientos y triggers (PL/pgSQL, CREATE TRIGGER, NEW/OLD, "
             "LISTEN/NOTIFY)",
             "BEFORE trigger modifies NEW without RETURN NEW",
             "function without a declared RETURN",
             "NOTIFY inside a trigger without knowing it is only delivered after COMMIT",
             "trigger calls an external function (anti-pattern inside a transaction)"),
            ("Migraciones y versionado de esquema (Alembic, up/down, autogenerate)",
             "manual ALTER TABLE in production without a matching Alembic migration",
             "Alembic autogenerate accepted without review (may include wrong drops)",
             "downgrade not implemented, assuming it never fails"),
            ("Seguridad y control de acceso (GRANT/REVOKE, mínimo privilegio, prepared "
             "statements, SSL)",
             "application user with SUPERUSER or DBA privileges",
             "credentials inside the SQL script",
             "no prepared statements, leaving the door open to SQL injection",
             "GRANT ALL instead of only the needed privileges"),
            ("JSONB en profundidad (->, ->>, #>, @>, jsonb_set, índice GIN, cuándo usarlo vs "
             "columnas)",
             "uses -> (returns json) instead of ->> (returns text) in a comparison",
             "no GIN index on a JSONB field used in WHERE",
             "JSONB where normalized columns would give stronger integrity",
             "jsonb_set with a wrong path fails silently"),
            ("Postgres como pieza de automatización n8n (polling, LISTEN/NOTIFY, SKIP LOCKED, "
             "vistas como capa estable)",
             "polling without a processed_at/status column processes the same row twice",
             "no SKIP LOCKED on a concurrent queue: two workers take the same job",
             "view exposed to n8n is coupled to internal details, so a schema change breaks "
             "the workflow",
             "assumes NOTIFY is persistent (it is lost if n8n is not listening)"),
        ),
    ),
    Discipline(
        "git", "programming", "Git",
        ("commands", "find_error", "explain"),
        "Every exercise is real and situated in the daily work of a solo full-stack developer: "
        "a repo with concrete files, realistic commit messages, domain branch names "
        "(feature/login, hotfix/precio-null) and a real starting state shown as git status / "
        "git log output; never placeholders like archivo1 or ramaA. The learner writes the "
        "commands; the judge replays them mentally against the stated state. The mastery "
        "signal is the expected final state (git log, git status, git diff), never the "
        "commands.",
        _skills(
            ("Configuración e inicialización (init, config, .gitignore)",
             "adds .gitignore after the files were already tracked, so they stay tracked",
             "commits secrets or build artifacts (.env, node_modules) for lack of a .gitignore",
             "wrong user.name/user.email identity (global vs per-repo config confused)"),
            ("Staging y commits (add, commit, status, diff)",
             "commits files that should not be committed",
             "empty or useless commit message",
             "stages everything with git add . without reviewing"),
            ("Historial y navegación (log, show, checkout, detached HEAD)",
             "ends up in detached HEAD without noticing",
             "unreadable git log for lack of flags",
             "confuses checking out a commit with checking out a branch"),
            ("Branching (branch, switch, merge, fast-forward vs 3-way)",
             "merges into the wrong branch",
             "fast-forward when a merge commit was needed",
             "branch never deleted after the merge"),
            ("Resolución de conflictos",
             "commits conflict markers (<<<<<<<)",
             "resolves the conflict by deleting both sides",
             "never verifies the result after resolving"),
            ("Trabajo remoto (clone, push, pull, fetch, remote)",
             "pushes directly to main",
             "pulls without fetching first on a diverged history",
             "misconfigured remote"),
            ("Corrección de errores (reset, revert, amend, stash)",
             "reset --hard where revert was appropriate",
             "amends a commit that was already pushed",
             "stash lost without being applied"),
            ("Colaboración (fork, PR workflow, code review en GitHub)",
             "PR without a description",
             "fix commits mixed with feature commits in the same PR",
             "merge without review"),
            ("Historial avanzado (rebase interactivo, bisect, blame)",
             "rebases a shared branch",
             "bisect abandoned halfway",
             "reads blame without the date context"),
        ),
    ),
    Discipline(
        "english_grammar", "english", "Gramática inglesa",
        ("rewrite", "find_error", "cloze", "translate", "true_false"),
        "The learner is a native Spanish speaker (today A2, aiming for C1). Sentences come "
        "from realistic contexts the learner meets: work emails and meetings in a tech/"
        "automation job, travel and daily life. Target the errors a Spanish speaker "
        "actually makes (transfer from Spanish) and calibrate vocabulary and structures to "
        "the CEFR level of the exercise.",
        _skills(
            ("Tiempos verbales",
             "uses present simple for actions in progress",
             "uses present simple with since/for where present perfect is needed",
             "uses present perfect with a finished time expression (yesterday, in 2020)",
             "omits the third-person -s",
             "uses the wrong past participle (has went, have saw)"),
            ("Artículos y determinantes",
             "uses 'the' with general plural or uncountable nouns (the life is hard)",
             "omits a/an before a singular countable noun (she is teacher)",
             "confuses much/many or few/little",
             "uses 'the' before possessives or proper names by transfer"),
            ("Preposiciones",
             "in/on/at chosen by transfer from Spanish 'en'",
             "depend of instead of depend on",
             "arrive to instead of arrive in/at",
             "married with instead of married to"),
            ("Orden de palabras",
             "adjective after noun",
             "omits the subject pronoun (pro-drop transfer)",
             "missing dummy subject: 'is important' instead of 'it is important'",
             "adverb between verb and object (I like very much football)",
             "question without auxiliary inversion"),
            ("Condicionales",
             "will in the if-clause",
             "mixes second and third conditional forms",
             "would in both clauses"),
            ("Voz pasiva",
             "omits the auxiliary be (the report written yesterday)",
             "uses the simple past instead of the participle (was wrote)",
             "translates the Spanish impersonal 'se' literally"),
            ("Oraciones de relativo",
             "what instead of which/that (the car what I bought)",
             "who for things or which for people",
             "commas misused between defining and non-defining clauses",
             "keeps a resumptive pronoun (the man that I saw him)"),
            ("Estilo indirecto",
             "does not backshift tenses",
             "keeps question word order in reported questions",
             "say vs tell confusion (he said me)"),
        ),
    ),
    Discipline(
        "english_vocabulary", "english", "Vocabulario inglés",
        ("cloze", "translate", "explain"),
        "The learner is a native Spanish speaker (today A2, aiming for C1). Vocabulary comes "
        "from realistic work (tech/automation) and daily-life contexts, always inside a "
        "full sentence; target Spanish-speaker confusions and the CEFR level of the "
        "exercise.",
        _skills(
            ("Colocaciones",
             "make/do confusion",
             "say a lie instead of tell a lie (decir -> say/tell)",
             "win/earn money confusion (ganar)",
             "strong/heavy mismatch (strong rain instead of heavy rain)"),
            ("Phrasal verbs",
             "wrong particle (look for vs look after)",
             "pronoun after the particle of a separable verb (pick up it)",
             "avoids the phrasal verb and uses a stiff Latinate verb in informal register"),
            ("Falsos amigos (ES→EN)",
             "false friend: actually/actualmente",
             "false friend: embarrassed/embarazada",
             "false friend: assist/asistir",
             "false friend: library/librería",
             "false friend: sensible/sensitive"),
            ("Formación de palabras",
             "wrong suffix for the part of speech (the economic of the country)",
             "-ed/-ing adjective confusion (I am boring)",
             "wrong negative prefix (unpossible)"),
        ),
    ),
    Discipline(
        "english_writing", "english", "Redacción en inglés",
        ("writing", "rewrite"),
        "The learner is a native Spanish speaker (today A2, aiming for C1). Tasks are real "
        "writing needs: a paragraph about work or study, an email to a colleague or client, "
        "an opinion essay. State the word range and the CEFR level; judge with CEFR writing "
        "criteria.",
        _skills(
            ("Párrafo",
             "no clear topic sentence",
             "run-on sentences joined with commas (comma splice)",
             "ideas not connected by linkers"),
            ("Correo electrónico",
             "register mismatch (too informal for a formal email)",
             "purpose not stated in the opening lines",
             "calqued Spanish formulas (I write you for...)"),
            ("Ensayo de opinión",
             "opinion not stated clearly in the introduction",
             "arguments without support or examples",
             "no conclusion restating the position",
             "overuses the same linker"),
        ),
    ),
)

DISCIPLINES: dict[str, Discipline] = {d.id: d for d in _CATALOGUE}

DEFAULT_DISCIPLINE: dict[str, str] = {
    "mathematics": "math_general",
    "programming": "programming_logic",
    "english": "english_grammar",
}


def discipline_for(frontmatter: dict) -> Discipline:
    fm = frontmatter if isinstance(frontmatter, dict) else {}
    explicit = str(fm.get("discipline") or "").strip().lower()
    if explicit in DISCIPLINES:
        return DISCIPLINES[explicit]
    if mode_for(fm).id == "drill":
        return DISCIPLINES["math_drill"]
    subject = str(fm.get("subject") or "").strip().lower()
    return DISCIPLINES[DEFAULT_DISCIPLINE.get(subject, "math_general")]


def normalize_skill_code(code) -> str:
    """6, "6" and "06" are the same skill: "06"."""
    text = str(code if code is not None else "").strip()
    return f"{int(text):02d}" if text.isdigit() else text


def skill_of(discipline: Discipline, code) -> Skill | None:
    wanted = normalize_skill_code(code)
    return next((s for s in discipline.skills if s.code == wanted), None)
