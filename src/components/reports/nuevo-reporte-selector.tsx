"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ReporteState } from "@/actions/reports";
import type { OpcionCliente } from "@/lib/queries/clients";
import type { Empresa } from "@/lib/queries/companies";
import { ReportForm } from "./report-form";
import type { OpcionCotizacionSelector } from "./quote-selector";
import { ViaticoReportForm } from "./viatico-report-form";

type Tipo = "servicio" | "viaticos";

/**
 * Antes de mostrar cualquier campo, se elige qué se está creando.
 *
 * Un reporte de servicio y uno de viáticos no comparten casi ningún campo —
 * el segundo ni siquiera tiene proyecto o cliente propios—, así que mostrar
 * los dos formularios fusionados obligaría a explicar por qué la mitad de los
 * campos desaparecen según lo que se marque. Separados, cada uno solo pide lo
 * que le corresponde.
 */
export function NuevoReporteSelector({
  accionServicio,
  accionViatico,
  cancelarHref,
  empresas,
  companyIdFijo,
  valoresServicio,
  cotizacionesPorEmpresa,
  clientesPorEmpresa,
}: {
  accionServicio: (estado: ReporteState, formData: FormData) => Promise<ReporteState>;
  accionViatico: (estado: ReporteState, formData: FormData) => Promise<ReporteState>;
  cancelarHref: string;
  empresas?: Empresa[];
  /** Para un empleado: su empresa activa, ya fija. */
  companyIdFijo?: string;
  valoresServicio: {
    quoteId: string;
    workDate: string;
    serviceType: string;
    etiquetas: string[];
    details: string;
  };
  /** Cotizaciones activas por empresa — las usan los dos tipos de reporte. */
  cotizacionesPorEmpresa: { companyId: string; opciones: OpcionCotizacionSelector[] }[];
  /** Solo para el tipo servicio: la creación mínima desde campo los necesita. */
  clientesPorEmpresa: { companyId: string; opciones: OpcionCliente[] }[];
}) {
  const [tipo, setTipo] = useState<Tipo>("servicio");
  const t = useTranslations("nuevoReportePage");

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 block text-sm font-medium text-text">
          {t("tipoDeReporte")}
        </legend>
        <div className="flex gap-2 rounded-xl border border-border bg-surface-muted p-1">
          {(
            [
              ["servicio", t("tipoServicio")],
              ["viaticos", t("tipoViaticos")],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTipo(id)}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                tipo === id
                  ? "bg-brand text-white"
                  : "text-muted hover:bg-surface"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        {tipo === "servicio" ? (
          <ReportForm
            action={accionServicio}
            etiqueta={t("crear")}
            cancelarHref={cancelarHref}
            empresas={empresas}
            companyIdFijo={companyIdFijo}
            valores={valoresServicio}
            cotizacionesPorEmpresa={cotizacionesPorEmpresa}
            clientesPorEmpresa={clientesPorEmpresa}
          />
        ) : (
          <ViaticoReportForm
            action={accionViatico}
            cancelarHref={cancelarHref}
            empresas={empresas}
            companyIdFijo={companyIdFijo}
            cotizacionesPorEmpresa={cotizacionesPorEmpresa}
          />
        )}
      </div>
    </div>
  );
}
