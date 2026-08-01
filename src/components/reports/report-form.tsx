"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ReporteState } from "@/actions/reports";
import { ETIQUETAS_TRABAJO, TIPOS_SERVICIO } from "@/lib/etiquetas";
import type { Empresa } from "@/lib/queries/companies";

type Valores = {
  projectName: string;
  purchaseOrderNo: string;
  clientName: string;
  workDate: string;
  serviceType: string;
  etiquetas: string[];
  details: string;
};

const CAMPO =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

function Guardar({ etiqueta }: { etiqueta: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Guardando…" : etiqueta}
    </button>
  );
}

/**
 * Formulario compartido entre crear y editar.
 *
 * Es el mismo componente en las dos vistas: cambia la acción que recibe, no el
 * formulario. Mantener dos copias haría que un campo nuevo se agregara en una y
 * se olvidara en la otra.
 */
export function ReportForm({
  action,
  valores,
  etiqueta,
  cancelarHref,
  empresas,
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
}) {
  const [state, formAction] = useActionState<ReporteState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Va primero: es la decisión que condiciona todo lo demás, y conviene
            tomarla antes de llenar el resto del formulario, no al final. */}
        {empresas ? (
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="mb-2 block text-sm font-medium text-text">
              Empresa
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
                    className="sr-only"
                  />
                  {e.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="projectName"
            className="block text-sm font-medium text-text"
          >
            Nombre del proyecto
          </label>
          <input
            id="projectName"
            name="projectName"
            required
            maxLength={200}
            defaultValue={valores?.projectName}
            className={CAMPO}
            placeholder="Mantenimiento planta norte"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="purchaseOrderNo"
            className="block text-sm font-medium text-text"
          >
            No. orden de compra
          </label>
          <input
            id="purchaseOrderNo"
            name="purchaseOrderNo"
            required
            maxLength={60}
            defaultValue={valores?.purchaseOrderNo}
            className={CAMPO}
            placeholder="OC-2026-0148"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="clientName"
            className="block text-sm font-medium text-text"
          >
            Cliente
          </label>
          <input
            id="clientName"
            name="clientName"
            required
            maxLength={200}
            defaultValue={valores?.clientName}
            className={CAMPO}
            placeholder="Industrias del Valle S.A."
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="workDate"
            className="block text-sm font-medium text-text"
          >
            Fecha del trabajo
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
            Tipo de servicio
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
                {tipo.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Etiquetas: se pueden marcar varias, por eso son casillas. */}
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="mb-2 block text-sm font-medium text-text">
            Etiquetas{" "}
            <span className="font-normal text-muted">
              — marca todas las que apliquen
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
                {etiqueta.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="details"
            className="block text-sm font-medium text-text"
          >
            Detalles del trabajo
          </label>
          <textarea
            id="details"
            name="details"
            required
            rows={6}
            maxLength={5000}
            defaultValue={valores?.details}
            className={`${CAMPO} resize-y`}
            placeholder="Describe qué se hizo, materiales usados, observaciones…"
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
          Cancelar
        </Link>
      </div>
    </form>
  );
}
