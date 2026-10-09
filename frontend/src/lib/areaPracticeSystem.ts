// SISTEMA DE PRÁCTICA POR ÁREA. Cada área del plan (Backend, Frontend, Databases, Automation, Tooling and Quality y, si están, Desktop y
// Mobile) tiene su PROPIA práctica diaria dentro de `Programación/programming_practice/<área>/`:
//
//   <área>/README.md       propósito del área, cómo se practica cada día y habilidades clave
//   <área>/skills.md       las habilidades más importantes del área y cómo se miden, con la progresión por nivel
//   <área>/katas/          un kata por día numerado (`001 …md`), con enunciado, criterios, pistas y solución esperada (oculta hasta calificar)
//   <área>/projects/       el proyecto semanal y el mensual del área (README con la plantilla; los proyectos reales los crea `pp_build`)
//   progreso               DERIVABLE: no se guarda ningún archivo; sale de los intentos del ledger y de las marcas manuales (ver `practiceState.ts`)
//
// Los katas son INDIVIDUALES POR ÁREA, diarios (20-30 min) y se centran en (1) la LÓGICA propia del área y (2) sus HABILIDADES MÁS IMPORTANTES
// (`AREA_SKILLS` de `planAreaPractice.ts`). La dificultad sube con el nivel declarado o medido (1-3). `kataForDay` es DETERMINISTA: el mismo
// área, día y nivel dan siempre el mismo kata. Las carpetas solo las crea «Ejecutar plan» (con confirmación) y nunca se sobrescribe nada.
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. La escritura en disco vive en `core/mentor/areaPracticeFolders.ts`.

import { AREA_PRACTICE, AREA_SKILLS, areaKataSkillId, type AreaSkill } from "./planAreaPractice.js";
import { eachDay, isoDow, weekRangesOf } from "./planTime.js";

export const PP_ROOT = "programming_practice";
/** Las áreas con sistema de práctica propio. */
export const PRACTICE_AREA_IDS = ["backend", "frontend", "databases", "automation", "tooling", "desktop", "mobile"] as const;
export type PracticeAreaId = (typeof PRACTICE_AREA_IDS)[number];
export const isPracticeAreaId = (id: unknown): id is PracticeAreaId => (PRACTICE_AREA_IDS as readonly string[]).includes(String(id));

/** Nombre de cada área tal como se ve en la interfaz. */
export const AREA_LABEL: Record<PracticeAreaId, string> = { backend: "Backend", frontend: "Frontend", databases: "Databases", automation: "Automation", tooling: "Tooling and Quality", desktop: "Desktop", mobile: "Mobile" };
/** Carpeta del área dentro de `programming_practice/` (en inglés, como todo el espacio de Programación). */
export const AREA_FOLDER: Record<PracticeAreaId, string> = { backend: "backend", frontend: "frontend", databases: "databases", automation: "automation", tooling: "tooling-and-quality", desktop: "desktop", mobile: "mobile" };

export const areaFolderOf = (areaId: string): string => (isPracticeAreaId(areaId) ? AREA_FOLDER[areaId] : areaId.replace(/[^a-z0-9-]+/gi, "-").toLowerCase());
export const areaLabelOf = (areaId: string): string => (isPracticeAreaId(areaId) ? AREA_LABEL[areaId] : areaId);

// ── Niveles ─────────────────────────────────────────────────────────────

export type KataLevel = 1 | 2 | 3;
export const KATA_LEVEL_LABEL: Record<KataLevel, string> = { 1: "Principiante", 2: "Intermedio", 3: "Avanzado" };
const KATAS_PER_LEVEL_UP = 40;

/** Nivel declarado («basico», «intermedio», «junior», «senior»…) → 1..3; sin dato, 1. */
export function levelFromDeclared(v: unknown): KataLevel {
  const k = String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/^(avanz|advanced|senior|expert)/.test(k)) return 3;
  if (/^(inter|mid|medio)/.test(k)) return 2;
  return 1;
}

/** El nivel de los katas: parte del declarado y sube un nivel cada 40 katas hechos (nivel medido por la práctica), como mucho 3. */
export function kataLevel(declared: unknown, doneCount: number): KataLevel {
  return Math.min(3, levelFromDeclared(declared) + Math.floor(Math.max(0, doneCount) / KATAS_PER_LEVEL_UP)) as KataLevel;
}

/** El nivel declarado de un área en las precondiciones del plan (por id, por nombre o el de la materia general). */
export function declaredLevelOf(levels: Record<string, string> | undefined, areaId: string): string | undefined {
  if (!levels) return undefined;
  const label = areaLabelOf(areaId);
  const keys = Object.keys(levels);
  const hit = keys.find((k) => k.toLowerCase() === areaId || k.toLowerCase() === label.toLowerCase()) ?? keys.find((k) => /^programaci|^programming/i.test(k));
  return hit ? levels[hit] : undefined;
}

// ── Escenarios y plantillas de kata ─────────────────────────────────────

interface Scenario {
  id: string;
  /** «library loan» */
  noun: string;
  plural: string;
  /** una frase de contexto real */
  context: string;
  /** la regla de negocio que hay que respetar */
  rule: string;
  fields: string;
}

