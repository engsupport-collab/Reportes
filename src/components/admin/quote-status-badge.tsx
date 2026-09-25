import { getTranslations } from "next-intl/server";

import type { EstadoCotizacion } from "@/lib/cotizaciones";

/**
 * Insignia de estado de una cotización. Mismo patrón que `EstadoBadge` de
 * reportes: nunca se apoya solo en el color, siempre lleva el texto — el verde
 * y el ámbar se confunden con daltonismo.
 */
/**
 * "Elaborar" usa el violeta (el acento secundario) y no otro tono de los que
 * ya están: es el único color del sistema con separación comprobada frente al
 * turquesa de "En curso" y el ámbar de "Pendiente" también con daltonismo (ver
 * globals.css).
 *
 * Con seis estados, los tonos bien diferenciados del sistema se agotaron.
 * "Facturar" comparte la familia del ámbar con "Pendiente por autorización" —
 * relleno sólido contra relleno suave— en vez de estrenar un color, por dos
 * motivos: el rojo aquí significa "se borra o falla" y usarlo para un estado
 * normal del negocio alarmaría sin razón, y ambos estados son en el fondo lo
 * mismo, una espera. Compartir familia con distinto peso lo dice mejor que un
 * color inventado.
 *
 * Que se parezcan no deja ambiguo nada: la insignia siempre lleva el texto, y
 * el color nunca es la única señal.
 */
const ESTILO: Record<EstadoCotizacion, string> = {
  elaborar: "bg-accent-soft text-accent",
  pendiente_autorizacion: "bg-warning-soft text-warning",
  en_curso: "bg-brand-soft text-brand",
  facturar: "bg-warning text-bg",
  finalizada: "bg-success/10 text-success",
  cancelada: "bg-surface-muted text-muted",
};

const PUNTO: Record<EstadoCotizacion, string> = {
  elaborar: "bg-accent",
  pendiente_autorizacion: "bg-warning",
  en_curso: "bg-brand",
  // Sobre el relleno ámbar sólido, un punto ámbar no se vería: va oscuro.
  facturar: "bg-bg",
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
