"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import { crearClienteAction, type ClienteState } from "@/actions/clients";
import type { Empresa } from "@/lib/queries/companies";

function BotonCrear() {
  const { pending } = useFormStatus();
  const t = useTranslations("clientes");
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? t("creando") : t("crearCliente")}
    </button>
  );
}

/**
 * Alta de un cliente. Solo empresa y nombre — es lo mínimo que necesita
 * existir en el catálogo para que deje de escribirse a mano en cada
 * cotización. El resto (activar, editar el nombre) se hace desde la tabla.
 */
export function CrearClienteForm({ empresas }: { empresas: Empresa[] }) {
  const t = useTranslations("clientes");
  const [state, formAction] = useActionState<ClienteState, FormData>(
    crearClienteAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-border bg-surface p-5"
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-text">
          {t("empresa")}
        </legend>
        <div className="flex gap-2">
          {empresas.map((e, i) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand"
            >
              <input
                type="radio"
                name="companyId"
                value={e.id}
                required
                defaultChecked={i === 0}
                className="accent-brand"
              />
              {e.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium text-text">
          {t("nombreCliente")}
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={200}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          placeholder={t("placeholderNombre")}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <BotonCrear />
    </form>
  );
}
