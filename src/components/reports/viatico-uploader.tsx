"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { ViaticoState } from "@/actions/viaticos";
import { EXTENSIONES_PERMITIDAS, validarArchivo } from "@/lib/archivos";
import { prepararArchivo } from "@/lib/imagen-cliente";
import { aValorInput } from "@/lib/fechas";
import type { Moneda } from "@/lib/moneda";

/**
 * Agregar un gasto: concepto, monto y fecha propios, más su foto de respaldo.
 *
 * A diferencia de los adjuntos, aquí no se suben varios archivos a la vez: cada
 * gasto es individual, y sus datos solo tienen sentido pegados a su propia
 * foto — mezclarlos en una subida por lotes obligaría a inventar una forma de
 * decir "este monto es del tercer archivo".
 */
export function ViaticoUploader({
  action,
  moneda,
}: {
  action: (estado: ViaticoState, formData: FormData) => Promise<ViaticoState>;
  /** La de la empresa del reporte: LLC cobra en dólares y SAS en pesos. */
  moneda: Moneda;
}) {
  const [estado, setEstado] = useState<ViaticoState>({});
  const [procesando, setProcesando] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [archivo, setArchivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("viaticosForm");

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
      setEstado({ error: t("seleccionaFoto") });
      return;
    }

    const campo = (nombre: string) =>
      (formRef.current?.elements.namedItem(nombre) as HTMLInputElement | null)
        ?.value ?? "";

    setProcesando(true);
    const formData = new FormData();

    try {
      const { archivo: preparado, miniatura } =
        await prepararArchivo(archivo);
      formData.append("archivo", preparado);
      if (miniatura) formData.append("miniatura", miniatura);
      formData.append("concepto", campo("concepto"));
      formData.append("fechaGasto", campo("fechaGasto"));
      formData.append("amount", campo("amount"));
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="viatico-concepto"
            className="block text-sm font-medium text-text"
          >
            {t("concepto")}
          </label>
          <input
            id="viatico-concepto"
            name="concepto"
            required
            maxLength={200}
            disabled={ocupado}
            placeholder={t("placeholderConcepto")}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="viatico-fecha"
            className="block text-sm font-medium text-text"
          >
            {t("fechaGasto")}
          </label>
          <input
            id="viatico-fecha"
            name="fechaGasto"
            type="date"
            required
            defaultValue={aValorInput(new Date())}
            disabled={ocupado}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label
            htmlFor="viatico-archivo"
            className="block text-sm font-medium text-text"
          >
            {t("fotoArchivoGasto")}
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
            {t("monto")}
          </label>
          <input
            id="viatico-monto"
            name="amount"
            type="number"
            required
            min="0"
            step="1"
            inputMode="numeric"
            disabled={ocupado}
            placeholder={moneda}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={ocupado || !archivo}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {procesando ? t("preparando") : pendiente ? t("agregando") : t("agregar")}
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
