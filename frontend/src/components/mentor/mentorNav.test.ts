// Mentor — navegación pura: la ruta recordada y sus valores antiguos, el modo por defecto y los ítems de la barra de cada modo.

import { beforeEach, describe, expect, it } from "vitest";
import { useNavState } from "../../store/navState";
import {
  activePlaneacionId, asMode, defaultModeOf, ejecucionLinks, hasBasesRoute, modeSubject, normalizeTab, planeacionLinks, resolveRoute, selectEjecucion, selectPlaneacion,
} from "./mentorNav";
import { agendaViewKey, planSectionKey, planTabKey } from "./planShared";

const plans = [
  { id: "a", status: "futuro" as const },
  { id: "b", status: "activo" as const },
];
const base = { plans, plansLoaded: true, builds: [{ id: "k" }], buildsLoaded: true };
const route = (stored: string, over: Partial<typeof base> = {}) => resolveRoute({ stored, ...base, ...over });

describe("resolveRoute", () => {
  it("un plan o una construcción existentes se abren tal cual", () => {
    expect(route("plan:a")).toEqual({ kind: "plan", planId: "a" });
    expect(route("build:k")).toEqual({ kind: "build", buildId: "k" });
  });

  it("sin elegir abre el plan en curso, o el primero, o el resumen si no hay planes", () => {
    expect(route("")).toEqual({ kind: "plan", planId: "b" });
    expect(route("", { plans: [{ id: "a", status: "futuro" }] })).toEqual({ kind: "plan", planId: "a" });
    expect(route("", { plans: [] })).toEqual({ kind: "overview", creating: false });
    // mientras la lista de planes no ha cargado no se adivina ninguno
    expect(route("", { plansLoaded: false })).toEqual({ kind: "overview", creating: false });
  });

  it("un plan o una construcción que ya no existen vuelven al plan en curso; sin cargar la lista se confía en lo guardado", () => {
    expect(route("plan:zzz")).toEqual({ kind: "plan", planId: "b" });
    expect(route("build:zzz")).toEqual({ kind: "plan", planId: "b" });
    expect(route("plan:zzz", { plansLoaded: false })).toEqual({ kind: "plan", planId: "zzz" });
    expect(route("build:zzz", { buildsLoaded: false })).toEqual({ kind: "build", buildId: "zzz" });
  });

  it("los valores antiguos de la barra siguen siendo rutas válidas (ocultas), «plan» es el resumen y «nuevo» abre el formulario", () => {
    for (const v of ["hoy", "cierre", "metas", "proyectos", "notas"] as const) expect(route(v)).toEqual({ kind: "aux", view: v });
    expect(route("plan")).toEqual({ kind: "overview", creating: false });
    expect(route("nuevo")).toEqual({ kind: "overview", creating: true });
  });

  it("un valor desconocido no rompe: cae al plan en curso", () => {
    expect(route("inventado")).toEqual({ kind: "plan", planId: "b" });
  });
});

describe("modo", () => {
  it("por defecto, Ejecución para un plan mantenido y Planeación para uno propuesto, terminado o inexistente", () => {
    expect(defaultModeOf({ status: "activo" })).toBe("ejecucion");
    expect(defaultModeOf({ status: "futuro" })).toBe("ejecucion");
    expect(defaultModeOf({ status: "propuesto" })).toBe("planeacion");
    expect(defaultModeOf({ status: "terminado" })).toBe("planeacion");
    expect(defaultModeOf(undefined)).toBe("planeacion");
  });

  it("lo guardado manda sobre el defecto; un valor inválido se ignora", () => {
    expect(asMode("planeacion", "ejecucion")).toBe("planeacion");
    expect(asMode("ejecucion", "planeacion")).toBe("ejecucion");
    expect(asMode("plan", "ejecucion")).toBe("ejecucion");
    expect(asMode("", "planeacion")).toBe("planeacion");
  });

  it("sin la fila del listado, el estado sale del propio plan", () => {
    expect(modeSubject({ status: "activo" }, null)).toEqual({ status: "activo" });
    expect(modeSubject(undefined, null)).toBeUndefined();
    expect(modeSubject(undefined, { proposed: true })).toEqual({ status: "propuesto" });
    expect(modeSubject(undefined, { archived: true })).toEqual({ status: "terminado" });
    expect(modeSubject(undefined, {})).toEqual({ status: "activo" });
  });
});

