"use client";

import { useState, useTransition } from "react";

import type { Empresa } from "@/lib/queries/companies";

/**
 * Cambiador de empresa.
 *
 * Muestra siempre en qué empresa se está trabajando, no solo cuando se
 * despliega. Es el dato que determina todo lo que se ve en pantalla: si no
 * estuviera a la vista, alguien podría registrar un trabajo de Corp creyendo
 * que está en SaaS.
 *
 * Si el usuario pertenece a una sola empresa, se muestra como etiqueta fija: no
 * hay nada que elegir.
 */
export function CompanySwitcher({
  empresas,
  activa,
  onCambiar,
}: {
  empresas: Empresa[];
  activa: Empresa;
  onCambiar: (companyId: string) => void | Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();

  if (empresas.length <= 1) {
    return (
      <span className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand">
        {activa.name}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={pendiente}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand transition hover:brightness-95 disabled:opacity-60"
      >
        {pendiente ? "Cambiando…" : activa.name}
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={`h-3 w-3 transition ${abierto ? "rotate-180" : ""}`}
          fill="currentColor"
        >
          <path d="M6 8.5 1.5 4h9L6 8.5Z" />
        </svg>
      </button>

      {abierto ? (
        <>
          {/* Capa invisible: un clic fuera cierra el menú, sin necesidad de
              escuchar eventos en todo el documento. */}
          <button
            type="button"
            aria-label="Cerrar"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAbierto(false)}
          />

          <ul
            role="listbox"
            className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            {empresas.map((empresa) => {
              const esActiva = empresa.id === activa.id;

              return (
                <li key={empresa.id} role="option" aria-selected={esActiva}>
                  <button
                    type="button"
                    disabled={esActiva}
                    onClick={() => {
                      setAbierto(false);
                      startTransition(() => onCambiar(empresa.id));
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                      esActiva
                        ? "font-semibold text-brand"
                        : "text-text hover:bg-surface-muted"
                    }`}
                  >
                    {empresa.name}
                    {esActiva ? <span aria-hidden>✓</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
