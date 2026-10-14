import { getTranslations } from "next-intl/server";

import { NuevoReporteSelector } from "@/components/reports/nuevo-reporte-selector";
import type { OpcionCotizacionSelector } from "@/components/reports/quote-selector";
import { crearReporteAction, crearReporteViaticoAction } from "@/actions/reports";
import { Saludo } from "@/components/saludo";
import { requireAccesoReportes } from "@/lib/auth-guard";
import { formatFechaLarga, aValorInput } from "@/lib/fechas";
import { listarClientesActivos } from "@/lib/queries/clients";
import {
  type CotizacionEnLista,
  type OpcionCotizacion,
  cotizacionParaReporte,
  listarCotizacionesActivas,
} from "@/lib/queries/quotes";

type Params = {
  searchParams: Promise<{ companyId?: string; quoteId?: string; tipo?: string }>;
};

/**
 * Crear reporte. Página compartida por las dos vistas.
 *
 * El empleado crea siempre dentro de su empresa activa, sin elegir nada. El
 * admin no tiene empresa activa —ve las dos siempre— así que aquí es donde
 * elige explícitamente, una vez por reporte, para cuál de las dos es.
 *
 * `companyId`/`quoteId` en la URL vienen de los botones "Crear reporte" y
 * "Crear viáticos" en el detalle de una cotización (el segundo agrega
 * `tipo=viaticos`). La cotización de origen no se da por buena por venir en
 * la dirección: `cotizacionParaReporte` comprueba que exista, esté activa y
 * sea de una empresa de este usuario. Si lo es, el reporte de viáticos queda
 * colgado de ella sin selector, y la empresa sale de ella. Si no, se avisa y
 * se sigue con el formulario de siempre.
 */
export default async function NuevoReportePage({ searchParams }: Params) {
  const user = await requireAccesoReportes();
  const [{ companyId: companyIdParam, quoteId: quoteIdParam, tipo }, t, tSelector] =
    await Promise.all([
      searchParams,
      getTranslations("nuevoReportePage"),
      getTranslations("quoteSelector"),
    ]);

  const cotizacionOrigen = quoteIdParam
    ? await cotizacionParaReporte(user, quoteIdParam)
    : null;

  /** Cómo se muestra una cotización en los selectores y en el recuadro fijo. */
  const opcion = (
    c: Pick<CotizacionEnLista, "id" | "quoteNumber" | "projectName" | "clientName"> &
      Pick<OpcionCotizacion, "purchaseOrderNo" | "dueDate">,
  ): OpcionCotizacionSelector => ({
    id: c.id,
    label: c.quoteNumber
      ? `${c.quoteNumber} — ${c.projectName} — ${c.clientName}`
      : `${c.projectName} — ${c.clientName}`,
    clientName: c.clientName,
    purchaseOrderLabel: c.purchaseOrderNo ?? tSelector("sinAsignar"),
    dueDateLabel: c.dueDate ? formatFechaLarga(c.dueDate) : tSelector("sinFecha"),
  });

  // Las cotizaciones y los clientes activos se traen para todas las empresas
  // del usuario de una vez: son pocos (una empresa entera, no todo el
  // sistema), y así los selectores no necesitan pedir datos al servidor cada
  // vez que el admin cambia de empresa. Las usan los dos tipos de reporte —
  // servicio y viáticos son hermanos bajo la misma cotización.
  const empresas = user.role === "admin" ? user.empresas : [user.empresaActiva];

  // Solo tiene sentido para el admin: un empleado ya está fijo en su propia
  // empresa, así que un companyId distinto en la URL no le sirve de nada.
  //
  // Cuando llega, el reporte se está creando desde una cotización concreta y
  // la empresa deja de ser una decisión: la hereda de ella y no se puede
  // cambiar. Cotización y reporte documentan el mismo trabajo, así que uno en
  // LLC y el otro en SAS sería una contradicción, no una opción.
  //
  // Con una cotización de origen válida, la empresa es la de la cotización —
  // leída de la base—, no la que diga la dirección.
  const empresaHeredada =
    user.role !== "admin"
      ? undefined
      : cotizacionOrigen
        ? empresas.find((e) => e.id === cotizacionOrigen.companyId)
        : companyIdParam
          ? empresas.find((e) => e.id === companyIdParam)
          : undefined;

  const [cotizacionesPorEmpresa, clientesPorEmpresa] = await Promise.all([
    Promise.all(
      empresas.map(async (e) => ({
        companyId: e.id,
        opciones: (await listarCotizacionesActivas(e.id)).map(opcion),
      })),
    ),
    Promise.all(
      empresas.map(async (e) => ({
        companyId: e.id,
        opciones: await listarClientesActivos(e.id),
      })),
    ),
  ]);

  return (
    <>
      <Saludo nombreCompleto={user.fullName} />

      <div className="mx-auto max-w-3xl">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text">{t("titulo")}</h2>
          <p className="mt-1 text-sm text-muted">{t("subtitulo")}</p>
        </div>

        {quoteIdParam && !cotizacionOrigen ? (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning"
          >
            {t("cotizacionNoDisponible")}
          </p>
        ) : null}

        <NuevoReporteSelector
          accionServicio={crearReporteAction}
          accionViatico={crearReporteViaticoAction}
          cancelarHref={user.role === "admin" ? "/admin/reportes" : "/reportes"}
          // Con la empresa heredada de una cotización no se ofrece el
          // interruptor: `empresaFija` la muestra de solo lectura y la manda en
          // un campo oculto.
          empresas={
            user.role === "admin" && !empresaHeredada ? user.empresas : undefined
          }
          empresaFija={empresaHeredada}
          companyIdFijo={
            user.role === "admin" ? empresaHeredada?.id : user.empresaActiva.id
          }
          cotizacionesPorEmpresa={cotizacionesPorEmpresa}
          clientesPorEmpresa={clientesPorEmpresa}
          tipoInicial={tipo === "viaticos" ? "viaticos" : "servicio"}
          cotizacionOrigen={cotizacionOrigen ? opcion(cotizacionOrigen) : undefined}
          // Se propone la fecha de hoy: el reporte se escribe casi siempre el
          // mismo día del trabajo, y así es un campo menos que llenar.
          valoresServicio={{
            // Solo la cotización de origen ya comprobada: un id de la
            // dirección que no pasó `cotizacionParaReporte` no se preselecciona.
            quoteId: cotizacionOrigen?.id ?? "",
            workDate: aValorInput(new Date()),
            serviceType: "",
            etiquetas: [],
            details: "",
          }}
        />
      </div>
    </>
  );
}
