import { buildEntries } from "./helpers";

// Currículo de referencia de las áreas de CONOCIMIENTO (lenguajes, Electron, Backend, Databases, Automation, Mobile, Tooling): lo que cada una debería cubrir.
// Cada fila lleva como palabras clave frases de VARIAS palabras que aparecen en los títulos de la vault, para reconocer lo que ya existe sin duplicarlo;
// lo que no coincide con ningún tema sale como «falta» y «Verificar metodología» lo pide a Antigravity. Una entrada = UN concepto aprendible de una vez.

/** Python (`2.1 Python`): del primer programa a la biblioteca estándar y las herramientas. */
export const PYTHON_ENTRIES = buildEntries("python", {
  "Getting started": [
    ["first-program", "Running your first Python program", "e", "python --version, the REPL, running a .py file, print(), reading an error message, comments", "first program, hello world, the repl"],
    ["project-venv", "Project layout and virtual environments", "e", "project folder, venv, activating it, pip install, requirements.txt, .gitignore", "virtual environments"],
    ["imports", "Modules and imports", "e", "import, from-import, aliases, standard library vs your own modules, __name__ == '__main__'", "virtual environments and imports, modules and imports"],
  ],
  "Core language": [
    ["variables-types", "Variables and primitive types", "e", "names, int, float, str, bool, None, type(), conversions, mutability", "variables primitive types"],
    ["operators", "Operators and expressions", "e", "arithmetic, comparison, logical, membership, identity, precedence", "operators and expressions"],
    ["input-output", "Input and output", "e", "print() options, input(), reading numbers, command-line arguments, exit codes", "input and output"],
    ["strings", "Strings", "e", "indexing, slicing, methods, immutability, escape sequences, bytes vs str", "strings"],
    ["string-formatting", "String formatting and f-strings", "e", "f-strings, format specs, str.format, padding, number formatting", "f-strings, string formatting"],
    ["control-flow", "Conditionals and loops", "e", "if/elif/else, for, while, range, break, continue, else on loops, match", "control flow and loops"],
    ["functions", "Functions", "e", "def, parameters, defaults, *args and **kwargs, return, docstrings, scope, lambda", "functions"],
    ["exceptions", "Exception handling", "e", "try/except/else/finally, raising, custom exceptions, tracebacks, assert", "exception handling"],
  ],
  "Data structures": [
    ["collections-basic", "Lists, tuples, sets and dictionaries", "e", "list methods, tuple unpacking, set operations, dict methods, copying", "lists tuples sets and dictionaries"],
    ["comprehensions", "Comprehensions", "e", "list, dict and set comprehensions, conditions, nested loops, generator expressions", "comprehensions"],
    ["slicing-unpacking", "Slicing and unpacking", "e", "slices with step, negative indexes, star unpacking, swapping, enumerate and zip", "slicing and unpacking"],
    ["sorting", "Sorting and key functions", "r", "sorted(), list.sort(), key=, reverse, stability, itemgetter, min/max with key", "sorting and key functions"],
    ["collections-module", "The collections module", "r", "Counter, defaultdict, deque, namedtuple, OrderedDict, ChainMap", "the collections module"],
  ],
  "Objects": [
    ["classes", "Classes and encapsulation", "e", "class, __init__, attributes, methods, properties, class vs instance attributes", "classes and encapsulation"],
    ["inheritance", "Inheritance, polymorphism and abstract classes", "e", "subclassing, super(), overriding, ABC, duck typing, composition vs inheritance", "inheritance polymorphism and abstract classes"],
    ["dunder-methods", "Special methods (dunder)", "r", "__repr__, __str__, __eq__, __lt__, __len__, __iter__, __getitem__, __enter__", "special methods, dunder methods"],
    ["dataclasses-enums", "Dataclasses and enums", "e", "@dataclass, field(), frozen, Enum, auto(), IntEnum", "dataclasses and enums"],
  ],
  "Intermediate and advanced": [
    ["iterators-generators", "Generators and iterators", "e", "iterator protocol, yield, generator expressions, itertools, lazy evaluation", "generators and iterators"],
    ["higher-order", "Higher-order functions and functools", "r", "map, filter, closures, partial, lru_cache, reduce", "higher-order functions and functools"],
    ["decorators", "Decorators", "e", "functions as objects, wrapper functions, @syntax, functools.wraps, decorators with arguments", "decorators"],
    ["context-managers", "Context managers", "e", "with, __enter__/__exit__, contextlib, closing resources safely", "context managers"],
    ["concurrency", "Concurrency with asyncio", "r", "async/await, event loop, tasks, gather, blocking vs non-blocking", "concurrency with asyncio"],
    ["threads-processes", "Threads and multiprocessing", "o", "threading, GIL, concurrent.futures, multiprocessing, when to use which", "threads and multiprocessing"],
  ],
  "Standard library and the real world": [
    ["files-serialization", "Files, pathlib and serialization", "e", "open(), with, pathlib.Path, json, csv, reading and writing text and binary", "files pathlib and serialization"],
    ["stdlib-essentials", "Essential standard library", "e", "os, sys, datetime, math, random, shutil, subprocess, itertools", "essential standard library"],
    ["dates-times", "Dates, times and time zones", "r", "datetime, timedelta, zoneinfo, parsing and formatting, UTC", "dates and times, time zones"],
    ["regex", "Regular expressions", "r", "re.search, match, findall, groups, flags, substitution", "regular expressions"],
    ["logging", "Logging", "e", "logging levels, handlers, formatters, getLogger, logging vs print", "logging"],
    ["cli-tools", "Command-line tools", "r", "argparse, subcommands, sys.argv, exit codes, reading stdin", "command-line tools, argparse"],
    ["http-requests", "HTTP requests from Python", "r", "requests/httpx, GET and POST, headers, JSON, timeouts, errors", "http requests"],
    ["sqlite3", "Databases with sqlite3", "r", "connect, cursor, execute with parameters, commit, row factories", "sqlite3"],
  ],
  "Quality and tooling": [
    ["type-hints", "Type hints and static checking", "e", "annotations, Optional, unions, generics, mypy/pyright, Protocol", "type hints and static checking"],
    ["testing", "Testing with pytest", "e", "assert, fixtures, parametrize, tmp_path, mocking, test layout", "testing with pytest"],
    ["debugging", "Debugging Python programs", "r", "reading tracebacks, print debugging, pdb/breakpoint(), IDE debugger", "debugging python"],
    ["style-linting", "Style, linting and formatting", "r", "PEP 8, ruff, black, naming, docstrings", "style linting"],
    ["packaging", "Packaging, dependencies and tools", "e", "pyproject.toml, pip, venv, wheels, entry points, lock files", "packaging dependencies and tools"],
  ],
});