const SCENARIOS: readonly Scenario[] = [
  { id: "library", noun: "loan", plural: "loans", context: "A small public library lends books to members.", rule: "a member can hold at most 3 books at once and each loan lasts 14 days", fields: "member, book, loaned_on, due_on, returned_on" },
  { id: "support", noun: "ticket", plural: "tickets", context: "A support team receives tickets from customers.", rule: "a ticket moves from open to in_progress to resolved and is never reopened silently", fields: "id, customer, subject, priority, status, created_at" },
  { id: "delivery", noun: "parcel", plural: "parcels", context: "A courier company tracks parcels between depots.", rule: "a parcel has exactly one current depot and every move is recorded", fields: "tracking_code, origin, destination, weight_kg, current_depot" },
  { id: "gym", noun: "booking", plural: "bookings", context: "A gym lets members book places in group classes.", rule: "a class never exceeds its capacity and a member cannot book two classes that overlap", fields: "member, class, starts_at, capacity, status" },
  { id: "invoices", noun: "invoice", plural: "invoices", context: "A freelancer issues invoices to clients.", rule: "an invoice total is the sum of its lines plus tax and a paid invoice cannot be edited", fields: "number, client, lines, tax_rate, total, paid_at" },
  { id: "food", noun: "order", plural: "orders", context: "A restaurant app takes orders from customers.", rule: "an order needs at least one item and its total must match the item prices at the time of the order", fields: "id, customer, items, total, status, placed_at" },
  { id: "devices", noun: "device", plural: "devices", context: "An IT team keeps an inventory of laptops and phones.", rule: "a device is assigned to at most one person and every assignment is kept in a history", fields: "serial, model, assigned_to, purchased_on, status" },
  { id: "tickets", noun: "ticket", plural: "event tickets", context: "A venue sells tickets for concerts.", rule: "the number of tickets sold never exceeds the seats and a ticket can be used only once", fields: "code, event, seat, price, used_at" },
];

interface KataTemplate {
  /** el trabajo concreto; {noun} {plural} {fields} {rule} y {context} se sustituyen */
  task: string;
  /** qué hay que entregar */
  deliverable: string;
  hints: readonly [string, string];
  solution: string;
  errors: readonly [string, string];
}

const T = (task: string, deliverable: string, hints: [string, string], solution: string, errors: [string, string]): KataTemplate => ({ task, deliverable, hints, solution, errors });

