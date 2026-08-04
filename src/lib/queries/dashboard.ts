import "server-only";

import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { reports, userCompanies, users } from "@/db/schema";
import { inicioDeMes } from "@/lib/fechas";

/**
 * Datos del panel del administrador.
 *
 * `companyId` es opcional en toda esta capa: `undefined` agrega las dos
 * empresas, que es la vista por defecto del admin — ve todo, sin elegir. Un
 * valor concreto acota al filtro que el admin haya elegido en la pantalla.
 * Esta ambigüedad es exclusiva del rol admin; ningún dato de un empleado pasa
 * por aquí.
 */

const SEMANAS_TENDENCIA = 12;
const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;

export type ResumenPanel = {
  reportesDelMes: number;
  reportesMesAnterior: number;
  terminadosDelMes: number;
  terminadosMesAnterior: number;
  incompletos: number;
  sinFirma: number;
  totalHistorico: number;
  empleadosActivos: number;
  /** 12 puntos, del más antiguo al más reciente: reportes creados por semana. */
  tendencia: number[];
};

async function contar(condicion: ReturnType<typeof and>): Promise<number> {
  const [fila] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(reports)
    .where(condicion);

  return Number(fila?.total ?? 0);
}

/**
 * Reportes creados por semana durante las últimas 12.
 *
 * Se agrupa en SQL y no trayendo las filas para contarlas en memoria: con 2.000
 * reportes, traerlos todos para pintar una minigráfica de 12 puntos sería mover
 * datos de más en cada carga del panel.
 */
async function tendenciaSemanal(
  companyId: string | undefined,
  ahora: number,
): Promise<number[]> {
  const desde = ahora - SEMANAS_TENDENCIA * MS_POR_SEMANA;

  const filas = await db
    .select({
      // Semana 0 es la actual; 11, la más antigua del rango.
      semana: sql<number>`CAST((${ahora} - ${reports.createdAt}) / ${MS_POR_SEMANA} AS INTEGER)`,
      total: sql<number>`COUNT(*)`,
    })
    .from(reports)
    .where(
      and(
        eq(reports.type, "servicio"),
        companyId ? eq(reports.companyId, companyId) : undefined,
        gte(reports.createdAt, new Date(desde)),
      ),
    )
    .groupBy(sql`1`);

  const puntos = new Array<number>(SEMANAS_TENDENCIA).fill(0);
  for (const fila of filas) {
    const semana = Number(fila.semana);
    if (semana >= 0 && semana < SEMANAS_TENDENCIA) {
      // Se invierte para que el arreglo vaya de lo más antiguo a lo más
      // reciente, que es como se lee una gráfica de izquierda a derecha.
      puntos[SEMANAS_TENDENCIA - 1 - semana] = Number(fila.total);
    }
  }

  return puntos;
}

export async function obtenerResumen(
  companyId?: string,
): Promise<ResumenPanel> {
  const ahora = Date.now();
  const esteMes = inicioDeMes(0);
  const mesPasado = inicioDeMes(1);

  // El panel resume reportes de servicio: son los que tienen documento, firma
  // y orden de compra que rastrear. Un reporte de viáticos se consulta desde
  // el reporte de servicio al que justifica, no aquí.
  const deEstaEmpresa = and(
    eq(reports.type, "servicio"),
    companyId ? eq(reports.companyId, companyId) : undefined,
  );

  const enEsteMes = and(deEstaEmpresa, gte(reports.createdAt, esteMes));
  const enMesAnterior = and(
    deEstaEmpresa,
    gte(reports.createdAt, mesPasado),
    lt(reports.createdAt, esteMes),
  );

  const terminado = eq(reports.status, "terminado");

  // `${reports.id}` sin calificar renderiza como "id" a secas, que dentro de
  // este subselect resuelve contra attachments.id (su propia clave) en vez
  // del reports.id de fuera — las dos tablas tienen una columna "id". Con la
  // tabla calificada a mano no hay ambigüedad posible.
  const sinAdjuntos = sql`(
    SELECT COUNT(*) FROM attachments WHERE attachments.report_id = reports.id
  ) = 0`;

  const [
    reportesDelMes,
    reportesMesAnterior,
    terminadosDelMes,
    terminadosMesAnterior,
    incompletos,
    sinFirma,
    totalHistorico,
    empleados,
    tendencia,
  ] = await Promise.all([
    contar(enEsteMes),
    contar(enMesAnterior),
    contar(and(enEsteMes, terminado)),
    contar(and(enMesAnterior, terminado)),
    contar(and(deEstaEmpresa, terminado, sinAdjuntos)),
    contar(and(deEstaEmpresa, terminado, sql`${reports.signatureUrl} IS NULL`)),
    contar(deEstaEmpresa),

    // DISTINCT: sin filtro de empresa, un empleado con acceso a las dos
    // aparece en dos filas de user_companies y se contaría dos veces.
    db
      .select({ total: sql<number>`COUNT(DISTINCT ${users.id})` })
      .from(userCompanies)
      .innerJoin(users, eq(users.id, userCompanies.userId))
      .where(
        and(
          companyId ? eq(userCompanies.companyId, companyId) : undefined,
          eq(users.isActive, true),
        ),
      ),

    tendenciaSemanal(companyId, ahora),
  ]);

  return {
    reportesDelMes,
    reportesMesAnterior,
    terminadosDelMes,
    terminadosMesAnterior,
    incompletos,
    sinFirma,
    totalHistorico,
    empleadosActivos: Number(empleados[0]?.total ?? 0),
    tendencia,
  };
}

/**
 * Empleados para el filtro de la lista global. Sin `companyId`, los de las
 * dos empresas (con DISTINCT, por la misma razón que el conteo de arriba).
 */
export async function empleadosDeEmpresa(
  companyId?: string,
): Promise<{ id: string; fullName: string }[]> {
  const filas = await db
    .selectDistinct({ id: users.id, fullName: users.fullName })
    .from(userCompanies)
    .innerJoin(users, eq(users.id, userCompanies.userId))
    .where(
      and(
        companyId ? eq(userCompanies.companyId, companyId) : undefined,
        eq(users.isActive, true),
      ),
    )
    .orderBy(users.fullName);

  return filas;
}
