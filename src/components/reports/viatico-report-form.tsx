"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import type { ReporteState } from "@/actions/reports";
import type { Empresa } from "@/lib/queries/companies";

export type OpcionReporteEnlazable = { id: string; label: string };

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
 * A diferencia del de servicio, no pide proyecto ni cliente: solo a qué
 * reporte de servicio pertenece el gasto. El resto se copia de ese reporte al
 * crearse. Los gastos en sí (concepto, monto, fecha, foto) se agregan después,
 * uno por uno, desde el detalle — igual que hoy se agregan los adjuntos.
 */
export function ViaticoReportForm({
  action,
  cancelarHref,
  empresas,
  reportesPorEmpresa,
}: {
  action: (estado: ReporteState, formData: FormData) => Promise<ReporteState>;
  cancelarHref: string;
  /** Solo para el admin: elige antes para cuál empresa es este reporte. */
  empresas?: Empresa[];
  /** Reportes de servicio disponibles para enlazar, por empresa. */
  reportesPorEmpresa: { companyId: string; opciones: OpcionReporteEnlazable[] }[];
}) {
  const [state, formAction] = useActionState<ReporteState, FormData>(
    action,
    {},
  );
  const t = useTranslations("viaticoReportForm");
  const [companyId, setCompanyId] = useState(
    reportesPorEmpresa[0]?.companyId ?? "",
  );

  const opciones =
    reportesPorEmpresa.find((e) => e.companyId === companyId)?.opciones ?? [];

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
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="linkedReportId"
          className="block text-sm font-medium text-text"
        >
          {t("reporteEnlazado")}
        </label>
        {opciones.length === 0 ? (
          <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-muted">
            {t("sinReportesParaEnlazar")}
          </p>
        ) : (
          <select
            id="linkedReportId"
            name="linkedReportId"
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