/** Una plantilla por habilidad (id de `AREA_SKILLS`). */
const TEMPLATES: Readonly<Record<string, KataTemplate>> = {
  // ── backend ──
  endpoint_design: T("Design the HTTP API for {plural}: list, read, create and change one {noun}.", "A table with method, path, request body, response body and status codes for every endpoint.", ["Name the resource with a plural noun and let the HTTP verb carry the action.", "Decide what a missing {noun}, a duplicate and a bad request return before writing the table."], "GET /{plural} (200, paginated), GET /{plural}/{id} (200 or 404), POST /{plural} (201 with Location, 422 on invalid body, 409 on a rule violation), PATCH /{plural}/{id} (200, 404, 409).", ["Using verbs in paths such as /createLoan", "Returning 200 for every error"]),
  validation_errors: T("Write the validation for creating a {noun} with these fields: {fields}. Rule: {rule}.", "The list of validations and the exact JSON error response for three different invalid requests.", ["Validate shape and types first, business rules second.", "Return every field error in one response so the client fixes them in one go."], "A stable body such as {\"error\":\"validation_failed\",\"fields\":[{\"field\":\"due_on\",\"message\":\"must be after loaned_on\"}]} with status 422, and the rule violation as 409 with its own code.", ["Stopping at the first error", "Mixing a validation error with a business-rule error in the same status"]),
  state_transitions: T("Model the life of a {noun} as a state machine. Rule: {rule}.", "A table of allowed transitions and the function transition(current, event) that returns the new state or a conflict error.", ["Write the transitions as data, not as nested ifs.", "Decide what happens when the same event arrives twice."], "A map of state to allowed events to next state; any other pair raises a conflict (HTTP 409). A repeated event that already led to the target state returns the same result.", ["Allowing any state to jump to any other", "Forgetting the transition caused by a timeout or a cancel"]),
  transactions_idempotency: T("Creating a {noun} writes two records and sends one notification. The client may retry the request. Rule: {rule}.", "The ordered steps of the service, where the transaction begins and ends, and how a retry is recognised.", ["The notification must not be sent if the transaction rolls back.", "Store an idempotency key with the result and return the stored result on a retry."], "Begin a transaction, insert both records and the idempotency key, commit, then send the notification from an outbox so a crash cannot lose or duplicate it.", ["Sending the notification before the commit", "Using the clock instead of a client-supplied key to detect retries"]),
  auth_security: T("Decide who may read, change and delete a {noun}. {context}", "A permission table by role and ownership, and the checks in the order they run.", ["Authenticate first (401), then authorise (403 or 404).", "Never trust an id sent by the client without checking the owner."], "Anonymous gets 401; an authenticated user gets only their own {plural}; staff may read all; only an admin deletes. Return 404 instead of 403 when the existence of the record must not leak.", ["Checking only that the user is logged in", "Putting the authorisation check in the UI only"]),
  service_testing: T("Write the test list for the service that creates a {noun}. Rule: {rule}.", "A list of at least 6 named tests (happy path, boundaries, failures) and the full code of two of them.", ["One test, one reason to fail.", "Test the boundary of the rule: exactly at the limit and one over."], "Tests such as creates_a_valid_{noun}, rejects_missing_field, accepts_exactly_the_limit, rejects_one_over_the_limit, is_idempotent_on_retry, does_not_notify_on_rollback.", ["Asserting only that no exception was raised", "Tests that depend on the current time"]),
  // ── frontend ──
  component_composition: T("Build a screen that lists {plural} with a header, a filter and a row for each {noun} ({fields}).", "The component tree, the props of each component and the code of the row and the list.", ["A component takes data and callbacks as props and does one thing.", "If two components need the same state, move it to their closest common parent."], "Page > Filter + List > Row. Row({{noun}, onSelect}) is pure; List maps {plural} to Row; the filter text lives in Page and is passed down.", ["Fetching data inside the row component", "Passing the whole store to every component"]),
  state_management: T("A form edits a {noun} ({fields}). Rule: {rule}.", "Where each piece of state lives, which values are derived, and the code of the update logic.", ["Do not store anything you can compute from other state.", "Keep the draft separate from the saved value so Cancel works."], "One draft object in the form, validation derived from the draft on every render, the saved {noun} untouched until Save; the submit handler sends the draft and replaces the saved value only on success.", ["Copying props into state", "Keeping a validation flag that can get out of sync with the fields"]),
  accessibility: T("Make a list of {plural} with an Add button and a Delete button on every row usable with a keyboard and a screen reader.", "The markup, the accessible names, the focus order and what is announced after a deletion.", ["Use real buttons and labels before adding ARIA.", "After deleting, move focus somewhere sensible and announce the result."], "Buttons with names such as \"Delete {noun} {id}\", a visible focus ring, a live region that says \"{noun} deleted\", and focus moved to the next row or to the list heading.", ["Using a div with an onClick as a button", "Removing the focus outline"]),
  atomic_design: T("Using Atomic Design, build the card that shows a {noun} ({fields}) in a catalogue.", "The atoms, molecules and organism with their props, and the template that places the organism.", ["Atoms know nothing about {plural}; the organism knows the data.", "Each piece must be usable on another page without changes."], "Atoms: Badge, Button, Text. Molecule: LabelledValue. Organism: {Noun}Card made only of those pieces. Template: CatalogueGrid receives cards as children.", ["Putting data fetching in an atom", "Building one big component and calling it an organism"]),
  async_ui: T("A page loads the {plural} from an API. Rule: {rule}.", "The states the page can be in and what the user sees and can do in each of them, plus the code that switches between them.", ["Loading, error, empty and success are four different screens.", "A retry must be possible from the error state."], "A single status value (loading, error, empty, ready) drives the render; the error state shows the message and a Retry button; an empty list explains how to add the first {noun}; a stale response is ignored if the request changed.", ["Showing an empty list while loading", "Leaving the user stuck after an error"]),
  responsive_layout: T("Lay out a grid of {plural} cards that works from 320 px to a wide desktop screen.", "The CSS for the layout and a description of how it behaves at 320, 768 and 1280 px.", ["Let the grid decide the number of columns from the available width.", "Long text must wrap or truncate on purpose, never overflow."], "A grid with repeat(auto-fill, minmax(16rem, 1fr)), min-width: 0 on the cards, wrapped text and tap targets of at least 44 px.", ["Fixing widths in pixels", "Testing only at one screen size"]),
  // ── databases ──
  data_modeling: T("Design the tables for this case. {context} Rule: {rule}. Fields: {fields}.", "The CREATE TABLE statements with keys, foreign keys and constraints, and one line explaining each constraint.", ["Each fact lives in exactly one place.", "Express the rule with a constraint wherever the database can enforce it."], "Separate tables for the people, the things and the {plural} that link them, with primary and foreign keys, NOT NULL, CHECK and UNIQUE constraints that encode the rule.", ["Storing a list in one column", "Relying on the application to enforce uniqueness"]),
  joins_queries: T("Write the query that answers: which {plural} are overdue or incomplete, with the person's name? Tables hold {fields}.", "The query, the result for a sample of 5 rows you invent, and why each join type was chosen.", ["Start from the table whose rows you want in the result.", "A LEFT JOIN keeps rows with no match; an inner join silently drops them."], "SELECT with an inner join to the person and a LEFT JOIN to the related table, filtered by the condition in WHERE, with an ORDER BY that makes the result stable.", ["Using an inner join and losing rows without a match", "Filtering a LEFT JOIN in WHERE and turning it into an inner join"]),
  aggregation: T("Report the number of {plural} and the total per month and per person. Fields: {fields}.", "The query, including months and people with zero {plural}, and a sample result.", ["Decide the grain of the result before grouping.", "To keep empty groups, start from the list of months or people and LEFT JOIN."], "A calendar or people table LEFT JOINed to the {plural}, GROUP BY month and person, COUNT of the {noun} id (not COUNT(*)) and COALESCE for the sums.", ["COUNT(*) counting the empty rows as one", "Selecting columns that are not grouped"]),
  indexing: T("The query WHERE person = ? AND status = ? ORDER BY created_at DESC LIMIT 20 on {plural} is slow with 5 million rows.", "The index you create, why that column order, and what the query plan should show before and after.", ["Equality columns first, then the sort column.", "An index that is not used costs writes and gives nothing."], "CREATE INDEX on ({plural}) (person, status, created_at DESC) so the plan changes from a sequential scan and sort to an index scan with no sort.", ["Indexing every column", "Putting the sort column before the equality columns"]),
  transactions_locking: T("Two clients book the last place of a class at the same time. Rule: {rule}.", "The SQL of each client, the possible interleavings and how you make the result correct.", ["Reading and then writing is not atomic.", "Let a constraint or a locking read decide who wins."], "Either UPDATE with a guard (UPDATE ... SET places = places - 1 WHERE places > 0) and check the affected rows, or SELECT ... FOR UPDATE inside a transaction; the loser gets a clear failure.", ["Reading the count in the application and then updating", "Assuming the default isolation level prevents it"]),
  migrations: T("The {plural} table must change: split a column into two and add a new constraint without losing data. Fields now: {fields}.", "The ordered migration steps, the backfill, the rollback and how you check the data afterwards.", ["Add first, copy, then enforce, then remove.", "Every step must be reversible or safe to repeat."], "1 add nullable columns, 2 backfill in batches, 3 verify counts, 4 add NOT NULL and the constraint, 5 deploy code that uses the new columns, 6 drop the old column in a later release.", ["Dropping the old column in the same step", "Adding NOT NULL before the backfill"]),
  // ── automation ──
  idempotent_scripts: T("Write a script that processes the daily export of {plural} ({fields}) into the reporting folder. Rule: {rule}.", "The steps of the script and how running it twice (or after a crash) gives the same result.", ["Decide what marks a unit of work as done.", "Write to a temporary file and rename it when complete."], "List the input files, skip the ones whose output exists and matches the checksum, write outputs atomically with a temporary name, and record a marker only after the rename.", ["Appending to the output on every run", "Marking the work done before it finished"]),
  parsing_text: T("Parse a log or CSV file of {plural} with the fields {fields}. Some lines are malformed.", "The parsing function, the list of rejected lines with the reason, and the totals.", ["Never let one bad line stop the whole file.", "Count what you rejected so nothing disappears silently."], "Read line by line, validate the number of fields and each type, collect good rows and (line number, reason) for bad ones, and print counts that add up to the number of lines.", ["Splitting on commas without handling quotes", "Swallowing exceptions without counting them"]),
  scheduling: T("The {noun} report must be generated every weekday at 07:30 and must never run twice at the same time.", "The schedule expression, the lock strategy and what happens if the machine was off at 07:30.", ["A lock must be released even if the job crashes.", "Decide whether a missed run is skipped or caught up."], "A cron-style 30 7 * * 1-5 in the server time zone, an advisory lock or lock file with a timeout, and a catch-up rule that runs once at start if the last success is older than a day.", ["Starting a new run while the previous one is still going", "Ignoring daylight-saving changes"]),
  retries_errors: T("A job sends each {noun} to an external service that sometimes fails. Rule: {rule}.", "The retry policy, which errors are retried, what is logged and where the failed {plural} go.", ["Retry only what is safe to repeat.", "Add a growing delay and a maximum number of attempts."], "Retry network errors and 5xx with exponential backoff and jitter up to N attempts; do not retry 4xx; after the last attempt move the {noun} to a dead-letter list with the error.", ["Retrying forever without delay", "Retrying a request that creates something without an idempotency key"]),
  api_integration: T("Download all {plural} from a paginated API that allows 60 requests per minute and needs a token that expires.", "The loop that pages through the data, the rate-limit handling and the token refresh.", ["Follow the next-page token until it is empty.", "Read the rate-limit headers instead of guessing."], "Page with the cursor until none is left, sleep when the remaining-requests header reaches zero, refresh the token on 401 once and retry, and stop with a clear error if the refresh fails.", ["Assuming the first page is everything", "Hard-coding the token in the script"]),
  logging_alerts: T("Add logging and alerting to the job that processes {plural}. Rule: {rule}.", "The log lines for a good run and a failed run, and the conditions that send an alert.", ["Log counts and identifiers, never secrets or whole payloads.", "Silence is also a failure: alert if the job did not run."], "Log start, number read, number processed, number failed and duration as structured fields; alert on any failure, on a count of zero when it is unusual, and on a missing run after the expected time.", ["Logging passwords or personal data", "Alerting on every warning until nobody reads the alerts"]),
  // ── tooling ──
  git_workflow: T("You committed a change about {plural} to the wrong branch and pushed it. Bring the repository to the right state without losing work.", "The exact sequence of Git commands and the state after each one.", ["Never rewrite history that others already pulled.", "Prefer a new commit that undoes the old one on a shared branch."], "Create the right branch from the commit, revert the commit on the wrong shared branch (git revert) instead of resetting it, push both, and check with git log --graph.", ["Using git push --force on a shared branch", "Resetting before making sure the work is saved on another branch"]),
  testing_practice: T("Write the tests for a function that calculates a {noun} total. Rule: {rule}.", "A failing test first, the minimal code to pass it, and three more tests for boundaries and errors.", ["Write the test before the code and watch it fail for the right reason.", "A test must fail if the code is broken."], "Red: a test with a known input and the expected total; Green: the simplest code; then tests for zero lines, the exact limit, a negative value and an invalid type.", ["Testing the implementation instead of the behaviour", "A test that always passes"]),
  ci_pipeline: T("Define a CI pipeline for a project that handles {plural}. It must be fast and block broken changes.", "The pipeline file (stages, commands, cache) and the rule that decides whether a change can be merged.", ["Run the cheapest checks first.", "Cache dependencies, not build results you cannot trust."], "Stages: install (cached), lint and type check, unit tests, build; the merge requires every stage to pass on the latest commit of the branch.", ["Running everything in a single step with no feedback", "Allowing a merge while the pipeline is red"]),
  dependencies: T("A teammate clones the project and it does not run. Make the setup for the {noun} service reproducible.", "The files and the one command that gets a fresh machine from clone to running tests.", ["Pin what you depend on and document what you cannot pin.", "Keep development tools out of production dependencies."], "A lock file, a pinned runtime version, a virtual environment or container, a Makefile or script with setup and test targets, and a README that lists the single command.", ["Installing packages globally", "Documenting steps that only work on your machine"]),
  debugging_tools: T("A job that creates {plural} sometimes creates two. You have the logs and the repository history.", "Your hypothesis, the evidence you collect with each tool, and the fix.", ["Reproduce first, then explain, then fix.", "git bisect finds the commit that introduced a regression."], "Reproduce with a script, add a log or a breakpoint at the creation point, find the missing guard or the concurrent call, fix the root cause and add a test that fails without the fix.", ["Fixing the symptom with a sleep", "Changing several things at once"]),
  code_quality: T("Set up the formatter, the linter and a pre-commit hook for the {noun} project.", "The configuration files, the commands and how the same checks run in CI.", ["The same command must run locally and in CI.", "Fix the code, do not silence the rule."], "A formatter config, a linter config with the rules the team agreed on, a pre-commit hook that runs both on staged files, and the CI job that runs the same commands on every change.", ["Disabling a rule instead of fixing the warning", "Checks that run only on the developer's machine"]),
  // ── desktop ──
  ipc_design: T("The window shows {plural} that live in the main process. Design the IPC channels to list, create and delete a {noun}.", "The channel names, the typed request and response of each and the error contract.", ["One channel per action, with a clear name.", "Validate in the main process; the renderer is not trusted."], "invoke channels such as {plural}:list, {plural}:create and {plural}:delete with typed payloads, validation in main, and errors returned as data with a code.", ["Exposing one generic channel that runs anything", "Trusting the id sent by the renderer"]),
  window_lifecycle: T("The app keeps {plural} open in a window. Handle close, minimise to tray, restore and a second launch.", "The events you handle, what is saved at each one and the behaviour on a second instance.", ["Save on the event, not on a timer you hope runs.", "A second launch should focus the existing window."], "Save the draft and the window bounds on close, hide to the tray if enabled, request a single-instance lock and focus the first window when a second instance starts.", ["Losing unsaved work on quit", "Opening a second copy of the app"]),
  secure_preload: T("Expose only what the renderer needs to work with {plural} and prove that it cannot reach the file system.", "The preload script, the exposed API and a list of the things the renderer cannot do.", ["contextIsolation on, nodeIntegration off.", "Expose functions, never the ipcRenderer itself."], "contextBridge exposes list{Noun}s() and save{Noun}(data) that call ipcRenderer.invoke with fixed channel names; the main process validates the payload.", ["Exposing the whole ipcRenderer", "Enabling nodeIntegration to make it work"]),
  file_persistence: T("Persist {plural} ({fields}) in a file so a crash never corrupts it.", "The save and load functions, the file layout and how a damaged file is recovered.", ["Write to a temporary file, flush, then rename.", "Keep a version number in the file."], "Serialise to JSON with a version, write to file.tmp, fsync, rename over the original, keep the previous copy as file.bak and fall back to it when parsing fails.", ["Overwriting the file in place", "No version number, so the format can never change"]),
  packaging_updates: T("Ship the {noun} app to users. Plan the installer, the version number and the update.", "The build steps, how the version is chosen and how an update and a rollback work.", ["Version the app and the data format separately.", "An update must be verifiable before it is applied."], "Build with the packager, sign the installer, publish with a semantic version and a checksum, check for updates at start, download in the background and keep the previous version for rollback.", ["Shipping without signing", "Updating without a way to go back"]),
  native_integration: T("Add a menu with shortcuts and a notification when a {noun} is due.", "The menu template with accelerators, the notification code and how it behaves on the target OS.", ["Use the platform accelerator (Ctrl or Cmd).", "Check that notifications are supported and allowed."], "A menu template with roles and accelerators for new, save and quit, a Notification with a click handler that focuses the window, and a fallback when notifications are disabled.", ["Hard-coding Ctrl on every platform", "Assuming notifications always work"]),
  // ── mobile ──
  navigation: T("Design the navigation of an app that shows {plural}: a list, a detail and a form.", "The navigator structure, the parameters each screen receives and the behaviour of Back.", ["Pass an id, not the whole object.", "Decide what Back does from the form."], "A stack with List, Detail(id) and Form(id?); tabs only for top-level sections; the form confirms before discarding changes on Back.", ["Passing large objects through navigation", "Making Back close the app by mistake"]),
  app_lifecycle: T("A user is typing a {noun} when a call comes in and the OS kills the app. Rule: {rule}.", "What is saved, when, and how the app restores the draft on the next start.", ["Assume the app can die at any moment.", "Save small drafts often, not big data rarely."], "Persist the draft on every field change (debounced) and on the background event; on start, detect a draft and offer to resume it.", ["Saving only on an explicit button", "Restoring a draft without telling the user"]),
  offline_storage: T("Show the {plural} list when there is no connection. Fields: {fields}.", "The storage choice, the cache rules and what the screen shows online, offline and while syncing.", ["Show the cached data first, then refresh.", "Mark data that has not reached the server yet."], "A local database table with a synced flag, read from it for the UI, refresh from the network in the background, and queue writes made offline.", ["Showing a blank screen without a connection", "Losing writes made offline"]),
  permissions: T("The app needs the camera to attach a photo to a {noun}.", "The flow for first request, denial and permanent denial, with the text shown in each case.", ["Ask in context, after explaining why.", "The app must still work without the permission."], "Explain, request, handle granted and denied, and when permanently denied offer a button to the system settings while keeping manual entry available.", ["Asking at the first launch for everything", "Crashing when the permission is denied"]),
  sync_conflicts: T("Two devices edit the same {noun} while offline. Rule: {rule}.", "How each change is recorded, how a conflict is detected and the resolution rule.", ["Every change needs a version or a timestamp.", "Decide whether the user or a rule wins."], "Each record has a version; the server rejects a write based on an old version; the client fetches, merges field by field when possible and asks the user only for the real conflicts.", ["Last write wins without telling anyone", "Comparing device clocks"]),
  mobile_performance: T("A list of 10 000 {plural} stutters on a low-end phone.", "The causes you suspect, how you measure them and the changes you make in order.", ["Measure first with the profiler.", "Render only what is on screen."], "Use a virtualised list with stable keys and memoised rows, move heavy work off the main thread, paginate the data and re-measure after each change.", ["Optimising without measuring", "Rendering all the rows at once"]),
};

