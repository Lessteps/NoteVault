// A specification that satisfies every rule, shared by the tests.
export const validSpecRaw = () => ({
  folder: "Link shortener with stats",
  title: "Link shortener with stats",
  problem: "A small service that turns long URLs into short codes, redirects them and counts the visits per day for each link.",
  client: "web",
  focus: "backend",
  hours: 10,
  stack: { database: "SQLite", backend: "FastAPI", client: "React + TypeScript" },
  database: {
    summary: "Two tables: links and visits, with a unique code.",
    tables: ["links(id, code UNIQUE, url, created_at)", "visits(id, link_id, visited_on)"],
    criteria: [
      "A migration script creates both tables from an empty database",
      "Inserting a duplicate code fails with a constraint error",
      "An index exists on visits(link_id, visited_on)",
    ],
  },
  backend: {
    summary: "REST API with routes, services and a repository.",
    architecture: ["routes", "services", "repository"],
    endpoints: ["POST /links", "GET /{code}", "GET /links/{code}/stats"],
    criteria: [
      "POST /links with an invalid URL answers 422 with the error contract",
      "GET /{code} answers 302 with the Location header of the stored URL",
      "pytest passes with at least 6 tests covering success and error paths",
    ],
  },
  clientLayer: {
    summary: "A page to create links and see their statistics.",
    screens: ["Create link", "Link statistics"],
    architecture: ["feature folders", "API calls isolated in a client module"],
    patterns: ["custom hook useLinks (used by both screens)"],
    atomic: { atoms: ["Button", "Input"], molecules: ["LinkForm"], organisms: ["LinkTable"] },
    criteria: [
      "Creating a link shows the short URL without reloading the page",
      "An API error is shown as a readable message, not a blank screen",
      "The statistics screen shows the visit counts returned by the backend",
    ],
  },
  focusCriteria: [
    "Every endpoint documents its status codes and they match the OpenAPI output",
    "Business rules live in services: route handlers contain no SQL",
  ],
  topics: ["4.3 REST API design", "4.10 Errors and error contracts", "6.2 Table design"],
  rubric: [
    { criterion: "Backend criteria met", weight: 35 },
    { criterion: "Database criteria met", weight: 20 },
    { criterion: "Client criteria met", weight: 20 },
    { criterion: "Architecture and patterns", weight: 15 },
    { criterion: "Tests", weight: 10 },
  ],
  defenseQuestions: ["Why a repository layer?", "What happens if two requests create the same code?", "What would change at 100x the traffic?", "Why that status code on invalid input?"],
});
