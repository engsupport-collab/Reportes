import { getTranslations } from "next-intl/server";

import { ordenarEtiquetas, TIPOS_SERVICIO_IDS } from "@/lib/etiquetas";
import type { ReportStatus } from "@/lib/roles";

/**
 * Etiquetas de estado y de faltantes.
 *
 * Ninguna se apoya solo en el color: todas llevan texto. El verde y el ámbar se
 * confunden con daltonismo, y estas etiquetas son justamente las que le dicen a
 * alguien que su reporte está incompleto.
 *
 * El tipo de servicio y las etiquetas del trabajo se guardan por id
 * ("electrico", "urgencia"...) y se traducen aquí al mostrarlos. El catálogo de
 * `lib/etiquetas.ts` conserva su `label` en español porque lo sigue usando el
 * PDF, que no pasa por next-intl.
 */

export async function EstadoBadge({ status }: { status: ReportStatus }) {
  const t = await getTranslations("badges");
  const esTerminado = status === "terminado";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        esTerminado
          ? "bg-success/10 text-success"
          : "bg-surface-muted text-muted"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${esTerminado ? "bg-success" : "bg-muted"}`}
      />
      {esTerminado ? t("terminado") : t("enProceso")}
    </span>
  );
}

/**
 * Tipo de servicio y etiquetas del trabajo.
 *
 * La urgencia se muestra en rojo y las demás en neutro: si todas se vieran
 * igual, marcar "urgencia" no serviría para nada al mirar una lista larga.
 */
export async function Clasificacion({
  serviceType,
  etiquetas,
}: {
  serviceType: string | null;
  etiquetas: string[];
}) {
  const t = await getTranslations("etiquetas");

  const tipo =
    serviceType && (TIPOS_SERVICIO_IDS as readonly string[]).includes(serviceType)
      ? t(serviceType as (typeof TIPOS_SERVICIO_IDS)[number])
      : null;
  const marcas = ordenarEtiquetas(etiquetas);

  if (!tipo && marcas.length === 0) return null;

  return (
    <>
      {tipo ? (
        <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
          {tipo}
        </span>
      ) : null}

      {marcas.map((marca) => (
        <span
          key={marca.id}
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
            marca.urgente
              ? "bg-danger/10 text-danger"
              : "bg-surface-muted text-muted"
          }`}
        >
          {t(marca.id as Parameters<typeof t>[0])}
        </span>
      ))}
    </>
  );
}

export function AlertaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="currentColor"
      >
        <path d="M8 1.5a.9.9 0 0 1 .78.45l6 10.4A.9.9 0 0 1 14 13.7H2a.9.9 0 0 1-.78-1.35l6-10.4A.9.9 0 0 1 8 1.5Zm0 3.6a.7.7 0 0 0-.7.75l.2 2.9a.5.5 0 0 0 1 0l.2-2.9a.7.7 0 0 0-.7-.75Zm0 5.3a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
      </svg>
      {children}
    </span>
  );
}

/**
 * Qué le falta a un reporte.
 *
 * "Sin orden" es distinto a los otros dos: se muestra sin importar el estado,
 * porque es un dato administrativo (puede faltar desde el primer día y
 * completarse después, al editar), no una señal de qué tan avanzado va el
 * trabajo. "Falta documento" y "Falta firma" sí dependen del estado: mientras
 * el trabajo sigue en proceso, que falten es normal y no amerita alerta.
 */
export async function Faltantes({
  status,
  attachmentCount,
  tieneFirma,
  purchaseOrderNo,
}: {
  status: ReportStatus;
  attachmentCount: number;
  tieneFirma: boolean;
  purchaseOrderNo: string | null;
}) {
  const t = await getTranslations("badges");
  const terminado = status === "terminado";

  return (
    <>
      {!purchaseOrderNo ? <AlertaBadge>{t("sinOrden")}</AlertaBadge> : null}
      {terminado && attachmentCount === 0 ? (
        <AlertaBadge>{t("faltaDocumento")}</AlertaBadge>
      ) : null}
      {terminado && !tieneFirma ? (
        <AlertaBadge>{t("faltaFirma")}</AlertaBadge>
      ) : null}
    </>
  );
}