describe("ítems de Planeación", () => {
  it("Mi plan (4 sub-vistas), Agenda (4 vistas), Entregables y Preguntas y ajustes; Práctica solo si el plan la tiene", () => {
    const l = planeacionLinks({});
    expect(l.map((x) => x.label)).toEqual(["Mi plan", "Agenda", "Entregables", "Preguntas y ajustes"]);
    expect(l[0]!.subs!.map((x) => x.label)).toEqual(["Resumen", "Temas por área", "Registros", "Preparar"]);
    expect(l[1]!.subs!.map((x) => x.label)).toEqual(["Día", "Semana", "Mes", "Calendario"]);
    expect(planeacionLinks({ programmingPractice: {} as never }).map((x) => x.label)).toEqual(["Mi plan", "Agenda", "Práctica", "Entregables", "Preguntas y ajustes"]);
  });

  it("las decisiones pendientes de entregables salen como insignia con su lectura", () => {
    const e = planeacionLinks({}, 2).find((x) => x.id === "pl:entregables")!;
    expect(e.badge).toBe(2);
    expect(e.hint).toBe("2 pendientes de decidir");
    expect(planeacionLinks({}).find((x) => x.id === "pl:entregables")!.badge).toBeUndefined();
  });

  it("el ítem activo sale de la pestaña, la sub-vista y la vista de la Agenda guardadas", () => {
    expect(activePlaneacionId("plan", "preparar", "mes")).toBe("pl:plan/preparar");
    expect(activePlaneacionId("plan", "fases", "mes")).toBe("pl:plan/resumen");
    expect(activePlaneacionId("agenda", "resumen", "mes")).toBe("pl:agenda/mes");
    expect(activePlaneacionId("agenda", "resumen", "inventada")).toBe("pl:agenda/semana");
    expect(activePlaneacionId("cambios", "resumen", "mes")).toBe("pl:cambios");
  });

  it("la pestaña guardada se normaliza: «semana» es la Agenda y «Práctica» exige la pista", () => {
    expect(normalizeTab("semana", false)).toBe("agenda");
    expect(normalizeTab("practica", false)).toBe("plan");
    expect(normalizeTab("practica", true)).toBe("practica");
    expect(normalizeTab("inventada", true)).toBe("plan");
  });
});

describe("selecciones de la barra", () => {
  beforeEach(() => useNavState.setState({ values: {} }));

  it("Planeación escribe las mismas claves que leen la vista del plan y la Agenda", () => {
    selectPlaneacion("p1", "pl:plan/registros");
    let v = useNavState.getState().values;
    expect(v[planTabKey("p1")]).toBe("plan");
    expect(v[planSectionKey("p1")]).toBe("registros");
    selectPlaneacion("p1", "pl:agenda/mes");
    v = useNavState.getState().values;
    expect(v[planTabKey("p1")]).toBe("agenda");
    expect(v[agendaViewKey("p1")]).toBe("mes");
    selectPlaneacion("p1", "pl:entregables");
    expect(useNavState.getState().values[planTabKey("p1")]).toBe("entregables");
    // elegir el ítem padre conserva la sub-vista que ya había
    selectPlaneacion("p1", "pl:plan");
    expect(useNavState.getState().values[planSectionKey("p1")]).toBe("registros");
  });

  it("Ejecución guarda la vista por plan", () => {
    selectEjecucion("p1", "ej:area:s1");
    selectEjecucion("p2", "ej:bases");
    const v = useNavState.getState().values;
    expect(v["mentor.runTab.p1"]).toBe("area:s1");
    expect(v["mentor.runTab.p2"]).toBe("bases");
  });
});

describe("ítems de Ejecución", () => {
  const sub = (id: string, area: string, areaId: string | undefined, bases = false) => ({
    id, area, ...(areaId ? { areaId } : {}),
    groups: bases ? [{ id: "g1", kind: "bases" }] : [],
    topics: bases ? [{ group: "g1", route: "path" }] : [],
  });

  it("Hoy, una por área (en el orden fijo de las áreas), Bases si el plan las tiene, Proyectos y Registros", () => {
    const plan = { subplans: [sub("s2", "Frontend", "frontend"), sub("s1", "Backend", "backend", true)] } as never;
    const l = ejecucionLinks(plan);
    expect(l.map((x) => x.label)).toEqual(["Hoy", "Backend", "Frontend", "Bases", "Proyectos", "Registros"]);
    expect(l.map((x) => x.tab)).toEqual(["general", "area:s1", "area:s2", "bases", "proyectos", "registros"]);
    expect(l[1]!.id).toBe("ej:area:s1");
  });

  it("sin grupo de Bases en la ruta no hay «Bases»", () => {
    const plan = { subplans: [sub("s1", "Backend", "backend")] } as never;
    expect(hasBasesRoute(plan)).toBe(false);
    expect(ejecucionLinks(plan).map((x) => x.label)).toEqual(["Hoy", "Backend", "Proyectos", "Registros"]);
  });
});