const fill = (text: string, s: Scenario): string =>
  text
    // «a {noun}» → «an invoice» / «a loan»
    .replace(/\b([aA]) \{noun\}/g, (_m, a: string) => `${a}${/^[aeiou]/i.test(s.noun) ? "n" : ""} ${s.noun}`)
    .replace(/\{Noun\}/g, s.noun.charAt(0).toUpperCase() + s.noun.slice(1))
    .replace(/\{plural\}/g, s.plural)
    .replace(/\{noun\}/g, s.noun)
    .replace(/\{fields\}/g, s.fields)
    .replace(/\{rule\}/g, s.rule)
    .replace(/\{context\}/g, s.context);

// ── Kata ────────────────────────────────────────────────────────────────

export interface AreaKata {
  /** `backend-001` */
  id: string;
  areaId: string;
  /** nº de kata del área, desde 1 */
  day: number;
  title: string;
  skillId: string;
  skillName: string;
  /** dificultad efectiva 1..3 (cada 7.º kata sube un nivel como reto) */
  level: KataLevel;
  minutes: number;
  statement: string;
  criteria: string[];
  hints: string[];
  /** la solución esperada: va aparte en la nota (`## Solution`) y se muestra al calificar */
  solution: string;
  typicalErrors: string[];
  /** nombre de archivo sin carpeta, `001 Endpoint design - loans.md` */
  file: string;
}

