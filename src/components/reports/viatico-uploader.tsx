"use client";

import { useRef, useState, useTransition } from "react";

import type { ViaticoState } from "@/actions/viaticos";
import { EXTENSIONES_PERMITIDAS, validarArchivo } from "@/lib/archivos";
import { prepararArchivo } from "@/lib/imagen-cliente";

/**
 * Agregar un viático: una foto (o documento) más un monto opcional.
 *
 * A diferencia de los adjuntos, aquí no se suben varios archivos a la vez: cada
 * viático es un gasto individual, y el monto solo tiene sentido pegado a su
 * propia foto — mezclarlos en una subida por lotes obligaría a inventar una
 * forma de decir "este monto es del tercer archivo".
 */
export function ViaticoUploader({
  action,
}: {
  action: (estado: ViaticoState, formData: FormData) => Promise<ViaticoState>;
}) {
  const [estado, setEstado] = useState<ViaticoState>({});
  const [procesando, setProcesando] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [archivo, setArchivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const ocupado = procesando || pendiente;

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0] ?? null;
    setEstado({});

    if (elegido) {
      const v = validarArchivo(elegido);
      if (!v.ok) {
        setEstado({ error: v.error });
        e.target.value = "";
        setArchivo(null);
        return;
      }
    }

    setArchivo(elegido);
  }

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!archivo) {
      setEstado({ error: "Selecciona una foto o archivo del gasto." });
      return;
    }

    const montoInput = formRef.current?.elements.namedItem(
      "amount",
    ) as HTMLInputElement | null;

    setProcesando(true);
    const formData = new FormData();

    try {
      const { archivo: preparado, miniatura } =
        await prepararArchivo(archivo);
      formData.append("archivo", preparado);
      if (miniatura) formData.append("miniatura", miniatura);
      if (montoInput?.value) formData.append("amount", montoInput.value);
    } finally {
      setProcesando(false);
    }

    startTransition(async () => {
      const resultado = await action({}, formData);
      setEstado(resultado);
      if (!resultado.error) {
        setArchivo(null);
        if (inputRef.current) inputRef.current.value = "";
        formRef.current?.reset();
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={alEnviar}
      className="space-y-3 rounded-xl border border-dashed border-border p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label
            htmlFor="viatico-archivo"
            className="block text-sm font-medium text-text"
          >
            Foto o archivo del gasto
          </label>
          <input
            ref={inputRef}
            id="viatico-archivo"
            type="file"
            accept={EXTENSIONES_PERMITIDAS.join(",")}
            onChange={alElegir}
            disabled={ocupado}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-text"
          />
        </div>

        <div className="w-32 space-y-1.5">
          <label
            htmlFor="viatico-monto"
            className="block text-sm font-medium text-text"
          >
            Monto{" "}
            <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="viatico-monto"
            name="amount"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            disabled={ocupado}
            placeholder="COP"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={ocupado || !archivo}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {procesando ? "Preparando…" : pendiente ? "Agregando…" : "Agregar"}
        </button>
      </div>

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
    </form>
  );
}
