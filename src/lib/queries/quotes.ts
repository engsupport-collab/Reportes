import "server-only";

import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clients, companies, quotes, reports, users } from "@/db/schema";
import { ESTADOS_ACTIVOS, type EstadoCotizacion } from "@/lib/cotizaciones";
import type { Moneda } from "@/lib/moneda";

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
      clientName: clients.name,
      purchaseOrderNo: quotes.purchaseOrderNo,
      dueDate: quotes.dueDate,
    })
    .from(quotes)
    .innerJoin(clients, eq(clients.id, quotes.clientId))
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
  currency: Moneda;
  quoteNumber: string | null;
  projectName: string;
  clientId: string;
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
        like(clients.name, patron),
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
        currency: companies.currency,
        quoteNumber: quotes.quoteNumber,
        projectName: quotes.projectName,
        clientId: quotes.clientId,
        clientName: clients.name,
        status: quotes.status,
        purchaseOrderNo: quotes.purchaseOrderNo,
        dueDate: quotes.dueDate,
        revisada: quotes.revisada,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .innerJoin(companies, eq(companies.id, quotes.companyId))
      .innerJoin(clients, eq(clients.id, quotes.clientId))
      .where(where)
      .orderBy(desc(quotes.createdAt))
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),

    // El conteo necesita el mismo join que arriba: `where` puede traer una
    // condición de búsqueda sobre `clients.name`, y sin el join esa tabla no
    // estaría disponible en esta consulta.
    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(quotes)
      .innerJoin(clients, eq(clients.id, quotes.clientId))
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
      currency: companies.currency,
      quoteNumber: quotes.quoteNumber,
      projectName: quotes.projectName,
      clientId: quotes.clientId,
      clientName: clients.name,
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
    .innerJoin(clients, eq(clients.id, quotes.clientId))
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
 * Prefijo del año en curso para el número de cotización, p. ej. "Q2026_". El
 * consecutivo reinicia solo con que cambie el año, sin ningún paso manual.
 */
function prefijoNumeroCotizacion(): string {
  return `Q${new Date().getFullYear()}_`;
}

/**
 * Siguiente número de cotización, SOLO para mostrarlo en el formulario antes
 * de guardar. No es atómico — es una lectura suelta, y puede quedar obsoleta
 * si otro admin crea una cotización mientras el formulario sigue abierto. La
 * asignación real, la que sí tiene que ser segura, ocurre en
 * `insertarCotizacionConNumeroAutomatico`, en el momento de guardar.
 */
export async function siguienteNumeroCotizacionSugerido(): Promise<string> {
  const prefijo = prefijoNumeroCotizacion();

  const [fila] = await db
    .select({ maximo: sql<string | null>`MAX(${quotes.quoteNumber})` })
    .from(quotes)
    .where(like(quotes.quoteNumber, `${prefijo}%`));

  const ultimo = fila?.maximo ? Number(fila.maximo.slice(prefijo.length)) : 0;
  const siguiente = (Number.isFinite(ultimo) ? ultimo : 0) + 1;

  return `${prefijo}${String(siguiente).padStart(3, "0")}`;
}

/**
 * Inserta una cotización asignándole el siguiente número del año de forma
 * atómica: el cálculo del consecutivo y la inserción ocurren en una sola
 * sentencia SQL (un `INSERT ... SELECT` con `MAX` sobre la propia tabla), así
 * que dos cotizaciones creadas al mismo tiempo no pueden recibir el mismo
 * número — a diferencia de `siguienteNumeroCotizacionSugerido`, que solo lee.
 *
 * `substr(quote_number, N)` usa índice 1: con el prefijo "Q2026_" (6
 * caracteres), el primer dígito del consecutivo empieza en la posición 7.
 */
export async function insertarCotizacionConNumeroAutomatico(valores: {
  id: string;
  companyId: string;
  createdBy: string;
  status: EstadoCotizacion;
  projectName: string;
  clientId: string;
  purchaseOrderNo: string | null;
  dueDate: number | null;
  description: string | null;
  amount: number | null;
  revisada: boolean;
}): Promise<void> {
  const prefijo = prefijoNumeroCotizacion();
  const inicioConsecutivo = prefijo.length + 1;

  await db.run(sql`
    INSERT INTO ${quotes} (
      id, company_id, quote_number, project_name, client_id, status,
      purchase_order_no, due_date, description, amount, revisada, created_by
    )
    SELECT
      ${valores.id},
      ${valores.companyId},
      ${prefijo} || printf('%03d', COALESCE(MAX(CAST(substr(quote_number, ${inicioConsecutivo}) AS INTEGER)), 0) + 1),
      ${valores.projectName},
      ${valores.clientId},
      ${valores.status},
      ${valores.purchaseOrderNo},
      ${valores.dueDate},
      ${valores.description},
      ${valores.amount},
      ${valores.revisada ? 1 : 0},
      ${valores.createdBy}
    FROM ${quotes}
    WHERE quote_number LIKE ${`${prefijo}%`}
  `);
}

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
