import "server-only";

import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  clients,
  companies,
  quoteSequences,
  quotes,
  reports,
  users,
} from "@/db/schema";
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
  type: "servicio" | "viaticos";
  projectName: string;
  status: "en_proceso" | "terminado";
  tieneFirma: boolean;
  /** Solo tiene sentido para uno de viáticos; 0 en uno de servicio. */
  totalGastos: number;
  authorName: string;
  createdAt: Date;
};

/**
 * Numeración de cotizaciones.
 *
 * El número NO se deduce de la tabla `quotes`. Sale de un contador propio
 * (`quote_sequences`, uno por año) que solo avanza. Ver el comentario de esa
 * tabla en `src/db/schema.ts` para el porqué: cualquier regla que mire las
 * filas existentes —`MAX + 1`, `COUNT + 1`, el primer hueco libre— devuelve
 * un número distinto según lo que haya en la tabla en ese instante, así que
 * borrar una cotización libera el suyo y dos documentos distintos pueden
 * acabar llamándose igual.
 *
 * Consecuencia buscada: los huecos son permanentes. Si se borra la Q2026_004,
 * ese número no se vuelve a entregar jamás.
 */

/** Longitud mínima del consecutivo; a partir de 1000 crece solo. */
const DIGITOS_CONSECUTIVO = 3;

function anioActual(): number {
  return new Date().getFullYear();
}

/**
 * "Q2026_007". El año va dentro del número, así que el consecutivo puede
 * reiniciar en cada año sin que dos cotizaciones se llamen igual nunca.
 */
export function formatearNumeroCotizacion(anio: number, valor: number): string {
  return `Q${anio}_${String(valor).padStart(DIGITOS_CONSECUTIVO, "0")}`;
}

/** Descompone un número con el formato de la casa. Null si no lo tiene. */
export function leerNumeroCotizacion(
  numero: string,
): { anio: number; valor: number } | null {
  const m = /^Q(\d{4})_(\d+)$/.exec(numero.trim());
  if (!m) return null;
  return { anio: Number(m[1]), valor: Number(m[2]) };
}

/**
 * Número que el formulario muestra ya escrito, SOLO como sugerencia.
 *
 * No reserva nada: si lo reservara, abrir el formulario y cerrarlo sin guardar
 * quemaría un número. Puede quedar obsoleto si otro admin crea una cotización
 * mientras el formulario sigue abierto, y por eso el guardado lo descarta y
 * pide uno de verdad — ver `crearCotizacionAction`.
 */
export async function siguienteNumeroCotizacionSugerido(): Promise<string> {
  const anio = anioActual();

  const [fila] = await db
    .select({ lastValue: quoteSequences.lastValue })
    .from(quoteSequences)
    .where(eq(quoteSequences.year, anio))
    .limit(1);

  return formatearNumeroCotizacion(anio, (fila?.lastValue ?? 0) + 1);
}

/** El `printf` de SQLite que rellena el consecutivo con ceros a la izquierda. */
const FORMATO_CONSECUTIVO = sql.raw(`'%0${DIGITOS_CONSECUTIVO}d'`);

/**
 * Inserta una cotización con el siguiente número del año.
 *
 * Van tres sentencias en un `batch`, que libSQL ejecuta como una transacción
 * en un solo viaje: incrementar el contador, insertar la cotización leyendo el
 * valor recién incrementado, y devolverlo. Si la inserción falla —un id
 * repetido, un cliente que ya no existe— el contador vuelve atrás con ella y
 * el número no se quema.
 *
 * Se usa `batch` y NO una transacción interactiva, y la diferencia importa
 * bajo carga: una transacción interactiva mantiene abierto un stream contra
 * Turso mientras dura, y cien creaciones a la vez agotan el límite de streams
 * — probado, y falla con ECONNRESET. El `batch` es una petición suelta, así
 * que cien simultáneas salen adelante sin un solo error.
 *
 * La segunda sentencia lee `last_value` de la primera porque las dos están en
 * la misma transacción; nadie más puede colarse entre ellas.
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
}): Promise<string> {
  const anio = anioActual();
  const prefijo = `Q${anio}_`;

  const resultados = await db.batch([
    db.run(sql`
      INSERT INTO ${quoteSequences} (year, last_value) VALUES (${anio}, 1)
      ON CONFLICT(year) DO UPDATE SET last_value = last_value + 1
    `),
    db.run(sql`
      INSERT INTO ${quotes} (
        id, company_id, quote_number, project_name, client_id, status,
        purchase_order_no, due_date, description, amount, revisada, created_by
      )
      SELECT
        ${valores.id},
        ${valores.companyId},
        ${prefijo} || printf(${FORMATO_CONSECUTIVO}, last_value),
        ${valores.projectName},
        ${valores.clientId},
        ${valores.status},
        ${valores.purchaseOrderNo},
        ${valores.dueDate},
        ${valores.description},
        ${valores.amount},
        ${valores.revisada ? 1 : 0},
        ${valores.createdBy}
      FROM ${quoteSequences}
      WHERE year = ${anio}
    `),
    db.get<{ last_value: number }>(
      sql`SELECT last_value FROM ${quoteSequences} WHERE year = ${anio}`,
    ),
  ]);

  const asignado = resultados[2] as { last_value: number } | undefined;

  if (!asignado) {
    throw new Error(`No se pudo asignar el número de cotización de ${anio}.`);
  }

  return formatearNumeroCotizacion(anio, Number(asignado.last_value));
}

/**
 * ¿Este error es el índice único de `quote_number` rechazando un duplicado?
 *
 * Se mira el mensaje porque es lo único que el driver expone de forma estable;
 * el código de error (`SQLITE_CONSTRAINT`) lo comparten todas las
 * restricciones, así que por sí solo no distingue este caso de una clave
 * foránea rota. Se recorre la cadena de `cause` porque Drizzle envuelve el
 * error del driver en uno propio.
 */
