"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import { crearClienteAction, type ClienteState } from "@/actions/clients";
import { Modal } from "@/components/modal";

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
 * Alta de un cliente sin salir del formulario de cotización: se abre desde
 * la opción "+ Crear nuevo cliente" del selector (ver `QuoteForm`), crea con
 * la misma acción que usa `/admin/clientes`, y al terminar avisa al padre
 * (`onCreado`) para que lo deje elegido — el formulario de la cotización no
 * se toca ni se recarga.
 */
export function CrearClienteModal({
  abierto,
  companyId,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  companyId: string;
  onCerrar: () => void;
  onCreado: (cliente: { id: string; name: string }) => void;
}) {
  const t = useTranslations("clientes");
  const [state, formAction] = useActionState<ClienteState, FormData>(
    crearClienteAction,
    {},
  );

  useEffect(() => {
    if (state.creado) onCreado(state.creado);
    // onCreado se recrea en cada render del padre; solo debe dispararse
    // cuando de verdad llega un cliente nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.creado]);

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={t("nuevoCliente")}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="companyId" value={companyId} />

        <div className="space-y-1.5">
          <label
            htmlFor="modal-cliente-nombre"
            className="block text-sm font-medium text-text"
          >
            {t("nombreCliente")}
          </label>
          <input
            id="modal-cliente-nombre"
            name="name"
            required
            autoFocus
            maxLength={200}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
            placeholder={t("placeholderNombre")}
          />
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <BotonCrear />
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:text-text"
          >
            {t("cancelar")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
