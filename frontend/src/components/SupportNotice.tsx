// Aviso «Ayúdanos» al abrir la app: una tarjeta pequeña en la esquina, sin bloquear nada. Sale unos segundos después de
// arrancar, como mucho una vez cada dos semanas, y se puede cerrar o apagar para siempre.

import { useEffect, useState } from "react";
import { Heart, X } from "lucide-react";
import { api } from "../lib/bridge";
import {
  PAYPAL_URL,
  SUPPORT_URL,
  readSupportState,
  shouldShowSupportNotice,
  writeSupportState,
} from "../lib/supportNotice";
import { useApp } from "../store/app";

const SHOW_AFTER_MS = 4000;

export function SupportNotice() {
  const info = useApp((s) => s.info);
  const [open, setOpen] = useState(false);

  // Las pruebas y las capturas automáticas (HOME aislado) nunca lo ven.
  const skip = !info || info.sandbox === true;

  useEffect(() => {
    if (skip) return;
    const now = Date.now();
    if (!shouldShowSupportNotice(readSupportState(), now)) return;
    const t = setTimeout(() => {
      setOpen(true);
      writeSupportState({ ...readSupportState(), lastShown: Date.now() });
    }, SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [skip]);

  if (!open) return null;

  const close = () => setOpen(false);
  const never = () => {
    writeSupportState({ ...readSupportState(), never: true });
    setOpen(false);
  };
  const go = (url: string) => {
    void api.openExternal(url).catch(() => undefined);
    setOpen(false);
  };

  return (
    <aside
      role="complementary"
      aria-label="Ayuda a NoteVault"
      data-testid="support-notice"
      className="fixed bottom-10 left-16 z-40 w-[320px] rounded-xl border border-line-strong bg-card p-3.5 text-[12.5px] shadow-xl"
    >
      <div className="flex items-start gap-2">
        <Heart size={15} className="mt-0.5 flex-none text-accent" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-text">Help us · Ayúdanos</div>
          <p className="mt-1 leading-relaxed text-dim">
            Somos estudiantes y NoteVault es gratis y de código abierto. Cualquier ayuda, por pequeña que sea, nos permite seguir desarrollándolo.
          </p>
        </div>
        <button type="button" onClick={close} aria-label="Cerrar" className="text-faint hover:text-text">
          <X size={13} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => go(PAYPAL_URL)}
          className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90"
        >
          Apoyar con PayPal
        </button>
        <button
          type="button"
          onClick={() => go(SUPPORT_URL)}
          className="rounded-md border border-line-strong px-2.5 py-1 text-[12px] text-text hover:bg-hover"
        >
          Otras formas
        </button>
        <button type="button" onClick={never} className="ml-auto text-[11.5px] text-faint underline hover:text-text">
          No volver a mostrar
        </button>
      </div>
    </aside>
  );
}
