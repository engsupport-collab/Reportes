"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import type { ReporteState } from "@/actions/reports";
import { ETIQUETAS_TRABAJO, TIPOS_SERVICIO } from "@/lib/etiquetas";
import type { OpcionCliente } from "@/lib/queries/clients";
import type { Empresa } from "@/lib/queries/companies";
import { QuoteSelector, type OpcionCotizacionSelector } from "./quote-selector";

type Valores = {
  quoteId: string;
  workDate: string;
  serviceType: string;
  etiquetas: string[];
  details: string;
};

const CAMPO =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

function Guardar({ etiqueta }: { etiqueta: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("reportForm");

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? t("guardando") : etiqueta}
    </button>
  );
}

/**
 * Formulario compartido entre crear y editar.
 *
 * Es el mismo componente en las dos vistas: cambia la acción que recibe, no el
 * formulario. Mantener dos copias haría que un campo nuevo se agregara en una y
 * se olvidara en la otra.
 *
 * Proyecto, cliente, orden de compra y número de cotización YA NO se escriben
 * aquí — se eligen con `QuoteSelector` y el servidor los copia de la
 * cotización elegida. Es lo que evita que el mismo proyecto termine escrito de
 * tres formas distintas por distintos técnicos.
 */
export function ReportForm({
  action,
  valores,
  etiqueta,
  cancelarHref,
  empresas,
  companyIdFijo,
  cotizacionesPorEmpresa,
  clientesPorEmpresa,
}: {
  action: (estado: ReporteState, formData: FormData) => Promise<ReporteState>;
  valores?: Valores;
  etiqueta: string;
  cancelarHref: string;
  /**
   * Lista de empresas para el interruptor "para cuál empresa es esto".
   *
   * Se pasa solo al crear y solo para el admin: un empleado ya trabaja dentro
   * de una empresa elegida al iniciar sesión, así que para él este campo no
   * existe y el servidor la toma de la sesión. El admin no tiene esa empresa
   * de sesión —ve las dos siempre— así que tiene que decirlo aquí, una vez por
   * reporte que crea.
   */
  empresas?: Empresa[];
  /** Para un empleado, o al editar: la empresa ya fijada. */
  companyIdFijo?: string;
  /** Cotizaciones activas, por empresa, para el selector. */
  cotizacionesPorEmpresa: { companyId: string; opciones: OpcionCotizacionSelector[] }[];
  /** Clientes activos, por empresa, para la creación mínima desde campo. */
  clientesPorEmpresa: { companyId: string; opciones: OpcionCliente[] }[];
}) {
  const [state, formAction] = useActionState<ReporteState, FormData>(
    action,
    {},
  );
  const t = useTranslations("reportForm");
  // El catálogo de `lib/etiquetas.ts` guarda los nombres en español porque los
  // usa el PDF, que no pasa por next-intl. En pantalla se traducen por id.
  const tEtiquetas = useTranslations("etiquetas");

  // La empresa se sube a estado del componente (a diferencia del resto del
  // formulario, no controlado) porque el selector de cotización necesita
  // saber cuál está elegida para filtrar su propia lista.
  const [companyId, setCompanyId] = useState(
    companyIdFijo ?? empresas?.[0]?.id ?? "",
  );

  const opciones =
    cotizacionesPorEmpresa.find((e) => e.companyId === companyId)?.opciones ??
    [];
  const clientesActivos =
    clientesPorEmpresa.find((e) => e.companyId === companyId)?.opciones ?? [];

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Va primero: es la decisión que condiciona todo lo demás, incluida
            qué cotizaciones aparecen para elegir. */}
        {empresas ? (
          <fieldset className="space-y-2 sm:col-span-2">
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

        {/* `key`: al cambiar de empresa el selector tiene que arrancar de
            cero con la lista de la nueva empresa, no conservar en su estado
            interno una cotización que ya no le corresponde. */}
        <QuoteSelector
          key={companyId}
          companyId={companyId}
          opcionesIniciales={opciones}
          valorInicial={valores?.quoteId}
          clientesActivos={clientesActivos}
        />

        <div className="space-y-1.5">
          <label
            htmlFor="workDate"
            className="block text-sm font-medium text-text"
          >
            {t("fechaTrabajo")}
          </label>
          <input
            id="workDate"
            name="workDate"
            type="date"
            required
            defaultValue={valores?.workDate}
            className={CAMPO}
          />
        </div>

        {/* Tipo de servicio: excluyente, así que son radios y no casillas. La
            forma del control ya comunica que solo se puede elegir uno. */}
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="mb-2 block text-sm font-medium text-text">
            {t("tipoServicio")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {TIPOS_SERVICIO.map((tipo) => (
              <label
                key={tipo.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand"
              >
                <input
                  type="radio"
                  name="serviceType"
                  value={tipo.id}
                  required
                  defaultChecked={valores?.serviceType === tipo.id}
                  className="accent-brand"
                />
                {tEtiquetas(tipo.id)}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Etiquetas: se pueden marcar varias, por eso son casillas. */}
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="mb-2 block text-sm font-medium text-text">
            {t("etiquetasLegend")}{" "}
            <span className="font-normal text-muted">
              {t("etiquetasAyuda")}
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {ETIQUETAS_TRABAJO.map((etiqueta) => (
              <label
                key={etiqueta.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand"
              >
                <input
                  type="checkbox"
                  name="etiquetas"
                  value={etiqueta.id}
                  defaultChecked={valores?.etiquetas.includes(etiqueta.id)}
                  className="accent-brand"
                />
                {tEtiquetas(etiqueta.id)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="details"
            className="block text-sm font-medium text-text"
          >
            {t("detallesTrabajo")}{" "}
            <span className="font-normal text-muted">{t("opcional")}</span>
          </label>
          <textarea
            id="details"
            name="details"
            rows={6}
            maxLength={5000}
            defaultValue={valores?.details}
            className={`${CAMPO} resize-y`}
            placeholder={t("placeholderDetalles")}
          />
        </div>
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
        <Guardar etiqueta={etiqueta} />
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
