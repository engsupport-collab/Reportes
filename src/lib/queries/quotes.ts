import "server-only";

import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { companies, quotes, reports, users } from "@/db/schema";
import { ESTADOS_ACTIVOS, type EstadoCotizacion } from "@/lib/cotizaciones";

/**
 * Consultas de cotizaciones.
 *
 * Todo lo que lee cotizaciones pasa por aquí — el selector del reporte y el
 * panel del admin comparten exactamente la misma noción de "activa" y de "sin
 * revisar", para que esa regla no se desalinee entre las dos pantallas.
 */

export const POR_PAGINA = 20;

export type OpcionCotizacion = {
  id: string;
  quoteNumber: string | null;
  projectName: string;
  clientName: string;
  purchaseOrderNo: string | null;
  dueDate: Date | null;
};

/**
 * Cotizaciones activas de una empresa, para el selector del formulario de
 * reporte. Sin paginar: son las cotizaciones abiertas de una sola empresa, no
 * la lista completa del sistema.
 */
export async function listarCotizacionesActivas(
  companyId: string,
): Promise<OpcionCotizacion[]> {
  return db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      projectName: quotes.projectName,
      clientName: quotes.clientName,
      purchaseOrderNo: quotes.purchaseOrderNo,
      dueDate: quotes.dueDate,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.companyId, companyId),
        or(...ESTADOS_ACTIVOS.map((estado) => eq(quotes.status, estado))),
      ),
    )
    .orderBy(desc(quotes.createdAt));
}

export type CotizacionEnLista = {
  id: string;
  companyId: string;
  companyName: string;
  quoteNumber: string | null;
  projectName: string;
  clientName: string;
  status: EstadoCotizacion;
  purchaseOrderNo: string | null;
  dueDate: Date | null;
  revisada: boolean;
  createdAt: Date;
};

export type FiltrosCotizaciones = {
  companyId?: string;
  status?: EstadoCotizacion;
  soloSinRevisar?: boolean;
  buscar?: string;
  pagina?: number;
};

function construirWhere(filtros: FiltrosCotizaciones) {
  const condiciones = [
    filtros.companyId ? eq(quotes.companyId, filtros.companyId) : undefined,
    filtros.status ? eq(quotes.status, filtros.status) : undefined,
    filtros.soloSinRevisar ? eq(quotes.revisada, false) : undefined,
  ];

  const buscar = filtros.buscar?.trim();
  if (buscar) {
    const patron = `%${buscar}%`;
    condiciones.push(
      or(
        like(quotes.quoteNumber, patron),
        like(quotes.projectName, patron),
        like(quotes.clientName, patron),
      )!,
    );
  }

  return and(...condiciones);
}

/** Página de cotizaciones para el panel del admin, con sus filtros. */
export async function listarCotizaciones(filtros: FiltrosCotizaciones): Promise<{
  items: CotizacionEnLista[];
  total: number;
  pagina: number;
  totalPaginas: number;
}> {
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const where = construirWhere(filtros);

  const [items, [conteo]] = await Promise.all([
    db
      .select({
        id: quotes.id,
        companyId: quotes.companyId,
        companyName: companies.name,
        quoteNumber: quotes.quoteNumber,
        projectName: quotes.projectName,
        clientName: quotes.clientName,
        status: quotes.status,
        purchaseOrderNo: quotes.purchaseOrderNo,
        dueDate: quotes.dueDate,
        revisada: quotes.revisada,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .innerJoin(companies, eq(companies.id, quotes.companyId))
      .where(where)
      .orderBy(desc(quotes.createdAt))
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),

    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(quotes)
      .where(where),
  ]);

  const total = Number(conteo?.total ?? 0);

  return {
    items,
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
  };
}

export type CotizacionCompleta = CotizacionEnLista & {
  description: string | null;
  amount: number | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Una cotización por id, con el nombre de su empresa y de quien la creó.
 * Devuelve null si no existe.
 *
 * Igual que `obtenerReporte()`: NO comprueba permisos. Quien llama verifica
 * con el rol y, si aplica, la empresa, antes de mostrar o modificar nada.
 */
export async function obtenerCotizacion(
  id: string,
): Promise<CotizacionCompleta | null> {
  const [fila] = await db
    .select({
      id: quotes.id,
      companyId: quotes.companyId,
      companyName: companies.name,
      quoteNumber: quotes.quoteNumber,
      projectName: quotes.projectName,
      clientName: quotes.clientName,
      status: quotes.status,
      purchaseOrderNo: quotes.purchaseOrderNo,
      dueDate: quotes.dueDate,
      description: quotes.description,
      amount: quotes.amount,
      revisada: quotes.revisada,
      createdByName: users.fullName,
      createdAt: quotes.createdAt,
      updatedAt: quotes.updatedAt,
    })
    .from(quotes)
    .innerJoin(companies, eq(companies.id, quotes.companyId))
    .innerJoin(users, eq(users.id, quotes.createdBy))
    .where(eq(quotes.id, id))
    .limit(1);

  return fila ?? null;
}

export type ReporteDeCotizacion = {
  id: string;
  projectName: string;
  status: "en_proceso" | "terminado";
  tieneFirma: boolean;
  authorName: string;
  createdAt: Date;
};

/**
 * Reportes creados desde una cotización, para mostrarlos en su detalle y para
 * saber a cuáles alcanza la propagación al marcar la cotización como revisada
 * (los que no tengan firma).
 */
export async function listarReportesDeCotizacion(
  quoteId: string,
): Promise<ReporteDeCotizacion[]> {
  return db
    .select({
      id: reports.id,
      projectName: reports.projectName,
      status: reports.status,
      tieneFirma: sql<number>`(${reports.signatureUrl} IS NOT NULL)`,
      authorName: users.fullName,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.authorId))
    .where(eq(reports.quoteId, quoteId))
    .orderBy(desc(reports.createdAt))
    .then((filas) =>
      filas.map((f) => ({ ...f, tieneFirma: Boolean(f.tieneFirma) })),
    );
}
