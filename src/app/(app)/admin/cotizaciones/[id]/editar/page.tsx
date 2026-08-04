import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { actualizarCotizacionAction } from "@/actions/quotes";
import { AppShell } from "@/components/app-shell";
import { QuoteForm } from "@/components/admin/quote-form";
import { requireAdmin } from "@/lib/auth-guard";
import { aValorInput } from "@/lib/fechas";
import { obtenerCotizacion } from "@/lib/queries/quotes";

type Params = { params: Promise<{ id: string }> };

export default async function EditarCotizacionPage({ params }: Params) {
  const user = await requireAdmin();
  const { id } = await params;

  const cotizacion = await obtenerCotizacion(id);
  if (!cotizacion) notFound();

  const t = await getTranslations("cotizacionForm");

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/admin/cotizaciones/${id}`}
          className="mb-5 inline-block text-sm font-medium text-muted transition hover:text-text"
        >
          ← {t("volver")}
        </Link>

        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text">{t("tituloEditar")}</h2>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <QuoteForm
            action={actualizarCotizacionAction.bind(null, id)}
            etiqueta={t("guardar")}
            cancelarHref={`/admin/cotizaciones/${id}`}
            empresaFija={cotizacion.companyName}
            valores={{
              quoteNumber: cotizacion.quoteNumber ?? "",
              projectName: cotizacion.projectName,
              clientName: cotizacion.clientName,
              purchaseOrderNo: cotizacion.purchaseOrderNo ?? "",
              dueDate: cotizacion.dueDate ? aValorInput(cotizacion.dueDate) : "",
              description: cotizacion.description ?? "",
              amount: cotizacion.amount !== null ? String(cotizacion.amount) : "",
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
