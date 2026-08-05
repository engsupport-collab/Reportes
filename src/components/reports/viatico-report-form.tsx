"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import type { ReporteState } from "@/actions/reports";
import type { Empresa } from "@/lib/queries/companies";
import type { OpcionCotizacionSelector } from "./quote-selector";

function Crear() {
  const { pending } = useFormStatus();
  const t = useTranslations("viaticoReportForm");

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? t("creando") : t("crear")}
    </button>
  );
}

/**
 * Formulario de un reporte de viáticos.
 *
 * Igual que uno de servicio, solo pide a qué cotización pertenece — no pide
 * proyecto ni cliente, que se copian de ahí al crearse. Es hermano del
 * reporte de servicio bajo la misma cotización, no algo que dependa de él:
 * por eso elige una cotización, no un reporte de servicio ya creado. Los
 * gastos en sí (concepto, monto, fecha, foto) se agregan después, uno por
 * uno, desde el detalle — igual que hoy se agregan los adjuntos.
 */
export function ViaticoReportForm({
  action,
  cancelarHref,
  empresas,
  companyIdFijo,
  empresaFija,
  cotizacionesPorEmpresa,
}: {
  action: (estado: ReporteState, formData: FormData) => Promise<ReporteState>;
  cancelarHref: string;
  /** Solo para el admin: elige antes para cuál empresa es este reporte. */
  empresas?: Empresa[];
  /** Para un empleado, o al editar: la empresa ya fijada. */
  companyIdFijo?: string;
  /** Al crear desde una cotización: la empresa la hereda de ella y no se elige. */
  empresaFija?: Empresa;
  /** Cotizaciones activas disponibles, por empresa — la misma lista que usa el formulario de servicio. */
  cotizacionesPorEmpresa: { companyId: string; opciones: OpcionCotizacionSelector[] }[];
}) {
  const [state, formAction] = useActionState<ReporteState, FormData>(
    action,
    {},
  );
  const t = useTranslations("viaticoReportForm");
  const [companyId, setCompanyId] = useState(
    empresaFija?.id ?? companyIdFijo ?? cotizacionesPorEmpresa[0]?.companyId ?? "",
  );

  const opciones =
    cotizacionesPorEmpresa.find((e) => e.companyId === companyId)?.opciones ?? [];

  return (
    <form action={formAction} className="space-y-5">
      {empresas ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 block text-sm font-medium text-text">
            {t("empresa")}
          </legend>
          <div className="flex gap-2 rounded-xl border border-border bg-surface-muted p-1">
            {empresas.map((e) => (
              <label
                key={e.id}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition has-checked:bg-brand has-checked:text-white hover:has-[:not(:checked)]:bg-surface"
              >
                <input
                  type="radio"
                  name="companyId"
                  value={e.id}
                  required
                  checked={companyId === e.id}
                  onChange={() => setCompanyId(e.id)}
                  className="sr-only"
                />
                {e.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : empresaFija ? (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-text">
            {t("empresa")}
          </span>
          <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-muted">
            {empresaFija.name}
          </p>
          <input type="hidden" name="companyId" value={empresaFija.id} readOnly />
          <p className="text-xs text-muted">{t("empresaDeCotizacion")}</p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="quoteId" className="block text-sm font-medium text-text">
          {t("cotizacion")}
        </label>
        {opciones.length === 0 ? (
          <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-muted">
            {t("sinCotizacionesActivas")}
          </p>
        ) : (
          // key={companyId}: al cambiar de empresa la lista de opciones
          // cambia, y sin esto un <select> no controlado se queda mostrando
          // la selección de la empresa anterior.
          <select
            key={companyId}
            id="quoteId"
            name="quoteId"
            required
            defaultValue=""
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-brand focus:outline-none"
          >
            <option value="" disabled>
              {t("elige")}
            </option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-muted">{t("ayuda")}</p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Crear />
        <Link
          href={cancelarHref}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
        >
          {t("cancelar")}
        </Link>
      </div>
    </form>
  );
}
