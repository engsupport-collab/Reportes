import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { actualizarCotizacionAction } from "@/actions/quotes";
import { QuoteForm } from "@/components/admin/quote-form";
import { Saludo } from "@/components/saludo";
import { requireAdmin } from "@/lib/auth-guard";
import { aValorInput } from "@/lib/fechas";
import { listarClientesActivos } from "@/lib/queries/clients";
import { obtenerCotizacion } from "@/lib/queries/quotes";

type Params = { params: Promise<{ id: string }> };

export default async function EditarCotizacionPage({ params }: Params) {
  const user = await requireAdmin();
  const { id } = await params;

  const cotizacion = await obtenerCotizacion(id);
  if (!cotizacion) notFound();

  const [t, clientesActivos] = await Promise.all([
    getTranslations("cotizacionForm"),
    listarClientesActivos(cotizacion.companyId),
  ]);

  // El cliente actual puede haberse desactivado después de crear esta
  // cotización — en ese caso no viene en `clientesActivos`, y el selector se
  // vería vacío en vez de mostrar la selección real. Se agrega a mano si
  // falta, para que quede visible (y para que guardar sin tocar el campo no
  // lo cambie por otro en silencio).
  const clientesDelSelector = clientesActivos.some(
    (c) => c.id === cotizacion.clientId,
  )
    ? clientesActivos
    : [{ id: cotizacion.clientId, name: cotizacion.clientName }, ...clientesActivos];

  return (
    <>
      <Saludo nombreCompleto={user.fullName} />

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
            companyIdFijo={cotizacion.companyId}
            monedaFija={cotizacion.currency}
            clientesPorEmpresa={[
              { companyId: cotizacion.companyId, opciones: clientesDelSelector },
            ]}
            valores={{
              quoteNumber: cotizacion.quoteNumber ?? "",
              projectName: cotizacion.projectName,
              clientId: cotizacion.clientId,
              purchaseOrderNo: cotizacion.purchaseOrderNo ?? "",
              dueDate: cotizacion.dueDate ? aValorInput(cotizacion.dueDate) : "",
              description: cotizacion.description ?? "",
              amount: cotizacion.amount !== null ? String(cotizacion.amount) : "",
            }}
          />
        </div>
      </div>
    </>
  );
}
