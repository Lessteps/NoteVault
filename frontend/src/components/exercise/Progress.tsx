// Progreso: tres pestañas, y nada más.
//
// Antes eran cinco (Semana, Mes, Año, Mapa, Gráfica) y tres de ellas pedían
// el mismo dato por caminos distintos. Ahora:
//
//   Rejilla  → marcar. Semana y Mes en un selector, es la misma tabla.
//   Músculos → entender. El cuerpo grande y la gráfica de líneas son la misma
//              pregunta—“qué estoy trabajando”— en dos formatos.
//   Año      → el histórico de doce meses, que no cabe en una rejilla.
//
// Mapa y Gráfica siguen el periodo de la rejilla, así que si marcas en el mes
// y pasas a Músculos, lo que ves es el mes.

import { Header } from "../habits/parts";
import { ExerciseMonth, ExerciseWeek } from "./Grids";
import { ProgressGraph } from "./ProgressGraph";
import { ProgressMap } from "./ProgressMap";
import { WeeklyMuscleVolume } from "./WeeklyMuscleVolume";
import { Yearly } from "./Yearly";
import { BodyProfile } from "./BodyProfile";
import { usePersistedNav } from "../../store/navState";
import { cn } from "../ui";

const TABS = [
  { id: "rejilla", label: "Rejilla" },
  { id: "musculos", label: "Músculos" },
  { id: "cuerpo", label: "Cuerpo" },
  { id: "anio", label: "Año" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type GridPeriod = "semana" | "mes";

const GRID_PERIODS = [
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
] as const;

export function Progress() {
  // Las pestañas se renombraron: quien tuviera "grafica" o "mapa" guardados cae
// en Músculos, que es donde viven ahora, y no en un panel vacío.
const TABS_IDS = TABS.map((t) => t.id) as string[];
const [stored, setTab] = usePersistedNav<TabId>("ejercicio.progreso", "rejilla");
const tab: TabId =
  TABS_IDS.includes(stored) || stored === ("grafica" as TabId) || stored === ("mapa" as TabId)
    ? stored === ("grafica" as TabId) || stored === ("mapa" as TabId)
      ? "musculos"
      : stored
    : "rejilla";
  const [grid, setGrid] = usePersistedNav<GridPeriod>("ejercicio.rejilla", "semana");
  // Mapa y gráfica muestran el periodo de la rejilla; se recuerda al saltar.
  const [muscleView, setMuscleView] = usePersistedNav<"grafica" | "mapa" | "volumen">(
    "ejercicio.musculos.vista",
    "grafica",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title="Progreso">
        <div data-progress-tabs className="flex items-center gap-1" role="tablist" aria-label="Vista">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              data-progress-tab={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[12.5px] transition-colors",
                tab === t.id
                  ? "bg-accent-soft text-text"
                  : "text-dim hover:bg-hover hover:text-text",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Header>

      {tab === "musculos" && (
        <div
          data-muscle-view
          className="flex flex-none items-center gap-2 border-b border-line px-6 py-1.5"
          role="tablist"
          aria-label="Forma de verlo"
        >
          {([
            { id: "grafica", label: "Gráfica" },
            { id: "mapa", label: "Cuerpo" },
            { id: "volumen", label: "Volumen semanal" },
          ] as const).map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={muscleView === v.id}
              data-muscle-view={v.id}
              onClick={() => setMuscleView(v.id)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors",
                muscleView === v.id
                  ? "border-accent bg-accent-soft text-text"
                  : "border-line text-faint hover:text-dim",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div data-progress-view className="flex min-h-0 flex-1 flex-col">
        {tab === "rejilla" ? (
          <>
            <div className="flex flex-none items-center gap-2 px-6 pt-2">
              <div data-grid-period className="flex items-center gap-1" role="tablist" aria-label="Periodo">
                {GRID_PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={grid === p.id}
                    data-grid-period={p.id}
                    onClick={() => setGrid(p.id)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[12.5px] transition-colors",
                      grid === p.id
                        ? "bg-accent-soft text-text"
                        : "text-dim hover:bg-hover hover:text-text",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {grid === "semana" ? <ExerciseWeek /> : <ExerciseMonth />}
          </>
        ) : tab === "musculos" ? (
          muscleView === "volumen" ? (
            <WeeklyMuscleVolume />
          ) : muscleView === "mapa" ? (
            <ProgressMap period={grid} />
          ) : (
            <ProgressGraph period={grid} />
          )
        ) : tab === "cuerpo" ? (
          <BodyProfile />
        ) : (
          <Yearly />
        )}
      </div>
    </div>
  );
}