/** JavaScript (`2.2 JavaScript`). */
export const JAVASCRIPT_ENTRIES = buildEntries("javascript", {
  "Getting started": [
    ["first-program", "Running your first JavaScript program", "e", "Node and the browser console, console.log, running a .js file, reading errors", "first program, hello world"],
    ["project-npm", "Project layout, npm and modules", "e", "package.json, npm install, scripts, node_modules, ES modules", "npm and modules"],
  ],
  "Core language": [
    ["variables-types", "Variables, types and conversions", "e", "let, const, number, string, boolean, null, undefined, typeof, conversions", "variables types and conversions"],
    ["operators-equality", "Operators, equality and type coercion", "e", "== vs ===, truthy and falsy, nullish coalescing, optional chaining", "operators equality and type coercion"],
    ["functions", "Functions", "e", "declarations, arrow functions, default and rest parameters, return, scope", "functions"],
    ["control-flow", "Control flow, loops and exceptions", "e", "if, switch, for, for...of, while, try/catch/finally, throw", "control flow loops and exceptions"],
    ["strings-templates", "Strings and template literals", "e", "string methods, template literals, tagged templates, unicode", "strings and template literals"],
    ["destructuring-spread", "Destructuring, spread and rest", "e", "array and object destructuring, defaults, spread, rest, shallow copies", "destructuring spread and rest"],
    ["scope-closures", "Scope, hoisting and closures", "e", "block and function scope, hoisting, temporal dead zone, closures", "functions and closures"],
    ["this-binding", "this and function binding", "r", "this rules, call/apply/bind, arrow functions and this, method extraction", "this and function binding"],
  ],
  "Data": [
    ["arrays", "Arrays and their methods", "e", "map, filter, reduce, find, some/every, sort, flat, splice vs slice", "arrays and their methods"],
    ["objects-collections", "Objects, Sets and Maps", "e", "object literals, property access, Object.keys/entries, Set, Map, WeakMap", "objects sets and maps"],
    ["json", "JSON and runtime validation", "e", "JSON.parse/stringify, reviver, validating shapes at runtime", "json and runtime validation"],
    ["dates-regex", "Dates, regular expressions and utilities", "r", "Date, Intl, RegExp, structuredClone, URL", "dates regular expressions and utilities"],
  ],
  "Objects and modules": [
    ["classes-prototypes", "Classes, inheritance and prototypes", "e", "class, extends, super, private fields, prototype chain, getters", "classes inheritance and prototypes"],
    ["iterators-generators", "Iterators and generators", "r", "iterable protocol, function*, yield, for...of, async iterators", "iterators and generators"],
    ["es-modules", "ES modules and CommonJS", "e", "import/export, default vs named, dynamic import, CommonJS interop", "npm and modules"],
  ],
  "Asynchronous JavaScript": [
    ["event-loop", "The event loop", "e", "call stack, task and microtask queues, timers, why code runs in the order it does", "the event loop"],
    ["promises-async", "Promises and async await", "e", "Promise, then/catch, async/await, Promise.all/allSettled, error handling", "asynchronous programming"],
    ["fetch-http", "Fetch and HTTP from JavaScript", "e", "fetch, response.ok, JSON bodies, headers, AbortController, errors", "fetch and http"],
  ],
  "Environments": [
    ["node-runtime", "Node.js runtime and core modules", "e", "fs, path, process, events, streams basics, env variables", "node.js runtime"],
    ["dom-events", "The DOM and events", "r", "querySelector, events, bubbling, delegation, creating elements", "the dom and events"],
  ],
  "Quality and tooling": [
    ["testing", "Testing with Vitest", "e", "describe/it/expect, mocks, async tests, coverage", "testing with vitest"],
    ["tooling", "Tooling", "r", "ESLint, Prettier, bundlers, source maps, scripts", "tooling"],
    ["debugging", "Debugging JavaScript", "r", "devtools, breakpoints, console methods, stack traces, node --inspect", "debugging javascript"],
  ],
});