export function esNumeroCotizacionDuplicado(error: unknown): boolean {
  let actual: unknown = error;

  for (let saltos = 0; actual !== undefined && actual !== null && saltos < 5; saltos++) {
    const mensaje = actual instanceof Error ? actual.message : String(actual);
    if (
      mensaje.includes("UNIQUE constraint failed") &&
      mensaje.includes("quote_number")
    ) {
      return true;
    }
    actual = actual instanceof Error ? actual.cause : undefined;
  }

  return false;
}

/**
 * Adelanta el contador si alguien escribió un número a mano por encima de él.
 *
 * El campo de número es editable, así que un admin puede escribir "Q2026_050"
 * cuando el contador va por el 12. Sin esto, el contador llegaría al 50 dentro
 * de unas semanas y entregaría un número que ya está en uso — justo lo que la
 * secuencia existe para impedir. Nunca lo hace retroceder.
 *
 * Silencioso ante cualquier otro formato: un número que no sea "Qaaaa_nnn" no
 * pertenece a esta serie y no la afecta.
 */
export async function sincronizarSecuenciaConNumero(
  numero: string | null,
): Promise<void> {
  const leido = numero ? leerNumeroCotizacion(numero) : null;
  if (!leido) return;

  await db.run(sql`
    INSERT INTO ${quoteSequences} (year, last_value) VALUES (${leido.anio}, ${leido.valor})
    ON CONFLICT(year) DO UPDATE SET last_value = MAX(last_value, ${leido.valor})
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
  const filas = await db
    .select({
      id: reports.id,
      type: reports.type,
      projectName: reports.projectName,
      status: reports.status,
      tieneFirma: sql<number>`(${reports.signatureUrl} IS NOT NULL)`,
      // `${reports.id}` sin calificar quedaría como "id" a secas, que dentro
      // del subselect resolvería contra report_viaticos.id (su propia
      // clave) y no contra el reports.id de fuera — las dos tablas tienen
      // columna "id". Se escribe calificado a mano para no repetir ese bug.
      totalGastos: sql<number>`(
        SELECT COALESCE(SUM(amount), 0) FROM report_viaticos
        WHERE report_viaticos.report_id = reports.id
      )`,
      authorName: users.fullName,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.authorId))
    .where(eq(reports.quoteId, quoteId))
    .orderBy(desc(reports.createdAt));

  return filas.map((f) => ({
    ...f,
    tieneFirma: Boolean(f.tieneFirma),
    totalGastos: Number(f.totalGastos),
  }));
}

/**
 * ¿Este usuario redactó algún reporte de viáticos bajo esta cotización?
 *
 * Es la base del acceso "resumen" al reporte de servicio hermano: quien
 * justificó un viaje con un viático necesita poder volver a encontrarlo, y la
 * única puerta a un viático es la pestaña del servicio que lo agrupa — ver
 * `nivelAccesoServicio` en `auth-guard.ts`.
 */
export async function esAutorDeViaticoDeCotizacion(
  quoteId: string,
  userId: string,
): Promise<boolean> {
  const [fila] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.quoteId, quoteId),
        eq(reports.type, "viaticos"),
        eq(reports.authorId, userId),
      ),
    )
    .limit(1);

  return fila !== undefined;
}
