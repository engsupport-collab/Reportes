import { getTranslations } from "next-intl/server";

import type { EstadoCotizacion } from "@/lib/cotizaciones";

/**
 * Insignia de estado de una cotización. Mismo patrón que `EstadoBadge` de
 * reportes: nunca se apoya solo en el color, siempre lleva el texto — el verde
 * y el ámbar se confunden con daltonismo.
 */
const ESTILO: Record<EstadoCotizacion, string> = {
  pendiente_autorizacion: "bg-warning-soft text-warning",
  en_curso: "bg-brand-soft text-brand",
  finalizada: "bg-success/10 text-success",
  cancelada: "bg-surface-muted text-muted",
};

const PUNTO: Record<EstadoCotizacion, string> = {
  pendiente_autorizacion: "bg-warning",
  en_curso: "bg-brand",
  finalizada: "bg-success",
  cancelada: "bg-muted",
};

export async function QuoteStatusBadge({
  status,
}: {
  status: EstadoCotizacion;
}) {
  const t = await getTranslations("estadosCotizacion");

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ESTILO[status]}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${PUNTO[status]}`} />
      {t(status)}
    </span>
  );
}
