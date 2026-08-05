"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import type { CotizacionState } from "@/actions/quotes";
import { ESTADOS_COTIZACION } from "@/lib/cotizaciones";
import type { Moneda } from "@/lib/moneda";
import type { OpcionCliente } from "@/lib/queries/clients";
import type { Empresa } from "@/lib/queries/companies";

type Valores = {
  quoteNumber: string;
  projectName: string;
  clientId: string;
  purchaseOrderNo: string;
  dueDate: string;
  description: string;
  amount: string;
};

const CAMPO =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

function Guardar({ etiqueta }: { etiqueta: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("cotizacionForm");

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
 * Formulario compartido entre crear y editar una cotización, igual que
 * `ReportForm` con reportes.
 *
 * La empresa solo se pide al crear: una vez la cotización existe, moverla de
 * empresa cambiaría a quién puede verla, así que no es un campo editable.
 */
export function QuoteForm({
  action,
  valores,
  etiqueta,
  cancelarHref,
  empresas,
  empresaFija,
  companyIdFijo,
  monedaFija,
  numeroSugerido,
  clientesPorEmpresa,
}: {
  action: (estado: CotizacionState, formData: FormData) => Promise<CotizacionState>;
  valores?: Valores;
  etiqueta: string;
  cancelarHref: string;
  /** Solo al crear: el admin elige explícitamente para cuál de las dos es. */
  empresas?: Empresa[];
  /** Solo al editar: la empresa ya fijada, de solo lectura. */
  empresaFija?: string;
  /** Solo al editar: el id real de esa empresa fija, para buscar sus clientes. */
  companyIdFijo?: string;
  /** Solo al editar: la moneda de esa empresa fija. */
  monedaFija?: Moneda;
  /**
   * Solo al crear: el siguiente número calculado para mostrarlo ya escrito.
   * No es la asignación real — es una sugerencia; ver crearCotizacionAction,
   * que decide si usarla o generar el número de verdad al guardar.
   */
  numeroSugerido?: string;
  /** Clientes activos de cada empresa candidata, para el selector. */
  clientesPorEmpresa: { companyId: string; opciones: OpcionCliente[] }[];
}) {
  const [state, formAction] = useActionState<CotizacionState, FormData>(
    action,
    {},
  );
  const t = useTranslations("cotizacionForm");
  const tEstados = useTranslations("estadosCotizacion");

  // La empresa se sube a estado (a diferencia del resto del formulario, no
  // controlado): además de la moneda, determina qué clientes se pueden
  // elegir — cambiar de empresa debe refrescar esa lista, no dejarla pegada
  // a la anterior.
  const [companyId, setCompanyId] = useState(
    companyIdFijo ?? empresas?.[0]?.id ?? "",
  );
  const moneda =
    monedaFija ?? empresas?.find((e) => e.id === companyId)?.currency ?? "COP";
  const clientesDisponibles =
    clientesPorEmpresa.find((e) => e.companyId === companyId)?.opciones ?? [];

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
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
        ) : empresaFija ? (
          <div className="space-y-1.5 sm:col-span-2">
            <span className="block text-sm font-medium text-text">
              {t("empresa")}
            </span>
            <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-muted">
              {empresaFija}
            </p>
          </div>
        ) : null}

        {/* Solo al crear. Al editar, el estado se cambia desde el detalle,
            que es donde se ve junto a los reportes que ya cuelgan de ella. */}
        {empresas ? (
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="status" className="block text-sm font-medium text-text">
              {t("estado")}
            </label>
            <select
              id="status"
              name="status"
              defaultValue="en_curso"
              className={CAMPO}
            >
              {ESTADOS_COTIZACION.map((estado) => (
                <option key={estado} value={estado}>
                  {tEstados(estado)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">{t("estadoAyuda")}</p>
          </div>
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="projectName"
            className="block text-sm font-medium text-text"
          >
            {t("projectName")}
          </label>
          <input
            id="projectName"
            name="projectName"
            required
            maxLength={200}
            defaultValue={valores?.projectName}
            className={CAMPO}
            placeholder={t("placeholderProjectName")}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="clientId" className="block text-sm font-medium text-text">
            {t("clientName")}
          </label>
          {clientesDisponibles.length > 0 ? (
            // key={companyId}: sin esto, un <select> no controlado no se
            // entera de que cambiaron sus opciones al cambiar de empresa y se
            // queda mostrando la selección vieja — mismo fix que ya usa
            // QuoteSelector en el formulario de reporte.
            <select
              key={companyId}
              id="clientId"
              name="clientId"
              required
              defaultValue={valores?.clientId}
              className={CAMPO}
            >
              <option value="" disabled>
                {t("eligeCliente")}
              </option>
              {clientesDisponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-muted">
              {t("sinClientesActivos")}{" "}
              <Link
                href="/admin/clientes"
                className="font-medium text-brand hover:underline"
              >
                {t("irAClientes")}
              </Link>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="quoteNumber"
            className="block text-sm font-medium text-text"
          >
            {t("quoteNumber")}{" "}
            <span className="font-normal text-muted">{t("opcional")}</span>
          </label>
          <input
            id="quoteNumber"
            name="quoteNumber"
            maxLength={60}
            defaultValue={valores?.quoteNumber ?? numeroSugerido}
            className={CAMPO}
            placeholder={t("placeholderQuoteNumber")}
          />
          {/* Compara contra esto al guardar: si el admin no tocó el campo,
              el valor sigue siendo idéntico a esta sugerencia, y el servidor
              la descarta para generar el número de verdad de forma atómica
              en vez de confiar en un valor que pudo quedar obsoleto. */}
          {numeroSugerido ? (
            <input type="hidden" name="quoteNumberSugerido" value={numeroSugerido} />
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="purchaseOrderNo"
            className="block text-sm font-medium text-text"
          >
            {t("purchaseOrderNo")}{" "}
            <span className="font-normal text-muted">{t("opcional")}</span>
          </label>
          <input
            id="purchaseOrderNo"
            name="purchaseOrderNo"
            maxLength={60}
            defaultValue={valores?.purchaseOrderNo}
            className={CAMPO}
            placeholder={t("placeholderOC")}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="dueDate" className="block text-sm font-medium text-text">
            {t("dueDate")}{" "}
            <span className="font-normal text-muted">{t("opcional")}</span>
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={valores?.dueDate}
            className={CAMPO}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="amount" className="block text-sm font-medium text-text">
            {t("amount")}{" "}
            <span className="font-normal text-muted">{t("opcional")}</span>
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={valores?.amount}
            placeholder={moneda}
            className={CAMPO}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="description"
            className="block text-sm font-medium text-text"
          >
            {t("description")}{" "}
            <span className="font-normal text-muted">{t("opcional")}</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            maxLength={2000}
            defaultValue={valores?.description}
            className={`${CAMPO} resize-y`}
            placeholder={t("placeholderDescription")}
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
