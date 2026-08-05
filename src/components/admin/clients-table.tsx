"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  actualizarClienteAction,
  alternarActivoClienteAction,
  type ClienteState,
} from "@/actions/clients";
import type { ClienteConEmpresa } from "@/lib/queries/clients";

function BotonActivo({ cliente }: { cliente: ClienteConEmpresa }) {
  const [pendiente, startTransition] = useTransition();
  const t = useTranslations("clientes");

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        const mensaje = cliente.isActive
          ? t("confirmDesactivar", { nombre: cliente.name })
          : t("confirmReactivar", { nombre: cliente.name });
        if (!window.confirm(mensaje)) return;
        startTransition(() => alternarActivoClienteAction(cliente.id));
      }}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        cliente.isActive
          ? "border-border text-muted hover:border-danger/40 hover:text-danger"
          : "border-success/40 text-success hover:bg-success/10"
      }`}
    >
      {pendiente ? "…" : cliente.isActive ? t("desactivar") : t("reactivar")}
    </button>
  );
}

function EditarCliente({
  cliente,
  onCancelar,
}: {
  cliente: ClienteConEmpresa;
  onCancelar: () => void;
}) {
  const t = useTranslations("clientes");
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function guardar(formData: FormData) {
    startTransition(async () => {
      const r: ClienteState = await actualizarClienteAction(
        cliente.id,
        {},
        formData,
      );
      if (r.error) setError(r.error);
      else onCancelar();
    });
  }

  return (
    <form action={guardar} className="mt-3 flex flex-wrap items-center gap-2">
      <input
        name="name"
        defaultValue={cliente.name}
        maxLength={200}
        required
        disabled={pendiente}
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-brand focus:outline-none"
      />
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendiente ? "…" : t("guardar")}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        className="text-xs font-medium text-muted transition hover:text-text"
      >
        {t("cancelar")}
      </button>
      {error ? (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function ClientsTable({ clientes }: { clientes: ClienteConEmpresa[] }) {
  const t = useTranslations("clientes");
  const [editando, setEditando] = useState<string | null>(null);

  if (clientes.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        {t("sinClientes")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {clientes.map((c) => (
        <div
          key={c.id}
          className={`rounded-2xl border p-4 ${
            c.isActive ? "border-border bg-surface" : "border-border bg-surface-muted opacity-70"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text">{c.name}</p>
              <p className="text-xs text-muted">
                {c.companyName}
                {!c.isActive ? ` · ${t("desactivado")}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEditando(editando === c.id ? null : c.id)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-muted hover:text-text"
              >
                {t("editar")}
              </button>
              <BotonActivo cliente={c} />
            </div>
          </div>

          {editando === c.id ? (
            <EditarCliente cliente={c} onCancelar={() => setEditando(null)} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
