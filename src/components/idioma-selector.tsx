"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { cambiarIdiomaAction } from "@/actions/idioma";
import { IconIdioma } from "@/components/nav-icons";
import { CODIGOS_IDIOMA, IDIOMAS, type Idioma } from "@/lib/idiomas";

/**
 * Selector de idioma, en la barra superior junto a la cuenta.
 *
 * Después de cambiarlo se llama a `router.refresh()`: la acción marca la
 * caché del servidor como obsoleta (`revalidatePath`), pero eso solo se nota
 * la próxima vez que algo pida esas páginas — sin este refresco, el menú
 * quedaría en el idioma nuevo mientras el resto de la pantalla, ya montada,
 * se queda en el viejo hasta la siguiente navegación.
 */
export function IdiomaSelector() {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const locale = useLocale() as Idioma;
  const t = useTranslations("idioma");
  const router = useRouter();

  function elegir(idioma: Idioma) {
    setAbierto(false);
    startTransition(async () => {
      await cambiarIdiomaAction(idioma);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={pendiente}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={t("titulo")}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text disabled:opacity-60"
      >
        <IconIdioma className="h-[18px] w-[18px]" />
        <span className="hidden sm:inline">{CODIGOS_IDIOMA[locale]}</span>
      </button>

      {abierto ? (
        <>
          {/* Capa invisible: un clic fuera cierra el menú, sin escuchar
              eventos en todo el documento. */}
          <button
            type="button"
            aria-label="Cerrar"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAbierto(false)}
          />

          <ul
            role="listbox"
            aria-label={t("titulo")}
            className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            {IDIOMAS.map((idioma) => {
              const activo = idioma === locale;
              return (
                <li key={idioma} role="option" aria-selected={activo}>
                  <button
                    type="button"
                    disabled={activo}
                    onClick={() => elegir(idioma)}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                      activo
                        ? "font-semibold text-brand"
                        : "text-text hover:bg-surface-muted"
                    }`}
                  >
                    {t(idioma)}
                    {activo ? <span aria-hidden>✓</span> : null}
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
