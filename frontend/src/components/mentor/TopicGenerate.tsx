// Mentor — botones «Generar todo» de un tema y de un área. Abren el MISMO diálogo de confirmación de «Ejecutar plan» pero con el alcance
// reducido a ese tema (o área): enseña el informe exacto de lo que se creará y no escribe nada hasta confirmar. Lo que ya existe no se toca.

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { GhostButton } from "../common/forms";
import { DEFAULT_UI_SCOPE, ExecuteDialog } from "./PlanExecution";
import type { ExecutionScope } from "../../lib/planExecution";
import { useMentor } from "../../store/mentor";

/** Alcance de «todo lo referente a un tema»: teoría, mapa, manifiesto y ejercicios de todas las dificultades. */
export const topicScope = (folder: string): ExecutionScope => ({ ...DEFAULT_UI_SCOPE, mode: "topic", folder, includeRecommended: true, includeAreaPractice: false, includeKatasAi: false, includeNewTopics: false });
/** Alcance de un área entera (sin la carpeta de práctica diaria, que es otra capa). */
export const areaScope = (areaKey: string): ExecutionScope => ({ ...DEFAULT_UI_SCOPE, mode: "area", areaKey, includeRecommended: false, includeAreaPractice: false });

export function GenerateButton({ planId, proposed, scope, label, ariaLabel, disabled, title, testid }: {
  planId: string;
  proposed: boolean;
  scope: ExecutionScope;
  label: string;
  ariaLabel: string;
  disabled?: boolean;
  title?: string;
  testid?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GhostButton onClick={() => setOpen(true)} disabled={disabled} title={title} aria-label={ariaLabel} data-testid={testid ?? "generate-button"}>
        <Sparkles size={14} aria-hidden /> {label}
      </GhostButton>
      {open && (
        <ExecuteDialog
          planId={planId}
          proposed={proposed}
          initialScope={scope}
          onClose={() => setOpen(false)}
          onStarted={() => {
            useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
          }}
        />
      )}
    </>
  );
}

/** «Generar todo» de un tema: desactivado si el tema no está en el plan o ya está completo. */
export function GenerateTopicButton({ planId, proposed, folder, title, inPlan, incomplete }: { planId: string; proposed: boolean; folder: string; title: string; inPlan: boolean; incomplete: boolean }) {
  const off = !inPlan || !incomplete;
  return (
    <GenerateButton
      planId={planId}
      proposed={proposed}
      scope={topicScope(folder)}
      label={!inPlan ? "Fuera del plan" : incomplete ? "Generar todo" : "Completo"}
      ariaLabel={`Generar todo lo que falta de ${title}`}
      disabled={off}
      title={!inPlan ? "Solo se generan los temas que están en el plan" : incomplete ? "Crea lo que falta de este tema: teoría, mapa, manifiesto y ejercicios" : "No falta nada de este tema"}
      testid="generate-topic"
    />
  );
}
