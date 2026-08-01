import "server-only";

import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { attachments, companies, reportTags, reports, users } from "@/db/schema";
import type { TipoServicio } from "@/lib/etiquetas";
import type { ReportStatus } from "@/lib/roles";

/**
 * Consultas de reportes.
 *
 * Todo lo que lee reportes pasa por aquí, para que la Vista General y la Vista
 * Master compartan exactamente la misma definición de "incompleto". Si esa
 * regla estuviera escrita en dos pantallas distintas, tarde o temprano una
 * diría una cosa y la otra, otra.
 */

/**
 * Número de adjuntos, como subconsulta correlacionada en vez de un JOIN con
 * GROUP BY.
 *
 * Con JOIN habría que agrupar por todas las columnas seleccionadas y filtrar
 * con HAVING, lo que complica el conteo total para la paginación. Así la
 * consulta sigue siendo una sola —sin caer en el problema N+1 de pedir los
 * adjuntos fila por fila— y el índice `attachments_report_idx` la resuelve de
 * inmediato.
 */
const conteoAdjuntos = sql<number>`(
  SELECT COUNT(*) FROM ${attachments}
  WHERE ${attachments.reportId} = ${reports.id}
)`;

/**
 * Etiquetas del reporte, unidas por coma, en la misma consulta que trae el
 * reporte — no en una consulta aparte.
 *
 * Antes había una función `etiquetasDe()` separada, pensada para evitar el
 * problema N+1 (una consulta de etiquetas por fila). Evitaba el N+1, pero
 * seguía siendo un viaje de red adicional, secuencial, después de traer los
 * reportes: había que conocer los ids antes de poder pedir sus etiquetas. Con
 * la medición de la fase 9 contra 2.000 filas, ese segundo viaje resultó ser
 * el costo más grande y más fácil de eliminar de toda la consulta — se paga en
 * cada carga de cada lista y de cada detalle, sin excepción.
 *
 * `group_concat` lo resuelve en un solo viaje: SQLite ya recorre los reportes
 * de la página, y por cada uno resuelve esta subconsulta contra el índice
 * `report_tags_tag_idx`, sin que eso implique una petición HTTP adicional. Las
 * etiquetas son un catálogo fijo y corto (electrico, mecanico, preventivo,
 * urgencia, online, proyecto) que nunca contiene comas, así que unirlas con
 * "," y separarlas después en JavaScript es seguro.
 */
const etiquetasCsv = sql<string | null>`(
  SELECT group_concat(${reportTags.tag}, ',')
  FROM ${reportTags}
  WHERE ${reportTags.reportId} = ${reports.id}
)`;

function csvAEtiquetas(csv: string | null): string[] {
  return csv ? csv.split(",") : [];
}

/**
 * Un reporte terminado sin ningún archivo adjunto está incompleto.
 *
 * No se guarda en la base: se calcula. Un campo almacenado se desincronizaría
 * en cuanto alguien subiera o borrara un adjunto, y habría que acordarse de
 * actualizarlo en cada operación. Así siempre dice la verdad.
 */
const esIncompleto = sql`(
  ${reports.status} = 'terminado'
  AND (SELECT COUNT(*) FROM ${attachments} WHERE ${attachments.reportId} = ${reports.id}) = 0
)`;

/** Terminado pero sin firmar. Se señala aparte, con su propia etiqueta. */
const faltaFirma = sql`(
  ${reports.status} = 'terminado' AND ${reports.signatureUrl} IS NULL
)`;

/**
 * Sin orden de compra. A diferencia de las dos anteriores, no depende del
 * estado: es un dato administrativo que puede faltar en cualquier momento, no
 * una señal de avance del trabajo.
 */
const sinOrden = sql`${reports.purchaseOrderNo} IS NULL`;

export type ReporteEnLista = {
  id: string;
  companyId: string;
  companyName: string;
  projectName: string;
  purchaseOrderNo: string | null;
  clientName: string;
  workDate: Date;
  status: ReportStatus;
  serviceType: TipoServicio | null;
  etiquetas: string[];
  attachmentCount: number;
  tieneFirma: boolean;
  createdAt: Date;
  authorName: string;
};