const pad3 = (n: number): string => String(n).padStart(3, "0");
const clampLevel = (n: number): KataLevel => Math.max(1, Math.min(3, Math.round(n))) as KataLevel;
const safeFile = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

/** La habilidad del kata número `day` del área (rota por todas en orden). */
export function skillOfDay(areaId: string, day: number): AreaSkill | undefined {
  const skills = AREA_SKILLS[areaId] ?? [];
  return skills.length ? skills[(Math.max(1, day) - 1) % skills.length] : undefined;
}

/**
 * El kata `day` (1, 2, 3…) del área para un nivel (1-3). DETERMINISTA: la habilidad rota en orden, el escenario cambia cada vuelta y cada 7.º kata sube
 * un nivel como reto. `null` si el área no tiene sistema de práctica.
 */
export function kataForDay(areaId: string, day: number, level: number): AreaKata | null {
  const skills = AREA_SKILLS[areaId];
  if (!skills?.length) return null;
  const d = Math.max(1, Math.floor(Number(day) || 1));
  const idx = d - 1;
  const skill = skills[idx % skills.length]!;
  const tpl = TEMPLATES[skill.id];
  if (!tpl) return null;
  const cycle = Math.floor(idx / skills.length);
  const scenario = SCENARIOS[(idx * 3 + cycle * 5 + skills.indexOf(skill)) % SCENARIOS.length]!;
  const lvl = clampLevel(clampLevel(level) + (d % 7 === 0 ? 1 : 0));
  const minutes = lvl === 1 ? 20 : lvl === 2 ? 25 : 30;
  const title = `${skill.name} - ${scenario.plural}`;
  const task = fill(tpl.task, scenario);
  const statement = [
    `**Context.** ${scenario.context}`,
    "",
    `**Task (${KATA_LEVEL_LABEL[lvl].toLowerCase()}).** ${task}`,
    "",
    `**This level asks you to:** ${skill.levels[lvl - 1]}.`,
    ...(d % 7 === 0 ? ["", "*Stretch kata: one level above your usual one.*"] : []),
    "",
    `**Deliverable.** ${fill(tpl.deliverable, scenario)}`,
    "",
    `**Time box.** ${minutes} minutes. Write the answer in your own words or code; do not open the solution until you finish.`,
  ].join("\n");
  const criteria = [
    skill.measure,
    `The rule is respected: ${scenario.rule}.`,
    lvl >= 2 ? "The edge cases (empty, duplicate, limit, failure) are handled explicitly." : "The common case works and one failure case is handled.",
    lvl === 3 ? "You state the trade-off you made and one alternative you rejected." : "The answer is specific to this case, not generic advice.",
  ];
  return {
    id: `${areaId}-${pad3(d)}`,
    areaId,
    day: d,
    title,
    skillId: skill.id,
    skillName: skill.name,
    level: lvl,
    minutes,
    statement,
    criteria,
    hints: tpl.hints.map((h) => fill(h, scenario)),
    solution: fill(tpl.solution, scenario),
    typicalErrors: tpl.errors.map((e) => fill(e, scenario)),
    file: `${pad3(d)} ${safeFile(title)}.md`,
  };
}

