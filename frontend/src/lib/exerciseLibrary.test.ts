import { describe, expect, test } from "vitest";
import type { LibraryUserEntry } from "./libraryTypes";
import {
  estimate1RM,
  filterByLocalMuscle,
  filterLibrary,
  getInstructions,
  libraryEntry,
  libraryEquipment,
  libraryFingerprint,
  libraryMuscles,
  mapGuideMuscle,
  mergeLibrary,
  searchLibrary,
  staleCopies,
  fieldsFromLibrary,
} from "./exerciseLibrary";

describe("exerciseLibrary (workout-guide)", () => {
  test("mapea Chest al pectoral local", () => {
    expect(mapGuideMuscle("Chest")).toContain("pectoral");
  });

  test("la búsqueda encuentra press de banca", () => {
    const rows = searchLibrary("bench press");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].slug).toBe("bench-press");
  });

  test("filtrar por pectoral devuelve ejercicios", () => {
    const rows = filterByLocalMuscle("pectoral");
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.localPrimary.includes("pectoral"))).toBe(true);
  });

  test("los frames son locales (offline, respetan el CSP)", () => {
    const rows = searchLibrary("bench press");
    expect(rows[0].frame1).toContain("workout-guide-assets/bench-press/frame-1.png");
    expect(rows[0].frame1).not.toContain("http");
  });

  test("bench-press tiene instrucciones en español", () => {
    const ins = getInstructions("bench-press");
    expect(ins).not.toBeNull();
    expect(ins!.steps_es.length).toBeGreaterThan(0);
    expect(ins!.steps_es.join(" ")).toMatch(/pecho|banco|barra/i);
  });

  test("un alias curado también resuelve (rope pushdown)", () => {
    const ins = getInstructions("rope-tricep-pushdown");
    expect(ins).not.toBeNull();
    expect(ins!.steps_es.length).toBeGreaterThan(0);
  });

  test("lote propio: face-pull redactado en español", () => {
    const ins = getInstructions("face-pull");
    expect(ins).not.toBeNull();
    expect(ins!.steps_es.length).toBeGreaterThanOrEqual(4);
    expect(ins!.steps_es.join(" ")).toMatch(/cuerda|cara/i);
  });

  test("grupo final (pantorrillas, cardio, movilidad) a mano", () => {
    expect(getInstructions("calf-raise")!.source).toBe("propia");
    expect(getInstructions("burpee")!.steps_es.length).toBeGreaterThanOrEqual(4);
    expect(getInstructions("jump-rope")!.steps_es.join(" ")).toMatch(/cuerda|salt/i);
  });

  test("ninguna instrucción viene ya de la API", async () => {
    const { exercises } = await import("@bryllim/workout-guide");
    const sinRedaccion = exercises.filter((e) => getInstructions(e.slug)?.source !== "propia");
    expect(sinRedaccion.map((e) => e.slug)).toEqual([]);
  });

  test("grupo core redactado a mano (plank, russian-twist, v-up)", () => {
    expect(getInstructions("plank")!.source).toBe("propia");
    // plank antes venía de "power point plank", un variante distinto.
    expect(getInstructions("plank")!.steps_es.length).toBeGreaterThanOrEqual(4);
    expect(getInstructions("russian-twist")!.steps_es.join(" ")).toMatch(/torso|rot/i);
  });

  test("grupo gluteos/isbios redactado a mano (deadlift, leg-curl, kettlebell-swing)", () => {
    expect(getInstructions("deadlift")!.source).toBe("propia");
    // leg-curl antes venía de "biceps leg concentration curl": no era el mismo.
    expect(getInstructions("leg-curl")!.steps_es.join(" ")).toMatch(/polea|curl|isquio/i);
    expect(getInstructions("kettlebell-swing")!.steps_es.length).toBeGreaterThanOrEqual(5);
  });

  test("grupo cuadriceps redactado a mano (squat, leg-press, leg-extension)", () => {
    expect(getInstructions("squat")!.source).toBe("propia");
    expect(getInstructions("leg-extension")!.steps_es.length).toBeGreaterThanOrEqual(4);
    // squat NO puede venir de la API: antes leía "band squat".
    expect(getInstructions("squat")!.steps_es.join(" ")).toMatch(/barra|rack|profundidad/i);
  });

  test("grupo biceps redactado a mano (bicep-curl, chin-up, ez-bar-curl)", () => {
    expect(getInstructions("bicep-curl")!.source).toBe("propia");
    expect(getInstructions("chin-up")!.steps_es.join(" ")).toMatch(/supin|palmas|bíceps/i);
    expect(getInstructions("ez-bar-curl")!.steps_es.length).toBeGreaterThanOrEqual(4);
  });

  test("grupo espalda redactado a mano (barbell-row, lat-pulldown, pull-up)", () => {
    expect(getInstructions("barbell-row")!.source).toBe("propia");
    expect(getInstructions("lat-pulldown")!.steps_es.join(" ")).toMatch(/polea|agarre/i);
    expect(getInstructions("pull-up")!.steps_es.length).toBeGreaterThanOrEqual(5);
  });

  test("grupo triceps redactado a mano (tricep-pushdown, diamond-push-up)", () => {
    expect(getInstructions("tricep-pushdown")!.source).toBe("propia");
    expect(getInstructions("diamond-push-up")!.steps_es.join(" ")).toMatch(/dedos|triceps/i);
    expect(getInstructions("skull-crusher")!.steps_es.length).toBeGreaterThanOrEqual(4);
  });

  test("grupo hombros redactado a mano (overhead-press, lateral-raise)", () => {
    expect(getInstructions("overhead-press")!.source).toBe("propia");
    expect(getInstructions("lateral-raise")!.steps_es.join(" ")).toMatch(/hombro|deltoide/i);
    expect(getInstructions("handstand-push-up")!.steps_es.length).toBeGreaterThanOrEqual(4);
  });

  test("grupo pecho redactado a mano (bench-press, push-up)", () => {
    const press = getInstructions("bench-press");
    expect(press!.source).toBe("propia");
    expect(press!.steps_es.join(" ")).toMatch(/barra|banco/i);
    expect(press!.steps_es.length).toBeGreaterThanOrEqual(5);
    // push-up no puede venir del dataset: ese slug está cubierto por el
    // alias automático, así que exigimos fuente propia explícita.
    expect(getInstructions("push-up")!.source).toBe("propia");
  });

  test("lote propio 3: bandas, core y movilidad (banded-row, bird-dog)", () => {
    expect(getInstructions("banded-row")!.steps_es.length).toBeGreaterThanOrEqual(4);
    expect(getInstructions("bird-dog")!.steps_es.join(" ")).toMatch(/columna|espina/i);
  });

  test("cobertura completa: los 302 de workout-guide tienen instrucciones ES", async () => {
    const { exercises } = await import("@bryllim/workout-guide");
    const gaps = exercises.filter((e) => !getInstructions(e.slug)?.steps_es.length);
    expect(gaps.map((g) => g.slug)).toEqual([]);
  });

  test("lote propio 2: tren inferior (hip-thrust, clamshell)", () => {
    expect(getInstructions("hip-thrust")!.steps_es.length).toBeGreaterThanOrEqual(4);
    expect(getInstructions("clamshell")!.steps_es.join(" ")).toMatch(/cadera|rodilla|clamshell/i);
  });

  test("un slug fuera del catálogo devuelve null", () => {
    expect(getInstructions("no-existe-en-workout-guide")).toBeNull();
  });

  test("sin filtros devuelve los 302 del catálogo", () => {
    expect(filterLibrary({}).length).toBe(302);
  });

  test("filtra por equipo", () => {
    const rows = filterLibrary({ equipment: "Barbell" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.equipment === "Barbell")).toBe(true);
  });

  test("filtra por músculo guía", () => {
    const rows = filterLibrary({ muscle: "Chest" });
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.guidePrimary === "Chest")).toBe(true);
  });

  test("combina búsqueda con filtro", () => {
    const rows = filterLibrary({ query: "press", equipment: "Dumbbell" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.equipment === "Dumbbell" && /press/i.test(r.name))).toBe(true);
  });

  test("un filtro sin resultados devuelve lista vacía", () => {
    expect(filterLibrary({ equipment: "Towel", muscle: "Calves" })).toEqual([]);
  });

  test("estima 1RM con Epley", () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.7, 1);
  });
});