/** TypeScript (`2.3 TypeScript`). */
export const TYPESCRIPT_ENTRIES = buildEntries("typescript", {
  "Foundations": [
    ["project-setup", "Project setup", "e", "installing tsc, tsconfig.json, strict flags, running with tsx/ts-node, build output", "project setup"],
    ["basic-types", "Basic types, literals and inference", "e", "primitives, arrays, tuples, literal types, any vs unknown, inference, as const", "basic types literals and inference"],
    ["object-types", "Object types", "e", "interfaces vs type aliases, optional and readonly properties, index signatures, excess property checks", "object types"],
    ["unions-narrowing", "Unions, intersections and narrowing", "e", "union types, intersections, typeof/in/instanceof narrowing, discriminated unions", "unions intersections and narrowing"],
    ["typed-functions", "Typed functions and overloads", "e", "parameter and return types, optional params, overloads, callbacks, void vs never", "typed functions and overloads"],
  ],
  "The type system": [
    ["generics", "Generics", "e", "generic functions, constraints, defaults, generic interfaces and classes", "generics"],
    ["utility-types", "Utility types and derived types", "e", "Partial, Required, Pick, Omit, Record, ReturnType, keyof, typeof", "utility types and derived types"],
    ["mapped-conditional", "Mapped and conditional types", "r", "mapped types, modifiers, conditional types, infer, distributive behaviour", "mapped and conditional types"],
    ["template-literal-types", "Template literal types", "o", "string literal unions, template literal types, Uppercase/Lowercase, key remapping", "template literal types"],
    ["classes-ts", "Classes, access modifiers and abstract classes", "e", "public/private/protected, readonly, parameter properties, abstract, implements", "classes access modifiers and abstract classes"],
    ["enums-constants", "Enums and constant objects", "r", "enum vs const enum vs union of literals, as const objects", "enums and constant objects"],
  ],
  "In real projects": [
    ["modules-declarations", "Modules, declarations and library types", "e", "ES modules, .d.ts files, @types packages, declare module, ambient types", "modules declarations and library types"],
    ["typed-errors", "Typed errors and results", "r", "unknown in catch, custom error classes, Result types", "typed errors and results"],
    ["typed-async", "Typed asynchrony", "e", "Promise<T>, async functions, Awaited, typing fetch responses", "typed asynchrony"],
    ["runtime-validation", "Runtime validation and generated types", "e", "zod/valibot schemas, inferring types from schemas, trust boundaries", "runtime validation and generated types"],
    ["strict-migration", "Strict mode and migrating from JavaScript", "e", "strict flags, noImplicitAny, strictNullChecks, gradual migration", "strict mode and migrating from javascript"],
    ["testing-debugging", "Testing and debugging in TypeScript", "r", "typed tests, source maps, debugging with the IDE", "testing and debugging in typescript"],
    ["ts-runtimes", "TypeScript in Node and in the browser", "e", "tsconfig for Node vs DOM, lib and types options, bundlers, module resolution", "typescript in node and in the browser"],
  ],
});