export type FiltrosReportes = {
  /**
   * Empresa. `undefined` significa "todas" — solo es una opción legítima para
   * el admin, que ve las dos por definición del rol. Cualquier consulta hecha
   * en nombre de un empleado tiene que pasar este valor siempre: para eso
   * existe `listarReportesDeEmpleado()` más abajo, que lo exige en su firma y
   * no permite omitirlo por descuido.
   */
  companyId?: string;
  /** undefined = todos los autores (Vista Master). */
  authorId?: string;
  status?: ReportStatus;
  serviceType?: TipoServicio;
  /** Etiqueta del trabajo: preventivo, urgencia, online, proyecto. */
  etiqueta?: string;
  soloIncompletos?: boolean;
  soloSinFirma?: boolean;
  soloSinOrden?: boolean;
  buscar?: string;
  pagina?: number;
  porPagina?: number;
};

export const POR_PAGINA = 20;

function construirWhere(filtros: FiltrosReportes) {
  const condiciones = [
    filtros.companyId ? eq(reports.companyId, filtros.companyId) : undefined,
  ];

  if (filtros.authorId) {
    condiciones.push(eq(reports.authorId, filtros.authorId));
  }
  if (filtros.status) {
    condiciones.push(eq(reports.status, filtros.status));
  }
  if (filtros.serviceType) {
    condiciones.push(eq(reports.serviceType, filtros.serviceType));
  }
  if (filtros.etiqueta) {
    // EXISTS y no un JOIN: con JOIN habría que agrupar para no duplicar filas
    // cuando el reporte tiene varias etiquetas. El índice report_tags_tag_idx
    // resuelve la subconsulta de inmediato.
    condiciones.push(
      sql`EXISTS (
        SELECT 1 FROM ${reportTags}
        WHERE ${reportTags.reportId} = ${reports.id}
          AND ${reportTags.tag} = ${filtros.etiqueta}
      )`,
    );
  }
  if (filtros.soloIncompletos) {
    condiciones.push(esIncompleto);
  }
  if (filtros.soloSinFirma) {
    condiciones.push(faltaFirma);
  }
  if (filtros.soloSinOrden) {
    condiciones.push(sinOrden);
  }

  const buscar = filtros.buscar?.trim();
  if (buscar) {
    // Con 2.000 reportes, LIKE recorre la tabla entera y aun así responde al
    // instante. Si algún día son decenas de miles, libSQL soporta FTS5 y se
    // agrega sin rehacer el esquema. Ver PLAN.md, sección 7.2.
    const patron = `%${buscar}%`;
    condiciones.push(
      or(
        like(reports.projectName, patron),
        like(reports.clientName, patron),
        like(reports.purchaseOrderNo, patron),
      )!,
    );
  }

  return and(...condiciones);
}

/**
 * Página de reportes.
 *
 * La paginación se hace en SQL desde el primer día: traer 2.000 filas y
 * filtrarlas en el navegador es lo que hace que una lista se sienta lenta en
 * el celular. Ver PLAN.md, sección 7.2.
 *
 * Se usa directamente solo desde código del admin. Para el empleado existe
 * `listarReportesDeEmpleado()`, que exige la empresa en su firma.
 */
export async function listarReportes(filtros: FiltrosReportes): Promise<{
  items: ReporteEnLista[];
  total: number;
  pagina: number;
  totalPaginas: number;
}> {
  const porPagina = filtros.porPagina ?? POR_PAGINA;
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const where = construirWhere(filtros);

  const [items, [conteo]] = await Promise.all([
    db
      .select({
        id: reports.id,
        companyId: reports.companyId,
        companyName: companies.name,
        projectName: reports.projectName,
        purchaseOrderNo: reports.purchaseOrderNo,
        clientName: reports.clientName,
        workDate: reports.workDate,
        status: reports.status,
        serviceType: reports.serviceType,
        createdAt: reports.createdAt,
        attachmentCount: conteoAdjuntos,
        etiquetasCsv,
        // El nombre del autor viene en el JOIN, no en una consulta por fila.
        authorName: users.fullName,
        signatureUrl: reports.signatureUrl,
      })
      .from(reports)
      .innerJoin(users, eq(users.id, reports.authorId))
      .innerJoin(companies, eq(companies.id, reports.companyId))
      .where(where)
      .orderBy(desc(reports.createdAt))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina),

    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(reports)
      .where(where),
  ]);

  const total = Number(conteo?.total ?? 0);

  return {
    items: items.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      companyName: r.companyName,
      projectName: r.projectName,
      purchaseOrderNo: r.purchaseOrderNo,
      clientName: r.clientName,
      workDate: r.workDate,
      status: r.status,
      serviceType: r.serviceType,
      etiquetas: csvAEtiquetas(r.etiquetasCsv),
      attachmentCount: Number(r.attachmentCount),
      tieneFirma: r.signatureUrl !== null,
      createdAt: r.createdAt,
      authorName: r.authorName,
    })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  };
}

