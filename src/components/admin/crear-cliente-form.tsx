"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import { crearClienteAction, type ClienteState } from "@/actions/clients";
import { SelectorIdiomaDocumento } from "@/components/selector-idioma-documento";
import { idiomaDeEmpresa } from "@/lib/idioma-documento";
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
 * Alta de un cliente. Empresa, nombre y el idioma en que recibe sus reportes
 * — es lo mínimo que necesita existir en el catálogo para que deje de
 * escribirse a mano en cada cotización. El resto (activar, editar) se hace
 * desde la tabla.
 *
 * El idioma se propone según la empresa —LLC en inglés, SAS en español— y se
 * puede cambiar: un cliente de Estados Unidos atendido desde la SAS recibe sus
 * reportes en inglés.
 */
export function CrearClienteForm({ empresas }: { empresas: Empresa[] }) {
  const t = useTranslations("clientes");
  const [state, formAction] = useActionState<ClienteState, FormData>(
    crearClienteAction,
    {},
  );
  // La empresa elegida se copia al estado solo para saber qué idioma proponer:
  // al cambiarla, el selector de idioma vuelve a su valor de partida. Los
  // botones siguen sin controlar, como el resto del formulario.
  const primera = empresas[0]?.id ?? "";
  const [empresa, setEmpresa] = useState(primera);

  return (
    <form
      action={formAction}
      // Tras enviar, React devuelve el formulario a sus valores iniciales, y
      // la empresa marcada vuelve a ser la primera. Si el estado no volviera
      // con ella, quedaría marcada una empresa y propuesto el idioma de otra.
      onReset={() => setEmpresa(primera)}
      className="space-y-4 rounded-2xl border border-border bg-surface p-5"
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-text">
          {t("empresa")}
        </legend>
        <div className="flex gap-2">
          {empresas.map((e) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand"
            >
              <input
                type="radio"
                name="companyId"
                value={e.id}
                required
                defaultChecked={e.id === primera}
                onChange={() => setEmpresa(e.id)}
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

      <SelectorIdiomaDocumento
        key={empresa}
        titulo={t("idiomaReportes")}
        ayuda={t("idiomaReportesAyuda")}
        porDefecto={idiomaDeEmpresa(empresa)}
      />

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