/** Electron (`3 Desktop Apps (Electron)`). */
export const ELECTRON_ENTRIES = buildEntries("electron", {
  "Foundations": [
    ["what-is-electron", "What a desktop app is and when to use Electron", "e", "web vs desktop, Chromium + Node, trade-offs, alternatives", "what a desktop app is"],
    ["architecture", "Electron architecture", "e", "main, preload, renderer, process model, contexts", "electron architecture"],
    ["project-setup", "An Electron project with TypeScript and Vite", "e", "scaffolding, tsconfig, Vite, electron-builder, scripts", "electron project with typescript"],
    ["windows-lifecycle", "Windows and the application lifecycle", "e", "BrowserWindow, app events, single instance, quitting", "windows and the application lifecycle"],
    ["multi-window", "Multiple windows and communication between them", "r", "child windows, modals, sharing state, closing order", "multiple windows"],
  ],
  "Communication and security": [
    ["ipc", "IPC", "e", "ipcMain/ipcRenderer, invoke/handle, contextBridge, typed channels", "ipc"],
    ["security", "Electron security", "e", "contextIsolation, sandbox, CSP, nodeIntegration off, validating IPC input", "electron security"],
  ],
  "Desktop features": [
    ["filesystem-dialogs", "File system, native dialogs and paths", "e", "fs from main, dialogs, app.getPath, drag and drop", "file system native dialogs and paths"],
    ["persistence", "Local persistence", "e", "settings files, SQLite, userData, migrations", "local persistence"],
    ["local-server", "Local server and media streaming", "o", "http server in main, protocols, range requests", "local server and media streaming"],
    ["windows-integration", "Windows integration", "r", "jump lists, file associations, taskbar, startup", "windows integration"],
    ["menus-tray", "Menus, tray and global shortcuts", "r", "application menu, context menu, Tray, globalShortcut, accelerators", "menus tray"],
    ["notifications", "Notifications and system dialogs", "o", "Notification API, badges, progress in taskbar", "notifications"],
    ["deep-links", "Protocol handlers and deep links", "o", "setAsDefaultProtocolClient, open-url, second-instance", "protocol handlers, deep links"],
    ["desktop-ui", "Desktop interface", "r", "titlebar, themes, DPI scaling, keyboard accessibility", "desktop interface"],
  ],
  "Quality and delivery": [
    ["performance", "Performance", "r", "startup time, memory, offloading work, profiling", "performance"],
    ["packaging", "Packaging and installers", "e", "electron-builder, NSIS, portable, icons, asar", "packaging and installers"],
    ["code-signing", "Code signing", "r", "certificates, SmartScreen, signing in CI", "code signing"],
    ["updates", "Automatic updates and distribution", "e", "electron-updater, channels, rollbacks, release hosting", "automatic updates and distribution"],
    ["testing", "Testing Electron apps", "r", "unit tests of main, Playwright for Electron, mocks", "testing electron apps"],
    ["debugging", "Debugging and diagnostics", "r", "devtools, main-process inspector, logs, crash reports", "debugging and diagnostics"],
    ["native-modules", "Native modules", "o", "N-API, rebuilding for Electron, prebuilt binaries", "native modules"],
    ["native-alternatives", "Native Windows alternatives", "o", "WinUI, WPF, Tauri, trade-offs", "native windows alternatives"],
  ],
});

