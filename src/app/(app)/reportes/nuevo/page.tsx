import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import { NuevoReporteSelector } from "@/components/reports/nuevo-reporte-selector";
import type { OpcionCotizacionSelector } from "@/components/reports/quote-selector";
import { crearReporteAction, crearReporteViaticoAction } from "@/actions/reports";
import { requireAccesoReportes } from "@/lib/auth-guard";
import { formatFechaLarga, aValorInput } from "@/lib/fechas";
import { listarClientesActivos } from "@/lib/queries/clients";
import { listarCotizacionesActivas } from "@/lib/queries/quotes";

type Params = {
  searchParams: Promise<{ companyId?: string; quoteId?: string }>;
};

/**
 * Crear reporte. Página compartida por las dos vistas.
 *
 * El empleado crea siempre dentro de su empresa activa, sin elegir nada. El
 * admin no tiene empresa activa —ve las dos siempre— así que aquí es donde
 * elige explícitamente, una vez por reporte, para cuál de las dos es.
 *
 * `companyId`/`quoteId` en la URL vienen del botón "Crear reporte con esta
 * cotización" en el detalle de una cotización: sin ellos, el admin cae en la
 * primera empresa de la lista por defecto, que puede no ser la de la
 * cotización que acaba de abrir, y el selector la muestra vacía.
 */
export default async function NuevoReportePage({ searchParams }: Params) {
  const user = await requireAccesoReportes();
  const [{ companyId: companyIdParam, quoteId: quoteIdParam }, t, tSelector] =
    await Promise.all([
      searchParams,
      getTranslations("nuevoReportePage"),
      getTranslations("quoteSelector"),
    ]);

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
  const empresaHeredada =
    user.role === "admin" && companyIdParam
      ? empresas.find((e) => e.id === companyIdParam)
      : undefined;

  const [cotizacionesPorEmpresa, clientesPorEmpresa] = await Promise.all([
    Promise.all(
      empresas.map(async (e) => ({
        companyId: e.id,
        opciones: (await listarCotizacionesActivas(e.id)).map(
          (c): OpcionCotizacionSelector => ({
            id: c.id,
            label: c.quoteNumber
              ? `${c.quoteNumber} — ${c.projectName} — ${c.clientName}`
              : `${c.projectName} — ${c.clientName}`,
            clientName: c.clientName,
            purchaseOrderLabel: c.purchaseOrderNo ?? tSelector("sinAsignar"),
            dueDateLabel: c.dueDate
              ? formatFechaLarga(c.dueDate)
              : tSelector("sinFecha"),
          }),
        ),
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
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text">{t("titulo")}</h2>
          <p className="mt-1 text-sm text-muted">{t("subtitulo")}</p>
        </div>

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
          // Se propone la fecha de hoy: el reporte se escribe casi siempre el
          // mismo día del trabajo, y así es un campo menos que llenar.
          valoresServicio={{
            // Solo se preselecciona si la empresa también quedó fijada: un
            // quoteId de otra empresa que la elegida por defecto no
            // aparecería en su lista y quedaría un id colgado sin efecto.
            // Para un empleado la empresa siempre está fijada, así que su
            // quoteId de la URL sí vale.
            quoteId:
              user.role !== "admin" || empresaHeredada ? (quoteIdParam ?? "") : "",
            workDate: aValorInput(new Date()),
            serviceType: "",
            etiquetas: [],
            details: "",
          }}
        />
      </div>
    </AppShell>
  );
}