/** La nota del kata en el formato de ejercicio de NoteVault (`type: exercise`): enunciado visible, pistas, solución al calificar y rúbrica. */
export function kataNote(k: AreaKata): string {
  const area = areaLabelOf(k.areaId);
  const fm = [
    "---",
    "type: exercise",
    "subject: programming",
    "discipline: programming_practice",
    `id: pp.kata.${k.areaId}.${pad3(k.day)}`,
    `title: "${k.title.replace(/"/g, "'")}"`,
    "skill: pp_kata",
    "mode: pp_kata",
    `kata_skill: ${areaKataSkillId(k.areaId)}`,
    `area: ${k.areaId}`,
    `area_skill: ${k.skillId}`,
    `kata_day: ${k.day}`,
    `difficulty: ${k.level}`,
    `minutes: ${k.minutes}`,
    "assistance: helper",
    "---",
  ];
  return [
    ...fm,
    "",
    `# ${pad3(k.day)} · ${k.title}`,
    "",
    `> ${area} kata ${k.day} · ${k.skillName} · ${KATA_LEVEL_LABEL[k.level]} · ${k.minutes} min`,
    "",
    "## Statement",
    "",
    k.statement,
    "",
    "## Hints",
    "",
    ...k.hints.flatMap((h, i) => [`### Hint ${i + 1}`, "", h, ""]),
    "## Solution",
    "",
    k.solution,
    "",
    "## Rubric",
    "",
    ...k.criteria.map((c) => `- [ ] ${c}`),
    "",
    "## Typical errors",
    "",
    ...k.typicalErrors.map((e, i) => `- **error ${i + 1}:** ${e}`),
    "",
  ].join("\n");
}