/** Backend (`4 Backend`). */
export const BACKEND_ENTRIES = buildEntries("backend", {
  "Foundations": [
    ["what-backend", "What the backend is", "e", "client-server, responsibilities, stateless vs stateful", "what the backend is"],
    ["http", "HTTP in depth", "e", "methods, status codes, headers, cookies, caching headers, HTTPS", "http in depth"],
    ["rest", "REST API design", "e", "resources, URLs, verbs, status codes, idempotency, naming", "rest api design"],
    ["formats-validation", "Formats and validation", "e", "JSON, content negotiation, schema validation, input sanitising", "formats and validation"],
    ["config-env", "Configuration and environment variables", "e", "12-factor config, .env files, secrets, per-environment settings", "configuration and environment variables"],
  ],
  "Building the service": [
    ["layers", "Layered architecture", "e", "routes, services, repositories, dependency injection", "layered architecture"],
    ["backend-python", "Backend with Python", "e", "FastAPI/Flask, routing, dependencies, async handlers", "backend with python"],
    ["backend-typescript", "Backend with TypeScript", "e", "Node, Express/Fastify, middlewares, typed handlers", "backend with typescript"],
    ["persistence", "Persistence from the backend", "e", "ORM vs SQL, connection pooling, migrations, repositories", "persistence from the backend"],
    ["pagination", "Pagination, filtering and sorting", "e", "offset vs cursor, query parameters, stable ordering", "pagination filtering and sorting"],
    ["errors", "Errors and error contracts", "e", "error shapes, status mapping, problem+json, logging errors", "errors and error contracts"],
    ["versioning", "API versioning and compatibility", "r", "URL vs header versions, deprecation, additive changes", "api versioning"],
    ["file-uploads", "File uploads and storage", "r", "multipart, size limits, object storage, signed URLs", "file uploads"],
  ],
  "Security and reliability": [
    ["auth", "Authentication and authorization", "e", "sessions vs tokens, JWT, OAuth basics, roles and permissions", "authentication and authorization"],
    ["sessions-cors", "Sessions, cookies and CORS", "e", "cookie flags, CSRF, CORS preflight, same-site", "sessions cookies and cors"],
    ["security", "Backend security", "e", "OWASP top 10, injection, rate limiting, secrets, hashing passwords", "backend security"],
    ["rate-limiting", "Rate limiting and throttling", "r", "token bucket, per-key limits, 429 responses, Retry-After", "rate limiting"],
    ["idempotency-retries", "Idempotency and retries", "r", "idempotency keys, safe retries, backoff, duplicates", "idempotency and retries"],
    ["caching", "Caching", "r", "HTTP caching, Redis, invalidation, cache stampede", "caching"],
  ],
  "Integration and operations": [
    ["background", "Background tasks, queues and scheduled jobs", "e", "workers, queues, retries, cron, outbox pattern", "background tasks queues and scheduled jobs"],
    ["webhooks", "Webhooks and integration", "e", "signatures, retries, idempotent receivers, third-party APIs", "webhooks and integration"],
    ["websockets", "WebSockets and real-time", "r", "WebSocket vs SSE vs polling, rooms, reconnection, scaling", "websockets"],
    ["architectures", "Architectures", "r", "monolith vs services, hexagonal, events, trade-offs", "architectures"],
    ["testing", "Backend testing", "e", "unit vs integration tests, test databases, contract tests", "backend testing"],
    ["openapi", "API documentation with OpenAPI", "r", "OpenAPI spec, generated docs, client generation", "api documentation with openapi"],
    ["observability", "Observability", "e", "structured logs, metrics, tracing, health checks", "observability"],
    ["deploy", "Deploying the backend", "e", "containers, environments, migrations on deploy, zero downtime, rollbacks", "deploying the backend"],
  ],
});

