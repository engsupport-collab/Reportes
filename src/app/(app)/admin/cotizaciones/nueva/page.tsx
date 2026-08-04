import { getTranslations } from "next-intl/server";

import { crearCotizacionAction } from "@/actions/quotes";
import { AppShell } from "@/components/app-shell";
import { QuoteForm } from "@/components/admin/quote-form";
import { requireAdmin } from "@/lib/auth-guard";
import { siguienteNumeroCotizacionSugerido } from "@/lib/queries/quotes";

export default async function NuevaCotizacionPage() {
  const [user, t, numeroSugerido] = await Promise.all([
    requireAdmin(),
    getTranslations("cotizacionForm"),
    siguienteNumeroCotizacionSugerido(),
  ]);

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text">{t("tituloNueva")}</h2>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <QuoteForm
            action={crearCotizacionAction}
            etiqueta={t("crear")}
            cancelarHref="/admin/cotizaciones"
            empresas={user.empresas}
            numeroSugerido={numeroSugerido}
          />
        </div>
      </div>
    </AppShell>
  );
}
