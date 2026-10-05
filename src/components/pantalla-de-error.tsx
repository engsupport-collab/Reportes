"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

/**
 * Lo que se ve cuando una pantalla falla de forma inesperada.
 *
 * Sin esto, Next muestra la suya: una página en blanco, en inglés, que dice
 * "This page couldn't load" y no explica ni ofrece nada. Así la vio el
 * cliente al subir fotos desde el teléfono.
 *
 * Dice lo que más le importa a quien está en campo —lo guardado no se
 * perdió— y deja reintentar sin salir de donde estaba. El código (`digest`)
 * solo aparece cuando el fallo vino del servidor: es lo que permite encontrar
 * ese error concreto en los registros.
 */
export function PantallaDeError({
  error,
  alReintentar,
  pantallaCompleta = false,
}: {
  error: Error & { digest?: string };
  alReintentar: () => void;
  /** Fuera del marco de la aplicación (ingreso, selección de empresa). */
  pantallaCompleta?: boolean;
}) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    // Queda en la consola del navegador, que es donde se puede pedir una
    // captura a quien lo reporta.
    console.error(error);
  }, [error]);

  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-6 px-6 text-center ${
        pantallaCompleta ? "min-h-svh bg-bg" : "min-h-[60svh]"
      }`}
    >
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-text">{t("titulo")}</h1>
        <p className="max-w-sm text-sm text-muted">{t("texto")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={alReintentar}
          className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-strong"
        >
          {t("reintentar")}
        </button>
        {/* Un enlace normal y no <Link>: si lo que falló fue la navegación del
            lado del cliente, hace falta una carga completa para salir. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="rounded-xl border border-border px-5 py-3 text-sm font-medium text-text transition hover:bg-surface-muted"
        >
          {t("inicio")}
        </a>
      </div>

      {error.digest ? (
        <p className="font-mono text-xs text-muted">
          {t("codigo", { codigo: error.digest })}
        </p>
      ) : null}
    </div>
  );
}