// ── Sistema de un área (estructura de carpeta y documentos) ─────────────

export interface AreaFileSpec {
  /** ruta relativa a `programming_practice/` (POSIX): `backend/README.md` */
  rel: string;
  kind: "readme" | "skills" | "katas-readme" | "projects-readme" | "kata";
  content: string;
  /** para los katas: su número */
  day?: number;
}

export interface AreaPracticeSystemInfo {
  areaId: string;
  label: string;
  /** carpeta del área dentro de `programming_practice/` */
  folder: string;
  name: string;
  purpose: string;
  skills: readonly AreaSkill[];
  /** id de skill del ledger de los katas del área */
  ledgerSkill: string;
  languages: string[];
  /** estructura de la carpeta: ruta y para qué sirve */
  structure: Array<{ path: string; purpose: string }>;
  weekly: { title: string; summary: string };
  monthly: { title: string; summary: string };
}

const PURPOSE: Record<string, string> = {
  backend: "Design and build the server side of an application: endpoints, validation, states, transactions and security.",
  frontend: "Build interfaces that are composable, accessible and honest about loading, errors and empty data.",
  databases: "Model data and ask it questions: schemas, joins, aggregations, indexes, transactions and migrations.",
  automation: "Write scripts and jobs that can run unattended: idempotent, observable and safe when something fails.",
  tooling: "Master the tools around the code: Git, tests, CI, dependencies, debugging and code quality.",
  desktop: "Build desktop applications with Electron and TypeScript: processes, IPC, security, persistence and packaging.",
  mobile: "Build mobile applications that survive the phone: navigation, lifecycle, offline data and permissions.",
};

/** Todo lo que define el sistema de práctica de un área; `null` si no tiene. */
export function areaPracticeSystem(areaId: string): AreaPracticeSystemInfo | null {
  const skills = AREA_SKILLS[areaId];
  if (!skills?.length) return null;
  const folder = areaFolderOf(areaId);
  const ap = AREA_PRACTICE[areaId];
  return {
    areaId,
    label: areaLabelOf(areaId),
    folder,
    name: ap?.name ?? areaLabelOf(areaId),
    purpose: PURPOSE[areaId] ?? `Daily practice of ${areaLabelOf(areaId)}.`,
    skills,
    ledgerSkill: areaKataSkillId(areaId),
    languages: ap?.languages ?? [],
    structure: [
      { path: `${folder}/README.md`, purpose: "what the area practises and how to use the folder" },
      { path: `${folder}/skills.md`, purpose: "the most important skills of the area and how each one is measured" },
      { path: `${folder}/katas/`, purpose: "one numbered kata per day: statement, rubric, hints and the expected solution" },
      { path: `${folder}/projects/`, purpose: "the weekly and monthly project of the area" },
    ],
    weekly: ap?.weekly ?? { title: "Weekly project", summary: "" },
    monthly: ap?.monthly ?? { title: "Monthly project", summary: "" },
  };
}

function readmeOf(sys: AreaPracticeSystemInfo): string {
  return [
    "---",
    "type: practice_area",
    "subject: programming",
    `area: ${sys.areaId}`,
    `title: ${sys.label} practice`,
    "---",
    "",
    `# ${sys.label} practice`,
    "",
    sys.purpose,
    "",
    "## How to practise",
    "",
    "- **Daily:** one kata of 20-30 minutes from `katas/`, in order. It trains the logic of the area and one of its key skills; the skill rotates every day.",
    "- **Weekly:** one project that joins what the week's katas practised (see `projects/`).",
    "- **Monthly:** one larger project that integrates the weekly ones.",
    "- A kata is done when you attempt it in the practice view (`pp_kata`) or mark it in the Mentor plan. Progress is **derived** from your attempts: no file in this folder stores it.",
    "",
    "## Key skills",
    "",
    ...sys.skills.map((s) => `- **${s.name}** — ${s.why}`),
    "",
    "See `skills.md` for how each skill is measured and what each level asks.",
    "",
    "## Languages",
    "",
    sys.languages.length ? sys.languages.join(", ") : "Any.",
    "",
    "> Created by the Mentor (\"Ejecutar plan\"). Edit freely: the app never overwrites a file that exists.",
    "",
  ].join("\n");
}

function skillsOf(sys: AreaPracticeSystemInfo): string {
  return [
    "---",
    "type: practice_skills",
    "subject: programming",
    `area: ${sys.areaId}`,
    `title: ${sys.label} key skills`,
    "---",
    "",
    `# ${sys.label}: key skills`,
    "",
    "| Skill | Why it matters | How it is measured |",
    "|---|---|---|",
    ...sys.skills.map((s) => `| ${s.name} | ${s.why} | ${s.measure} |`),
    "",
    "## Levels",
    "",
    "The level of your katas follows your declared or measured level: it rises one step every 40 katas done, up to level 3. Every 7th kata is a stretch (one level above).",
    "",
    ...sys.skills.flatMap((s) => [`### ${s.name}`, "", `1. ${s.levels[0]}`, `2. ${s.levels[1]}`, `3. ${s.levels[2]}`, ""]),
  ].join("\n");
}

function katasReadme(sys: AreaPracticeSystemInfo): string {
  return [
    `# ${sys.label} katas`,
    "",
    "One kata per day, numbered in the order you do them. Each kata is an exercise note: open it in the practice view to attempt it, get feedback and unlock the solution.",
    "",
    "- 20-30 minutes, time boxed.",
    "- The statement says the skill and the level; the rubric says what a good answer shows.",
    "- Hints are progressive. The solution stays hidden until you finish.",
    "",
  ].join("\n");
}

