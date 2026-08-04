"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { esImagen, formatearTamano } from "@/lib/archivos";
import type { AdjuntoEnLista } from "@/lib/queries/attachments";

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
  const t = useTranslations("adjuntos");

  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={t("eliminarAria", { nombre })}
      onClick={() => {
        if (!window.confirm(t("confirmEliminar", { nombre }))) return;
        startTransition(onBorrar);
      }}
      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-danger/40 hover:text-danger disabled:opacity-50"
    >
      {pendiente ? "…" : t("eliminar")}
    </button>
  );
}

export function AttachmentList({
  adjuntos,
  onEliminar,
}: {
  adjuntos: AdjuntoEnLista[];
  onEliminar: (id: string) => void | Promise<void>;
}) {
  const t = useTranslations("adjuntos");

  if (adjuntos.length === 0) {
    return (
      <p className="text-sm text-muted">
        {t("sinArchivos")}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {adjuntos.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
        >
          {/* Se pide la miniatura, no el original: la lista no tiene por qué
              descargar una foto de varios megabytes para mostrarla en 48 px. */}
          {esImagen(a.mimeType) && a.tieneMiniatura ? (
            /* Se usa <img> y no <Image />: la miniatura ya viene reducida y
               optimizada desde el navegador, y la ruta es autenticada, así que
               el optimizador de Next no puede leerla. Pasarla por él sería
               pagar dos veces por un trabajo que ya está hecho. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/archivos/${a.id}?mini=1`}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <IconoArchivo mimeType={a.mimeType} />
          )}

          <div className="min-w-0 flex-1">
            <a
              href={`/api/archivos/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-text hover:text-brand hover:underline"
            >
              {a.fileName}
            </a>
            <p className="text-xs text-muted">{formatearTamano(a.sizeBytes)}</p>
          </div>

          <BotonBorrar
            nombre={a.fileName}
            onBorrar={() => onEliminar(a.id)}
          />
        </li>
      ))}
    </ul>
  );
}