/** Databases (`6 Databases`). Las asignaturas viven en el índice de la vault; aquí, lo que el área debería cubrir. */
export const DATABASES_ENTRIES = buildEntries("databases", {
  "From zero": [
    ["from-zero", "Databases from zero", "e", "what data is, what a DBMS is, engines, first database", "databases from zero"],
    ["relational-model", "The relational model and declarative SQL", "e", "tables, keys, SQL categories, NULL logic", "relational model and declarative sql"],
    ["table-design", "Table design", "e", "data types, constraints, ALTER, keys", "table design"],
    ["normalization", "Normalization and entity-relationship modelling", "e", "1NF-3NF, ER diagrams, relationships", "normalization and entity-relationship modelling"],
    ["data-modelling", "Data modelling in practice", "r", "modelling real domains, denormalisation trade-offs", "data modelling in practice"],
  ],
  "Queries": [
    ["crud", "CRUD and basic queries", "e", "SELECT, INSERT, UPDATE, DELETE, WHERE, ORDER BY, LIMIT", "crud and basic queries"],
    ["joins-aggregations", "JOINs and aggregations", "e", "inner/outer joins, GROUP BY, HAVING, aggregates", "joins and aggregations"],
    ["subqueries-windows", "Subqueries, CTEs and window functions", "e", "subqueries, WITH, window functions, ranking", "subqueries ctes and window functions"],
    ["sql-in-code-safety", "SQL injection and parameterised queries", "e", "prepared statements, escaping, safe query building", "sql injection, parameterised queries"],
  ],
  "Performance and consistency": [
    ["indexes", "Indexes and performance", "e", "B-tree, composite indexes, covering, trade-offs", "indexes and performance"],
    ["explain-plans", "Reading query plans with EXPLAIN", "e", "EXPLAIN ANALYZE, scans vs seeks, costs, fixing slow queries", "query plans, explain"],
    ["transactions", "Transactions, ACID and concurrency", "e", "isolation levels, locks, deadlocks", "transactions acid and concurrency"],
    ["idempotency-queues", "Idempotency and work queues in SQL", "r", "upserts, SKIP LOCKED, outbox", "idempotency and work queues in sql"],
    ["connection-pooling", "Connection pooling", "r", "pool sizing, PgBouncer, connection limits", "connection pooling"],
  ],
  "Programming in the database": [
    ["views-functions-triggers", "Views, functions and triggers", "r", "views, materialized views, procedures, triggers", "views functions and triggers"],
    ["migrations", "Migrations and schema versioning", "e", "migration tools, forward-only, zero-downtime changes", "migrations and schema versioning"],
    ["json-data", "JSONB and semi-structured data", "r", "JSONB operators, indexing, when to use", "jsonb and semi-structured data"],
    ["full-text-search", "Full-text search", "o", "tsvector, FTS5, ranking, trigram search", "full-text search"],
  ],
  "Engines and operations": [
    ["sqlite", "SQLite", "e", "single-file DB, WAL, PRAGMAs, type affinity", "sqlite"],
    ["postgresql", "PostgreSQL", "e", "psql, schemas, extensions, COPY, configuration", "postgresql"],
    ["mysql", "MySQL", "e", "InnoDB, charsets, quirks, user management", "mysql"],
    ["dialects", "SQL dialect comparison", "r", "types, pagination, upserts, dates across engines", "sql dialect comparison"],
    ["access-from-code", "Access from code", "e", "drivers, ORMs, query builders, pooling", "access from code"],
    ["security-access", "Security and access", "e", "roles, GRANT/REVOKE, least privilege", "security and access"],
    ["backup-recovery", "Backup, restore and recovery", "e", "logical vs physical backups, point-in-time recovery, restore drills", "backup and restore, backups"],
    ["replication", "Replication and high availability", "o", "primary/replica, failover, read replicas, lag", "replication and high availability"],
    ["nosql", "NoSQL and other options", "r", "document, key-value, when not to use SQL", "nosql and other options"],
  ],
});

/** Automation (`7 Automation`). */
export const AUTOMATION_ENTRIES = buildEntries("automation", {
  "Foundations": [
    ["automating", "Automating what, when and how", "e", "what to automate, trigger-steps-effect, idempotency", "automating"],
    ["python-scripts", "Automation scripts with Python", "e", "files, subprocess, scheduling, CLI scripts", "automation scripts with python"],
    ["typescript-scripts", "Automation with TypeScript and Node", "e", "Node scripts, fs, child_process, packaging scripts", "automation with typescript and node"],
    ["external-apis", "External APIs", "e", "auth, pagination, rate limits, retries", "external apis"],
    ["webhooks-events", "Webhooks and events", "e", "receiving, verifying, retrying, idempotent handlers", "webhooks and events"],
  ],
  "Tools": [
    ["n8n", "n8n", "e", "nodes, triggers, credentials, expressions", "n8n"],
    ["n8n-advanced", "Advanced n8n", "r", "sub-workflows, error workflows, custom code", "advanced n8n"],
    ["power-automate", "Power Automate", "r", "flows, connectors, approvals", "power automate"],
    ["windows-automation", "Windows automation", "r", "Task Scheduler, PowerShell, UI automation", "windows automation"],
    ["scheduled", "Scheduled tasks", "e", "cron, Task Scheduler, overlap, time zones", "scheduled tasks"],
    ["ai-pipelines", "Applied AI in pipelines", "r", "LLM calls in a flow, validation of outputs, costs", "applied ai in pipelines"],
  ],
  "Reliability": [
    ["etl", "Batch pipelines and simple ETL", "e", "extract-transform-load, checkpoints, reruns", "batch pipelines and simple etl"],
    ["monitoring", "Monitoring and partial failures", "e", "alerts, dead letters, retries, partial success", "monitoring and partial failures"],
    ["secrets-config", "Secrets and configuration in automations", "e", "credentials storage, rotation, least privilege", "secrets and configuration"],
    ["capstone", "Capstone project", "o", "end-to-end automation, runbook", "capstone project"],
  ],
});

