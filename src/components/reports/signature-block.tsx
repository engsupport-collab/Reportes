"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import type { FirmaState } from "@/actions/signature";
import { SignaturePad } from "./signature-pad";

function BotonBorrarFirma({ onBorrar }: { onBorrar: () => void | Promise<void> }) {
  const [pendiente, startTransition] = useTransition();
  const t = useTranslations("firma");

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        if (!window.confirm(t("confirmBorrar"))) {
          return;
        }
        startTransition(onBorrar);
      }}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-danger/40 hover:text-danger disabled:opacity-50"
    >
      {pendiente ? t("borrando") : t("volverAFirmar")}
    </button>
  );
}

/**
 * Bloque de firma del reporte.
 *
 * Si ya está firmado muestra la imagen, quién firmó y cuándo. Si no, muestra el
 * pad para firmar. Nunca los dos a la vez: tener el pad visible bajo una firma
 * ya hecha invita a firmar dos veces sin querer.
 */
export function SignatureBlock({
  firmaUrl,
  firmanteNombre,
  firmadoEl,
  nombrePorDefecto,
  onFirmar,
  onBorrar,
  soloLectura = false,
}: {
  firmaUrl: string | null;
  firmanteNombre: string | null;
  firmadoEl: string | null;
  nombrePorDefecto: string;
  onFirmar: (estado: FirmaState, formData: FormData) => Promise<FirmaState>;
  onBorrar: () => void | Promise<void>;
  /**
   * El reporte está terminado: se ve la firma, pero ni se reemplaza ni se
   * borra. Nunca se muestra el pad en este modo, ni siquiera si por algún
   * motivo no hubiera firma todavía — un reporte terminado sin firma no
   * debería poder existir (`finalizarReporteAction` la exige), pero esta
   * pantalla no depende de esa garantía para quedarse de solo lectura.
   */
  soloLectura?: boolean;
}) {
  const t = useTranslations("firma");

  if (firmaUrl) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text">{firmanteNombre}</p>
            <p className="text-xs text-muted">{t("firmadoEl", { fecha: firmadoEl ?? "" })}</p>
          </div>
          {soloLectura ? null : <BotonBorrarFirma onBorrar={onBorrar} />}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- la ruta es
            autenticada y el optimizador de Next no puede leerla. */}
        <img
          src={firmaUrl}
          alt={t("firmaDe", { nombre: firmanteNombre ?? t("elResponsable") })}
          className="h-40 w-full rounded-xl border border-border bg-white object-contain"
        />
      </div>
    );
  }

  if (soloLectura) {
    return <p className="text-sm italic text-muted">{t("sinFirmarBloqueado")}</p>;
  }

  return (
    <SignaturePad action={onFirmar} nombrePorDefecto={nombrePorDefecto} />
  );
}
