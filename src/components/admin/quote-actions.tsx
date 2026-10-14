"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { AvisoState, FechaFinalizacionState } from "@/actions/quotes";
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

/**
 * Registrar o corregir a mano la fecha de finalización. Cerrado es solo el
 * botón, para no estorbar en el detalle; abierto, el campo de fecha. Al
 * guardar se cierra, y la página se vuelve a pintar con la fecha nueva: la
 * acción invalida el detalle y la lista.
 *
 * `max` no deja elegir un día futuro en el calendario, pero la regla de
 * verdad la aplica el servidor: esto solo ahorra un viaje.
 */
export function FechaFinalizacionForm({
  action,
  tieneFecha,
  valorInicial,
  hoy,
  minimo,
}: {
  action: (estado: FechaFinalizacionState, formData: FormData) => Promise<FechaFinalizacionState>;
  tieneFecha: boolean;
  /** "AAAA-MM-DD" de la fecha actual, o vacío si no tiene. */
  valorInicial: string;
  /** Hoy en hora de Colombia, "AAAA-MM-DD". */
  hoy: string;
  minimo: string;
}) {
  const t = useTranslations("cotizacionDetail");
  const [abierto, setAbierto] = useState(false);
  const [estado, formAction, pendiente] = useActionState<FechaFinalizacionState, FormData>(
    async (anterior, datos) => {
      // Una petición que no llega lanza en vez de devolver un error; sin
      // atraparla tumbaría la pantalla.
      try {
        const resultado = await action(anterior, datos);
        if (resultado.guardada) setAbierto(false);
        return resultado;
      } catch {
        return { error: t("sinConexion") };
      }
    },
    {},
  );

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:border-brand hover:text-brand"
      >
        {tieneFecha ? t("corregirFechaFinalizacion") : t("registrarFechaFinalizacion")}
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-border bg-surface-muted p-3">
      <label htmlFor="fechaFinalizacion" className="block text-xs font-medium text-muted">
        {t("fechaFinalizacionLabel")}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="fechaFinalizacion"
          name="fechaFinalizacion"
          type="date"
          required
          min={minimo}
          max={hoy}
          defaultValue={valorInicial}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendiente ? t("guardandoFecha") : t("guardarFecha")}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          disabled={pendiente}
          className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:text-text"
        >
          {t("cancelar")}
        </button>
      </div>
      <p className="text-xs text-muted">{t("fechaFinalizacionAyuda")}</p>
      {estado.error ? (
        <p role="alert" className="text-sm text-danger">
          {estado.error}
        </p>
      ) : null}
    </form>
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
