"use client";

import { useTransition } from "react";

import { esImagen, formatearTamano } from "@/lib/archivos";
import { formatearMonto } from "@/lib/moneda";
import type { ViaticoEnLista } from "@/lib/queries/viaticos";

function IconoArchivo({ mimeType }: { mimeType: string }) {
  const esPdf = mimeType === "application/pdf";

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-[10px] font-bold uppercase text-muted">
      {esPdf ? "PDF" : "DOC"}
    </div>
  );
}

function BotonBorrar({
  onBorrar,
  nombre,
}: {
  onBorrar: () => void | Promise<void>;
  nombre: string;
}) {
  const [pendiente, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={`Eliminar ${nombre}`}
      onClick={() => {
        if (!window.confirm(`¿Eliminar "${nombre}"?`)) return;
        startTransition(onBorrar);
      }}
      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-danger/40 hover:text-danger disabled:opacity-50"
    >
      {pendiente ? "…" : "Eliminar"}
    </button>
  );
}

export function ViaticoList({
  viaticos,
  onEliminar,
}: {
  viaticos: ViaticoEnLista[];
  onEliminar: (id: string) => void | Promise<void>;
}) {
  if (viaticos.length === 0) {
    return (
      <p className="text-sm text-muted">
        Todavía no hay viáticos en este reporte.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {viaticos.map((v) => (
        <li
          key={v.id}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
        >
          {esImagen(v.mimeType) && v.tieneMiniatura ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/viaticos/${v.id}?mini=1`}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <IconoArchivo mimeType={v.mimeType} />
          )}

          <div className="min-w-0 flex-1">
            <a
              href={`/api/viaticos/${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-text hover:text-brand hover:underline"
            >
              {v.fileName}
            </a>
            <p className="text-xs text-muted">
              {v.amount !== null
                ? formatearMonto(v.amount)
                : "Sin monto"}{" "}
              · {formatearTamano(v.sizeBytes)}
            </p>
          </div>

          <BotonBorrar nombre={v.fileName} onBorrar={() => onEliminar(v.id)} />
        </li>
      ))}
    </ul>
  );
}
