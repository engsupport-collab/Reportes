"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { AdjuntoState } from "@/actions/attachments";
import {
  EXTENSIONES_PERMITIDAS,
  MAX_ARCHIVOS_POR_REPORTE,
  formatearTamano,
  validarArchivo,
} from "@/lib/archivos";
import { prepararArchivo } from "@/lib/imagen-cliente";

/**
 * Selector y subida de archivos.
 *
 * Antes de enviar, las imágenes se reducen en el navegador. Eso hace que la
 * subida desde el celular sea rápida y que la lista no tenga que descargar
 * después fotos de varios megabytes.
 */
export function AttachmentUploader({
  action,
  restantes,
}: {
  action: (estado: AdjuntoState, formData: FormData) => Promise<AdjuntoState>;
  restantes: number;
}) {
  const [estado, setEstado] = useState<AdjuntoState>({});
  const [procesando, setProcesando] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("adjuntos");

  const ocupado = procesando || pendiente;

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    if (elegidos.length === 0) return;

    setEstado({});

    if (elegidos.length > restantes) {
      setEstado({
        error: t("limiteArchivos", { restantes }),
      });
      e.target.value = "";
      return;
    }

    // Se valida antes de procesar nada: si un archivo no sirve, el usuario se
    // entera de inmediato y no después de esperar una subida.
    for (const archivo of elegidos) {
      const v = validarArchivo(archivo);
      if (!v.ok) {
        setEstado({ error: v.error });
        e.target.value = "";
        return;
      }
    }

    setProcesando(true);
    const formData = new FormData();

    try {
      for (const original of elegidos) {
        const { archivo, miniatura } = await prepararArchivo(original);
        formData.append("archivos", archivo);
        // Se añade siempre una entrada para que los índices de archivos y
        // miniaturas coincidan en el servidor.
        formData.append("miniaturas", miniatura ?? new Blob([]));
      }
    } finally {
      setProcesando(false);
    }

    e.target.value = "";

    startTransition(async () => {
      setEstado(await action({}, formData));
    });
  }

  if (restantes <= 0) {
    return (
      <p className="text-sm text-muted">
        {t("maximoArchivos", { max: MAX_ARCHIVOS_POR_REPORTE })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={EXTENSIONES_PERMITIDAS.join(",")}
        onChange={alElegir}
        disabled={ocupado}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        className="w-full rounded-xl border border-dashed border-border px-4 py-6 text-center transition hover:border-brand hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="block text-sm font-medium text-text">
          {procesando
            ? t("preparando")
            : pendiente
              ? t("subiendo")
              : t("elegirArchivos")}
        </span>
        <span className="mt-1 block text-xs text-muted">
          {t("ayudaArchivos", {
            tamano: formatearTamano(4 * 1024 * 1024),
            restantes,
          })}
        </span>
      </button>

      {estado.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {estado.error}
        </p>
      ) : null}

      {estado.ok ? (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
          {estado.ok}
        </p>
      ) : null}
    </div>
  );
}