/** Mobile (`8 Mobile`). */
export const MOBILE_ENTRIES = buildEntries("mobile", {
  "Foundations": [
    ["landscape", "The mobile landscape", "e", "native vs cross-platform, lifecycle, constraints", "the mobile landscape"],
    ["android", "Android fundamentals", "e", "activities, permissions, manifest, Gradle", "android fundamentals"],
    ["react-native", "React Native", "e", "components, Metro, bridges, debugging", "react native"],
    ["navigation-state", "Navigation and state on mobile", "e", "stack/tab navigation, state, deep links", "navigation and state on mobile"],
  ],
  "Features": [
    ["native-modules", "Native modules with Kotlin", "r", "bridging, TurboModules, calling Kotlin", "native modules with kotlin"],
    ["local-storage", "Local storage and SQLite on mobile", "e", "AsyncStorage, SQLite, migrations", "local storage and sqlite on mobile"],
    ["sync", "Syncing with the desktop and the vault format", "e", "conflicts, formats, offline-first", "syncing with the desktop"],
    ["editor", "Text editor on mobile", "r", "input handling, performance, keyboard", "text editor on mobile"],
    ["permissions-background", "Permissions, notifications and background work", "r", "runtime permissions, push, background limits", "permissions, notifications"],
  ],
  "Quality and release": [
    ["performance", "Mobile performance", "r", "rendering, memory, startup", "mobile performance"],
    ["testing-devices", "Testing and debugging on devices", "e", "emulators, real devices, logs", "testing and debugging on devices"],
    ["publishing", "Publishing", "e", "signing, stores, versions, review", "publishing"],
    ["project", "Mobile project", "o", "an end-to-end app, release checklist", "mobile project"],
  ],
});

/** Tooling and Quality (`9 Tooling and Quality`). */
export const TOOLING_ENTRIES = buildEntries("tooling", {
  "Daily tools": [
    ["terminal", "Advanced terminal and shell scripts", "e", "pipes, redirects, bash scripting, PowerShell", "advanced terminal and shell scripts"],
    ["git", "Git", "e", "commits, branches, merging, rebasing, undoing", "git"],
    ["collab-git", "Collaborative Git", "e", "pull requests, conflicts, workflows", "collaborative git"],
    ["github", "GitHub", "e", "issues, PRs, Actions basics, releases", "github"],
    ["package-managers", "Package managers and dependencies", "e", "npm, pip, lock files, semver, audits", "package managers and dependencies"],
    ["virtual-envs", "Virtual environments and reproducibility", "e", "venv, nvm, pinned versions", "virtual environments and reproducibility"],
  ],
  "Containers and environments": [
    ["docker", "Docker", "e", "images, containers, Dockerfile, volumes", "docker"],
    ["compose", "Docker Compose and local environments", "e", "services, networks, env files", "docker compose and local environments"],
  ],
  "Quality": [
    ["testing", "Testing", "e", "unit, integration, e2e, test pyramid", "testing"],
    ["linters", "Linters, formatters and static types", "e", "ESLint, ruff, Prettier, type checkers", "linters formatters and static types"],
    ["ci-cd", "Continuous integration and delivery", "e", "pipelines, caching, deploy stages", "continuous integration and delivery"],
    ["security-basics", "Basic security", "e", "secrets, dependencies, least privilege", "basic security"],
    ["logging-prod", "Logging, monitoring and debugging in production", "r", "logs, metrics, alerts", "logging monitoring and debugging in production"],
    ["docs", "Technical documentation and decision records", "r", "READMEs, ADRs, diagrams", "technical documentation and decision records"],
    ["review-ai", "Code review and working with AI assistants", "r", "reviewing diffs, prompting, verifying AI code", "code review and working with ai assistants"],
    ["debugging-method", "Debugging as a method", "e", "reproduce, isolate, bisect, hypothesis testing", "debugging as a method"],
  ],
});
