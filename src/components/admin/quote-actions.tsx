"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { AvisoState } from "@/actions/quotes";
import { ESTADOS_COTIZACION, type EstadoCotizacion } from "@/lib/cotizaciones";

/** Cambia el estado de una cotización. Se envía apenas se elige, sin botón aparte. */
export function CambiarEstadoCotizacion({
  action,
  status,
}: {
  action: (formData: FormData) => void;
  status: EstadoCotizacion;
}) {
  const [pendiente, startTransition] = useTransition();
  const t = useTranslations("estadosCotizacion");
  const tDetail = useTranslations("cotizacionDetail");

  return (
    <form
      action={(fd) => startTransition(() => action(fd))}
      className="flex items-center gap-2"
    >
      <label htmlFor="status" className="sr-only">
        {tDetail("estadoLabel")}
      </label>
      <select
        id="status"
        name="status"
        defaultValue={status}
        disabled={pendiente}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none disabled:opacity-60"
      >
        {ESTADOS_COTIZACION.map((estado) => (
          <option key={estado} value={estado}>
            {t(estado)}
          </option>
        ))}
      </select>
    </form>
  );
}

/**
 * Manda otra vez el aviso de creación de una cotización, cuando el primero no
 * salió. Dice ahí mismo cómo terminó: una petición que no llega no devuelve un
 * error, lanza, y sin atraparla tumbaría la pantalla.
 */
export function ReenviarAvisoBoton({
  action,
}: {
  action: () => Promise<AvisoState>;
}) {
  const [pendiente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<AvisoState>({});
  const t = useTranslations("cotizacionDetail");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          startTransition(async () => {
            try {
              setResultado(await action());
            } catch {
              setResultado({ error: t("sinConexion") });
            }
          })
        }
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendiente ? t("enviandoAviso") : t("reenviarAviso")}
      </button>
      {resultado.error ? (
        <p role="alert" className="text-sm text-danger">
          {resultado.error}
        </p>
      ) : null}
      {resultado.ok ? <p className="text-sm text-success">{resultado.ok}</p> : null}
    </div>
  );
}

export function MarcarRevisadaBoton({
  action,
}: {
  action: () => void | Promise<void>;
}) {
  const [pendiente, startTransition] = useTransition();
  const t = useTranslations("cotizacionDetail");

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => startTransition(action)}
      className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pendiente ? "…" : t("marcarRevisada")}
    </button>
  );
}
