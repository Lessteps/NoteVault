// «Promover a meta», «Mover a…» y «Convertir en submeta de…»: una submeta y una meta principal son intercambiables.

import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import type { GoalCard, GoalItem } from "../../lib/types";
import { useApp } from "../../store/app";
import { useGoals } from "../../store/goals";
import { Field, GhostButton, inputBase, Modal, PrimaryButton } from "../common/forms";

/** Elige meta destino y submeta padre (o la raíz). `mode: "item"` mueve una submeta; `"goal"` convierte una meta en submeta. */
export function TransferDialog({ mode, gid, item, onClose }: { mode: "item" | "goal"; gid: string; item?: GoalItem; onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const open = useGoals((s) => s.open);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const [goals, setGoals] = useState<GoalCard[]>([]);
  const [target, setTarget] = useState("");
  const [parents, setParents] = useState<GoalItem[]>([]);
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.goalsList("todas", "*").then((l) => {
      if (!alive) return;
      const pool = Array.isArray(l) ? (mode === "goal" ? l.filter((g) => g.id !== gid) : l) : [];
      const first = pool.find((g) => g.id === gid)?.id ?? pool[0]?.id ?? "";
      setGoals(pool);
      setTarget((t) => t || first);
    }).catch(() => alive && setGoals([]));
    return () => { alive = false; };
  }, [gid, mode]);

  useEffect(() => {
    let alive = true;
    setParent("");
    if (!target) { setParents([]); return; }
    api.goalsGet(target).then((d) => {
      if (!alive) return;
      // Sin la propia submeta ni su subárbol.
      const banned = new Set<string>();
      if (mode === "item" && item && target === gid) {
        banned.add(item.id);
        for (let grew = true; grew;) {
          grew = false;
          for (const i of d.items) if (!banned.has(i.id) && banned.has(i.parent)) { banned.add(i.id); grew = true; }
        }
      }
      setParents(d.items.filter((i) => !banned.has(i.id)).sort((a, b) => a.order - b.order));
    }).catch(() => alive && setParents([]));
    return () => { alive = false; };
  }, [target, gid, item, mode]);

  const depthOf = (i: GoalItem): number => {
    let n = 0;
    for (let p = parents.find((x) => x.id === i.parent); p; p = parents.find((x) => x.id === p!.parent)) n += 1;
    return n;
  };

  const run = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (mode === "goal") await api.goalDemote(gid, target, parent);
      else await api.goalItemMoveTo(gid, item!.id, target, parent);
      toast("info", mode === "goal" ? "Meta convertida en submeta." : "Submeta movida.");
      onClose();
      if (target !== gid || mode === "goal") await open(target);
      else await refresh();
    } catch (e) {
      toast("error", (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={mode === "goal" ? "Convertir en submeta de…" : "Mover submeta a…"} onClose={onClose} width={460}
      footer={<>
        <span className="flex-1" />
        <GhostButton onClick={onClose}>Cancelar</GhostButton>
        <PrimaryButton disabled={!target || busy} onClick={() => void run()}>{mode === "goal" ? "Convertir" : "Mover"}</PrimaryButton>
      </>}>
      <Field label="Meta destino">
        <select aria-label="Meta destino" className={`${inputBase} w-full`} value={target} onChange={(e) => setTarget(e.target.value)}>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
        </select>
      </Field>
      <Field label="Dentro de">
        <select aria-label="Submeta padre" className={`${inputBase} w-full`} value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">(Primer nivel de la meta)</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{"— ".repeat(depthOf(p))}{p.name}</option>)}
        </select>
      </Field>
      <p className="text-[11.5px] text-faint">
        {mode === "goal"
          ? "La meta pasa a ser una submeta con todas sus submetas dentro. Su área, icono y color se sustituyen por los de la meta destino."
          : "La submeta se lleva sus subniveles, enlaces, historial y progreso."}
      </p>
    </Modal>
  );
}

/** Promueve una submeta a meta principal y abre la meta nueva. */
export async function promoteItem(gid: string, item: GoalItem): Promise<void> {
  const { toast } = useApp.getState();
  const { open } = useGoals.getState();
  try {
    const goal = await api.goalItemPromote(gid, item.id);
    toast("info", `«${goal.name}» es ahora una meta principal.`);
    await open(goal.id);
  } catch (e) {
    toast("error", (e as Error).message);
  }
}
