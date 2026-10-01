// Ejercicios: tu programa semanal y la biblioteca de 302, en un solo sitio.
//
// Se fusionaron porque las dos hacen la misma acción —meter un ejercicio en el
// programa— y obligaban a un rodeo: al añadir desde la Biblioteca entraba con las
// series y el descanso vacíos, y filling them exigía cambiar de pantalla.
//
// Aquí se edita el programa (el molde). Entrenar de verdad es otra pantalla,
// Diaria, y el botón «Ir a hoy» va de una a la otra.

import { usePersistedNav } from "../../store/navState";
import { cn } from "../ui";
import { Header } from "../habits/parts";
import { Library } from "./Library";
import { Routine } from "./Routine";

const TABS = [
  { id: "programa", label: "Tu programa" },
  { id: "biblioteca", label: "Biblioteca" },
] as const;

export function Exercises({ onGoToday }: { onGoToday: () => void }) {
  const [stored, setTab] = usePersistedNav<string>("ejercicio.ejercicios", "programa");
  const isTab = (v: string) => TABS.some((t) => t.id === v);
  // Cualquier pestaña guardada que ya no exista —la vieja se llamaba `rutina`—
  // cae en el programa. Sin esto, un id desconocido dejaría la pantalla en
  // blanco, que es peor que un destino por defecto.
  const tab = isTab(stored) ? (stored as (typeof TABS)[number]["id"]) : "programa";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title="Ejercicios">
        <div className="flex items-center gap-1" role="tablist" aria-label="Qué ver">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              data-exercises-tab={t.id}
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
      {tab === "biblioteca" ? (
        <Library embedded />
      ) : (
        <Routine onGoToday={onGoToday} onGoBiblioteca={() => setTab("biblioteca")} />
      )}
    </div>
  );
}