/**
 * Reportes de la propia empresa de un empleado.
 *
 * Envoltorio de `listarReportes()` que exige `companyId` como parámetro
 * posicional obligatorio, no como campo opcional dentro de un objeto. Es la
 * diferencia entre "se puede olvidar" y "no compila si se olvida" — la Vista
 * General del empleado tiene que llamar siempre a esta función, nunca a
 * `listarReportes()` directamente.
 */
export async function listarReportesDeEmpleado(
  companyId: string,
  filtros: Omit<FiltrosReportes, "companyId">,
) {
  return listarReportes({ ...filtros, companyId });
}

/**
 * Cuántos reportes terminados no tienen ningún documento adjunto.
 * `companyId` en `undefined` cuenta en las dos empresas — uso legítimo solo
 * desde el panel del admin.
 */
export async function contarIncompletos(
  companyId?: string,
  authorId?: string,
): Promise<number> {
  const [fila] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(reports)
    .where(
      and(
        companyId ? eq(reports.companyId, companyId) : undefined,
        authorId ? eq(reports.authorId, authorId) : undefined,
        esIncompleto,
      ),
    );

  return Number(fila?.total ?? 0);
}

/** Cuántos reportes terminados están sin firmar. Mismo criterio que arriba. */
export async function contarSinFirma(
  companyId?: string,
  authorId?: string,
): Promise<number> {
  const [fila] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(reports)
    .where(
      and(
        companyId ? eq(reports.companyId, companyId) : undefined,
        authorId ? eq(reports.authorId, authorId) : undefined,
        faltaFirma,
      ),
    );

  return Number(fila?.total ?? 0);
}

/**
 * Cuántos reportes no tienen orden de compra. Sin condición de estado —a
 * diferencia de las dos anteriores, es válido preguntarlo tanto de reportes en
 * proceso como terminados.
 */
export async function contarSinOrden(
  companyId?: string,
  authorId?: string,
): Promise<number> {
  const [fila] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(reports)
    .where(
      and(
        companyId ? eq(reports.companyId, companyId) : undefined,
        authorId ? eq(reports.authorId, authorId) : undefined,
        sinOrden,
      ),
    );

  return Number(fila?.total ?? 0);
}

export type ReporteCompleto = NonNullable<
  Awaited<ReturnType<typeof obtenerReporte>>
>;

/**
 * Un reporte por id, con el nombre de su autor y de quien lo editó por última
 * vez. Devuelve null si no existe.
 *
 * Importante: esto NO comprueba permisos, y devuelve el reporte de cualquier
 * empresa. Quien llama tiene que verificar con `puedeAccederAReporte()` antes
 * de mostrar nada — esa función comprueba tanto el autor como la empresa. Está
 * así a propósito: la comprobación de acceso se ve explícita en cada página, en
 * vez de esconderse dentro de una consulta.
 */
export async function obtenerReporte(id: string) {
  const [fila] = await db
    .select({
      id: reports.id,
      companyId: reports.companyId,
      companyName: companies.name,
      authorId: reports.authorId,
      authorName: users.fullName,
      projectName: reports.projectName,
      purchaseOrderNo: reports.purchaseOrderNo,
      clientName: reports.clientName,
      workDate: reports.workDate,
      details: reports.details,
      status: reports.status,
      serviceType: reports.serviceType,
      completedAt: reports.completedAt,
      signatureUrl: reports.signatureUrl,
      signatureName: reports.signatureName,
      signedAt: reports.signedAt,
      createdAt: reports.createdAt,
      updatedAt: reports.updatedAt,
      updatedBy: reports.updatedBy,
      attachmentCount: conteoAdjuntos,
      etiquetasCsv,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.authorId))
    .innerJoin(companies, eq(companies.id, reports.companyId))
    .where(eq(reports.id, id))
    .limit(1);

  if (!fila) return null;

  const { etiquetasCsv: csv, ...resto } = fila;

  return {
    ...resto,
    attachmentCount: Number(fila.attachmentCount),
    etiquetas: csvAEtiquetas(csv),
  };
}
