// Ejercicios: la rutina que tienes y la biblioteca de 302, en un solo sitio.
//
// Se fusionaron porque las dos hacen la misma acción —meter un ejercicio en la
// rutina— y obligaban a un rodeo: al añadir desde la Biblioteca entraba con las
// series y el descanso vacíos, y filling them exigía cambiar de pantalla.
//
// Ahora el detalle de la Biblioteca trae el formulario: se añade y se completa
// sin salir.

import { usePersistedNav } from "../../store/navState";
import { cn } from "../ui";
import { Header } from "../habits/parts";
import { Library } from "./Library";
import { Routine } from "./Routine";

const TABS = [
  { id: "rutina", label: "Tu rutina" },
  { id: "biblioteca", label: "Biblioteca" },
] as const;

export function Exercises() {
  const [tab, setTab] = usePersistedNav<(typeof TABS)[number]["id"]>(
    "ejercicio.ejercicios",
    "rutina",
  );

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
      {tab === "biblioteca" ? <Library embedded /> : <Routine />}
    </div>
  );
}