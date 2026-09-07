import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Logotipo } from "@/components/logotipo";

/**
 * 404 de toda la aplicación — cualquier ruta que no exista cae aquí, sin
 * distinguir si viene de un enlace mal escrito, un enlace roto en el propio
 * código (ver el buscador de `top-bar.tsx`) o alguien que teclea algo a mano.
 *
 * El enlace de vuelta apunta a "/", no a una ruta fija: esa página ya decide
 * sola a dónde manda a cada quien según su rol (ver `src/app/page.tsx`), así
 * que aquí no hay que repetir esa lógica.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-bg px-6 text-center">
      <Logotipo alto={32} />
      <div className="space-y-3">
        <p className="font-mono text-sm font-semibold tracking-widest text-muted">
          404
        </p>
        <h1 className="text-2xl font-bold text-text">{t("titulo")}</h1>
        <p className="max-w-sm text-sm text-muted">{t("texto")}</p>
      </div>
      <Link
        href="/"
        className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-strong"
      >
        {t("boton")}
      </Link>
    </div>
  );
}