function projectsReadme(sys: AreaPracticeSystemInfo): string {
  return [
    `# ${sys.label} projects`,
    "",
    `## Weekly: ${sys.weekly.title}`,
    "",
    sys.weekly.summary,
    "",
    `## Monthly: ${sys.monthly.title}`,
    "",
    sys.monthly.summary,
    "",
    "The full stack weekly projects of the whole plan are created in `../projects/` by the project pipeline (`pp_build`). Put here the notes, designs and links of the projects of this area.",
    "",
  ].join("\n");
}

export interface PlanFilesOptions {
  /** nº de katas por área que se escriben ahora (desde el 1); 0 = solo la estructura */
  katasPerArea?: number;
  /** primer kata que se escribe (para escribir bloques siguientes) */
  fromDay?: number;
  /** nivel de cada área (por defecto 1) */
  levels?: Record<string, number>;
}

/** Los archivos de la carpeta de un área (estructura + katas). Puro: no escribe nada. */
export function areaFiles(areaId: string, opts: PlanFilesOptions = {}): AreaFileSpec[] {
  const sys = areaPracticeSystem(areaId);
  if (!sys) return [];
  const out: AreaFileSpec[] = [
    { rel: `${sys.folder}/README.md`, kind: "readme", content: readmeOf(sys) },
    { rel: `${sys.folder}/skills.md`, kind: "skills", content: skillsOf(sys) },
    { rel: `${sys.folder}/katas/README.md`, kind: "katas-readme", content: katasReadme(sys) },
    { rel: `${sys.folder}/projects/README.md`, kind: "projects-readme", content: projectsReadme(sys) },
  ];
  const from = Math.max(1, Math.floor(opts.fromDay ?? 1));
  const n = Math.max(0, Math.floor(opts.katasPerArea ?? 0));
  for (let d = from; d < from + n; d++) {
    const k = kataForDay(areaId, d, opts.levels?.[areaId] ?? 1);
    if (k) out.push({ rel: `${sys.folder}/katas/${k.file}`, kind: "kata", content: kataNote(k), day: d });
  }
  return out;
}

// ── Calendario de katas de un plan ──────────────────────────────────────

export interface KataPlanLike {
  start: string;
  end: string;
  programmingPractice?: { kata?: { days: number[]; minutesPerDay: number } };
  preconditions?: { blockedDates?: string[]; levels?: Record<string, string> };
  subplans: ReadonlyArray<{ area: string; areaId?: string; phase?: { fromWeek: number } }>;
}

/** Las áreas del plan con sistema de práctica propio, en orden y sin repetir. */
export function practiceAreasOf(plan: Pick<KataPlanLike, "subplans">): Array<{ areaId: PracticeAreaId; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ areaId: PracticeAreaId; label: string }> = [];
  for (const s of plan.subplans) {
    const id = s.areaId ?? "";
    if (!isPracticeAreaId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ areaId: id, label: areaLabelOf(id) });
  }
  return out;
}

/** Los días de kata del plan (fechas), en orden: los días ISO de la pista, sin los bloqueados. El kata nº N del área es el día N de esta lista. */
export function kataDatesOfPlan(plan: KataPlanLike): string[] {
  const kata = plan.programmingPractice?.kata;
  if (!kata) return [];
  const days = new Set(kata.days);
  const blocked = new Set(plan.preconditions?.blockedDates ?? []);
  return eachDay(plan.start, plan.end).filter((d) => days.has(isoDow(d)) && !blocked.has(d));
}

/**
 * Primer día de la práctica de un área. TODAS las áreas (Frontend incluido) practican desde el día 1 del plan, aunque su fase de estudio empiece
 * más tarde; la única que puede aparecer después es Automation (su kata empieza en la semana de su fase).
 */
export function areaStartDate(plan: KataPlanLike, areaId: string): string {
  if (areaId !== "automation") return plan.start;
  const from = plan.subplans.find((s) => s.areaId === areaId)?.phase?.fromWeek ?? 1;
  return weekRangesOf(plan.start, plan.end)[Math.max(0, from - 1)]?.start ?? plan.start;
}

/** Los días de kata de UN área: los del plan desde su primer día. El kata nº N del área es el día N de esta lista. */
export const areaKataDates = (plan: KataPlanLike, areaId: string): string[] => {
  const from = areaStartDate(plan, areaId);
  return kataDatesOfPlan(plan).filter((d) => d >= from);
};

/** El nº de kata (desde 1) que toca en una fecha, o 0 si no es día de kata. */
export function kataIndexOn(plan: KataPlanLike, date: string): number {
  return kataDatesOfPlan(plan).indexOf(date) + 1;
}

export interface AreaPracticeDay {
  areaId: PracticeAreaId;
  label: string;
  /** nº de kata del área ese día */
  day: number;
  kata: AreaKata;
  /** ruta del kata dentro de `programming_practice/` */
  rel: string;
}

/**
 * La práctica por área que toca en una fecha: un kata por área del plan (vacío si no es día de kata). Es lo que el calendario y la agenda pueden
 * mostrar; `level` es el nivel de cada área (por defecto el declarado en las precondiciones).
 */
export function areaPracticeFor(plan: KataPlanLike, date: string, levels?: Record<string, number>): AreaPracticeDay[] {
  const out: AreaPracticeDay[] = [];
  for (const a of practiceAreasOf(plan)) {
    const day = areaKataDates(plan, a.areaId).indexOf(date) + 1;
    if (day < 1) continue;
    const level = levels?.[a.areaId] ?? levelFromDeclared(declaredLevelOf(plan.preconditions?.levels, a.areaId));
    const kata = kataForDay(a.areaId, day, level);
    if (kata) out.push({ areaId: a.areaId, label: a.label, day, kata, rel: `${areaFolderOf(a.areaId)}/katas/${kata.file}` });
  }
  return out;
}