describe("la biblioteca como capa editable", () => {
  const mia = (over: Partial<LibraryUserEntry> = {}): LibraryUserEntry => ({
    slug: "mia-1",
    name: "Mi press",
    equipment: "Barra",
    muscles: { primary: ["pectoral"], secondary: [] },
    how_to: "Paso 1",
    ...over,
  });
  /** La entrada propia de referencia, para los tests de desfasados y de caché. */
  const MIA: LibraryUserEntry = mia();

  test("sin entradas propias, el catálogo son 302", () => {
    expect(searchLibrary("", []).length).toBe(302);
    expect(searchLibrary("").length).toBe(302);
  });

  test("una entrada propia aparece junto al catálogo", () => {
    expect(searchLibrary("", [mia()]).length).toBe(303);
    expect(searchLibrary("mi press", [mia()])[0]!.slug).toBe("mia-1");
  });

  test("una entrada propia no tiene imágenes", () => {
    const e = searchLibrary("", [mia()]).find((x) => x.slug === "mia-1")!;
    expect(e.frames).toEqual([]);
    expect(e.frame1).toBeNull();
  });

  test("un campo propio relleno gana al del catálogo", () => {
    // Edita bench-press: gana el nombre, pero la imagen sigue siendo la del
    // paquete, porque lo propio no la pisa.
    const rows = searchLibrary(
      "",
      [mia({ slug: "bench-press", name: "Press banca", how_to: "Mío" })],
    );
    const e = rows.find((x) => x.slug === "bench-press")!;
    expect(rows.length).toBe(302);
    expect(e.name).toBe("Press banca");
    expect(e.how_toPropia).toBe("Mío");
    expect(e.frame1).toContain("bench-press");
  });

  test("un campo propio vacío deja el del catálogo", () => {
    const base = searchLibrary("").find((x) => x.slug === "bench-press")!;
    // Todos los campos propios vacíos: así ninguno debe pisar al catálogo.
    const nada = mia({
      slug: "bench-press",
      name: "Press banca",
      equipment: "",
      muscles: { primary: [], secondary: [] },
      how_to: "",
    });
    const e = searchLibrary("", [nada]).find((x) => x.slug === "bench-press")!;
    expect(e.guidePrimary).toBe(base.guidePrimary);
    expect(e.localPrimary).toEqual(base.localPrimary);
    // Vacío significa "déjalo como estaba", no "bórralo".
    expect(e.how_toPropia).toBe("");
  });

  test("los músculos propios sí pisan a los del catálogo", () => {
    // El otro lado de la regla: un músculo tuyo manda sobre el del catálogo.
    const e = searchLibrary(
      "",
      [mia({ slug: "bench-press", name: "Press banca", muscles: { primary: ["lats"], secondary: [] } })],
    ).find((x) => x.slug === "bench-press")!;
    expect(e.localPrimary).toEqual(["lats"]);
    // Y en el desplegable sale el nombre, no el id crudo.
    expect(e.guidePrimary).toBe("Dorsales");
  });

  test("las instrucciones propias se encuentran por slug", () => {
    const ins = getInstructions("mia-1", [mia({ how_to: "1. Baja\n2. Empuja" })])!;
    expect(ins.steps_es).toEqual(["1. Baja", "2. Empuja"]);
  });

  test("sin entrada propia, las instrucciones del paquete siguen ahí", () => {
    expect(getInstructions("bench-press")!.source).toBe("propia");
  });

  test("una entrada propia sin músculos se lista y no desaparece", () => {
    // Review Focus 2: sin músculos debe poder encontrarse, no desaparecer.
    const vacia = mia({ equipment: "", muscles: { primary: [], secondary: [] } });
    const e = searchLibrary("", [vacia]).find((x) => x.slug === "mia-1")!;
    expect(e.localPrimary).toEqual([]);
    expect(searchLibrary("", [mia()]).length).toBe(303);
    expect(filterLibrary({}, [vacia]).length).toBe(303);
  });

  test("una entrada propia se encuentra por el filtro de equipo y de músculo", () => {
    expect(filterLibrary({ equipment: "Barra" }, [mia()]).some((r) => r.slug === "mia-1")).toBe(true);
    expect(filterLibrary({ muscle: "Pectoral" }, [mia()]).some((r) => r.slug === "mia-1")).toBe(true);
  });

  test("libraryEntry devuelve la propia si el slug es de una entrada tuya", () => {
    expect(libraryEntry("mia-1", [mia()])!.name).toBe("Mi press");
    expect(libraryEntry("mia-1")).toBeNull();
  });

  test("los desplegables de filtro incluyen lo que solo usan tus ejercicios", () => {
    expect(libraryEquipment([mia({ equipment: "Yo" })])).toContain("Yo");
    expect(libraryMuscles([mia()])).toContain("Pectoral");
    // Sin entradas propias siguen siendo los del catálogo.
    expect(libraryEquipment([])).toContain("Barbell");
  });

  // ── Cuándo avisa de copias desfasadas ──────────────────────────────────
  //
  // `staleCopies` decide si sale el banner «cambió en la biblioteca». Antes solo
  // se cubría a través del componente, y es justo la función que puede mentir:
  // decir que algo está viejo cuando el origen ya no existe.

  const fpOf = (over: Partial<LibraryUserEntry> = {}) =>
    libraryFingerprint({
      slug: MIA.slug,
      name: MIA.name,
      how_toPropia: MIA.how_to,
      localPrimary: MIA.muscles.primary,
      localSecondary: MIA.muscles.secondary,
      ...over,
    });

  test("una copia cuya huella ya no cuadra está desfasada", () => {
    const ex = { source: "mia-1", sourceFp: "vieja" };
    expect(staleCopies([ex], [MIA])).toEqual([ex]);
  });

  test("una copia con la huella al día no está desfasada", () => {
    expect(staleCopies([{ source: "mia-1", sourceFp: fpOf() }], [MIA])).toEqual([]);
  });

  test("una copia sin origen no se marca", () => {
    // Escrita a mano: no viene de la biblioteca y no hay nada que comparar.
    expect(staleCopies([{ source: "", sourceFp: "" }], [MIA])).toEqual([]);
    expect(staleCopies([{}], [MIA])).toEqual([]);
  });

  test("un origen que ya no existe en la biblioteca no avisa", () => {
    // Review Focus 5: la entrada se borró a mano. Comparar su huella daría un
    // aviso sobre algo que ya no está, y sería mentira.
    expect(staleCopies([{ source: "mia-borrada", sourceFp: "lo-que-sea" }], [MIA])).toEqual([]);
  });

  test("solo avisa de las copias cuyo origen está en TU biblioteca", () => {
    // Una entrada del catálogo no tiene por qué estar en tu fichero: si está,
    // avisa; si no, no hay contra qué comparar.
    const copia = { source: "bench-press", sourceFp: "vieja" };
    expect(staleCopies([copia], [MIA])).toEqual([]);
    expect(staleCopies([copia], [])).toEqual([]);
  });

  test("devuelve los mismos objetos, no copias: el que llama necesita su id", () => {
    const ex = { id: "e1", source: "mia-1", sourceFp: "vieja" };
    const [out] = staleCopies([ex], [MIA]);
    expect(out).toBe(ex);
  });

  test("marca solo las desfasadas y en el orden del programa", () => {
    const a = { id: "a", source: "mia-1", sourceFp: fpOf() };
    const b = { id: "b", source: "mia-1", sourceFp: "vieja" };
    const c = { id: "c", source: "mia-1", sourceFp: "más vieja" };
    expect(staleCopies([a, b, c], [MIA]).map((x) => x.id)).toEqual(["b", "c"]);
  });

  test("cambiar los pasos de la entrada deja la copia desfasada", () => {
    // El caso real: editas cómo hacerlo en la biblioteca y la copia se queda
    // con el texto viejo.
    const antes = fpOf();
    const nuevo = "1. Baja\n2. Empuja\n3. Respira";
    const entradaEditada = [{ ...MIA, how_to: nuevo }];
    expect(fpOf({ how_toPropia: nuevo })).not.toBe(antes);
    // La copia conserva la huella vieja → desfasada.
    expect(staleCopies([{ source: "mia-1", sourceFp: antes }], entradaEditada)).toHaveLength(1);
    // Actualizada a la nueva → al día.
    expect(staleCopies([{ source: "mia-1", sourceFp: fpOf({ how_toPropia: nuevo }) }], entradaEditada)).toEqual([]);
  });

  test("sin entradas propias no hay nada desfasado", () => {
    expect(staleCopies([{ source: "mia-1", sourceFp: "vieja" }], [])).toEqual([]);
  });

  // ── La fusión se cachea ────────────────────────────────────────────────
  //
  // Mezclar son 302 entradas y varios filtros lo piden en el mismo repintado.
  // Si la fusión se repitiera, escribir en el programa se pondría pastoso; y
  // cuando loarse rompió, un test dio timeout sin decir por qué.

  test("fusionar dos veces con las mismas entradas devuelve lo mismo", () => {
    const entries = [MIA];
    expect(mergeLibrary(entries)).toBe(mergeLibrary(entries));
  });

  test("cambiar las entradas vuelve a fusionar", () => {
    const antes = mergeLibrary([MIA]);
    const despues = mergeLibrary([MIA, { ...MIA, slug: "mia-2", name: "Otro" }]);
    expect(antes).not.toBe(despues);
    expect(despues.length).toBe(antes.length + 1);
  });

  test("pedir una entrada no invalida la caché", () => {
    // `libraryEntry` antes fusionaba un array nuevo con una sola entrada, así
    // que invalidaba la caché en cada llamada — y `staleCopies` la llama por
    // copia, en cada repintado.
    //
    // La comparación es con la fusión **de antes** de las llamadas: comparar dos
    // `mergeLibrary` seguidas siempre daría igual y no detectaría nada.
    const entries = [MIA];
    const antes = mergeLibrary(entries);
    libraryEntry("mia-1", entries);
    libraryEntry("mia-1", entries);
    expect(mergeLibrary(entries)).toBe(antes);
  });

  test("la huella no depende del orden de los músculos", () => {
    const a = libraryFingerprint({
      slug: "mia-1",
      name: "X",
      how_toPropia: "y",
      localPrimary: ["a", "b"],
      localSecondary: [],
    });
    const b = libraryFingerprint({
      slug: "mia-1",
      name: "X",
      how_toPropia: "y",
      localPrimary: ["b", "a"],
      localSecondary: [],
    });
    expect(a).toBe(b);
  });

  test("la huella cambia si cambia el nombre, los pasos o los músculos", () => {
    const base = {
      slug: "mia-1",
      name: "X",
      how_toPropia: "y",
      localPrimary: ["pectoral"],
      localSecondary: [] as string[],
    };
    const ref = libraryFingerprint(base);
    expect(libraryFingerprint({ ...base, name: "Z" })).not.toBe(ref);
    expect(libraryFingerprint({ ...base, how_toPropia: "z" })).not.toBe(ref);
    expect(libraryFingerprint({ ...base, localPrimary: ["espalda"] })).not.toBe(ref);
    expect(libraryFingerprint({ ...base, slug: "mia-2" })).not.toBe(ref);
  });

  describe("fieldsFromLibrary", () => {
    // Esta función sustituye a dos copias idénticas que estaban en
    // `ExerciseForm` (al elegir del buscador) y `Library` (al añadir). Las dos
    // montaban los mismos cinco campos, así que un campo nuevo obliga a
    // acordarse de dos sitios y uno se queda corto.
    test("rellena nombre, músculos, origen y huella desde la entrada", () => {
      const entry = libraryEntry("bench-press")!;
      const f = fieldsFromLibrary(entry);
      expect(f.name).toBe(entry.name);
      expect(f.source).toBe("bench-press");
      expect(f.sourceFp).toBe(libraryFingerprint(entry));
      expect(f.muscles).toEqual({
        primary: entry.localPrimary,
        secondary: entry.localSecondary,
      });
    });

    test("los pasos salen numerados, como texto plano", () => {
      const entry = libraryEntry("bench-press")!;
      const pasos = getInstructions("bench-press")!.steps_es!;
      expect(pasos.length).toBeGreaterThan(0);
      expect(fieldsFromLibrary(entry).how_to).toBe(
        pasos.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      );
    });

    test("sin pasos propios, «cómo hacerlo» dice el equipo y el grupo", () => {
      // Sin pasos hay que decir algo: el nombre solo no ayuda a hacerlo.
      const entry = libraryEntry("bench-press")!;
      const vacio = fieldsFromLibrary({
        ...entry,
        localPrimary: [],
        localSecondary: [],
      });
      expect(vacio.how_to.length).toBeGreaterThan(0);
    });

    test("sin pasos y sin equipo, no inventa texto", () => {
      // Con un slug de catálogo los pasos salen igual aunque no haya músculos:
      // vienen del workout-guide. Hace falta una entrada **propia** y mínima,
      // que es el único caso donde no hay pasos que decir.
      const entrada: LibraryUserEntry = {
        slug: "mia-vacia",
        name: "Mío sin nada",
        how_toPropia: "",
        localPrimary: [],
        localSecondary: [],
      };
      const f = fieldsFromLibrary(
        {
          id: "x",
          slug: "mia-vacia",
          name: "Mío sin nada",
          equipment: "",
          guidePrimary: "",
          guideSecondary: [],
          localPrimary: [],
          localSecondary: [],
        } as Parameters<typeof fieldsFromLibrary>[0],
        [entrada],
      );
      expect(f.how_to).toBe("");
    });
  });
});
