import "server-only";

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { attachments, reportTags, reports } from "@/db/schema";

/**
 * Analíticas de una empresa.
 *
 * A diferencia de `dashboard.ts`, aquí `companyId` es obligatorio: estas
 * pantallas son siempre de una empresa concreta, porque mezclar los números de
 * Corp y SaaS en una sola gráfica no responde ninguna pregunta que alguien se
 * haga de verdad.
 *
 * Todo se agrega en SQL. Traer las filas para contarlas en memoria funcionaría
 * con los reportes de hoy y dejaría de funcionar sin avisar cuando sean miles.
 */

export type PuntoMes = {
  /** "2026-08" — sirve de clave y de orden. */
  mes: string;
  etiqueta: string;
  total: number;
};

export type Segmento = { nombre: string; total: number };

export type Analiticas = {
  total: number;
  terminados: number;
  enProceso: number;
  sinDocumento: number;
  sinFirma: number;
  sinOrden: number;
  porMes: PuntoMes[];
  porServicio: Segmento[];
  porEtiqueta: Segmento[];
  topClientes: Segmento[];
};

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * Los últimos 12 meses, incluidos los que no tuvieron ningún reporte.
 *
 * SQL solo devuelve los meses con filas. Si se pintara eso tal cual, un mes sin
 * trabajo desaparecería del eje en vez de mostrarse como un valle, y la gráfica
 * mentiría sobre el ritmo real.
 */
function ultimosDoceMeses(): PuntoMes[] {
  const hoy = new Date();
  const puntos: PuntoMes[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    puntos.push({ mes, etiqueta: MESES[d.getMonth()]!, total: 0 });
  }

  return puntos;
}

/**
 * Serie de reportes por mes, sola.
 *
 * Aquí `companyId` sí es opcional —`undefined` suma las dos empresas— porque
 * el panel del admin muestra justamente eso. Es la única parte de estas
 * analíticas donde mezclar tiene sentido: "cuánto trabajo entra al mes" es una
 * pregunta del negocio entero, no de una empresa concreta.
 */
export async function serieMensual(
  companyId?: string,
): Promise<PuntoMes[]> {
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);

  const filas = await db
    .select({
      mes: sql<string>`strftime('%Y-%m', ${reports.createdAt} / 1000, 'unixepoch')`,
      n: sql<number>`COUNT(*)`,
    })
    .from(reports)
    .where(
      companyId
        ? and(eq(reports.companyId, companyId), gte(reports.createdAt, desde))
        : gte(reports.createdAt, desde),
    )
    .groupBy(sql`1`);

  const puntos = ultimosDoceMeses();
  const indice = new Map(puntos.map((p, i) => [p.mes, i]));
  for (const fila of filas) {
    const i = indice.get(fila.mes);
    if (i !== undefined) puntos[i]!.total = Number(fila.n);
  }
  return puntos;
}

export type EstadoDocumental = {
  completados: number;
  sinDocumento: number;
  sinFirma: number;
  sinOrden: number;
};

/**
 * En qué estado documental están los reportes terminados.
 *
 * Los cuatro números NO suman el total y no deben leerse como un reparto: un
 * mismo reporte puede estar a la vez sin documento y sin firma, así que
 * aparece en las dos barras. La pregunta que responden es "¿cuántos arrastran
 * cada carencia?", no "¿cómo se divide el total?".
 *
 * "Completado" es el terminado al que no le falta nada: tiene adjunto, firma y
 * número de orden.
 */
export async function estadoDocumental(
  companyId?: string,
): Promise<EstadoDocumental> {
  const deLaEmpresa = companyId ? eq(reports.companyId, companyId) : undefined;
  const terminado = eq(reports.status, "terminado");

  const conAdjunto = sql`EXISTS (SELECT 1 FROM ${attachments} WHERE ${attachments.reportId} = ${reports.id})`;

  const contar = async (condicion: ReturnType<typeof and>): Promise<number> => {
    const [fila] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(reports)
      .where(condicion);
    return Number(fila?.n ?? 0);
  };

  const [completados, sinDocumento, sinFirma, sinOrden] = await Promise.all([
    contar(
      and(
        deLaEmpresa,
        terminado,
        conAdjunto,
        sql`${reports.signatureUrl} IS NOT NULL`,
        sql`${reports.purchaseOrderNo} IS NOT NULL`,
      ),
    ),
    contar(and(deLaEmpresa, terminado, sql`NOT ${conAdjunto}`)),
    contar(and(deLaEmpresa, terminado, isNull(reports.signatureUrl))),
    contar(and(deLaEmpresa, terminado, isNull(reports.purchaseOrderNo))),
  ]);

  return { completados, sinDocumento, sinFirma, sinOrden };
}

export async function obtenerAnaliticas(
  companyId: string,
): Promise<Analiticas> {
  const deLaEmpresa = eq(reports.companyId, companyId);

  const contar = async (condicion: ReturnType<typeof and>): Promise<number> => {
    const [fila] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(reports)
      .where(condicion);
    return Number(fila?.n ?? 0);
  };

  // Doce meses atrás desde el primer día del mes actual.
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1).getTime();

  const [
    total,
    terminados,
    sinFirma,
    sinOrden,
    filasMes,
    filasServicio,
    filasEtiqueta,
    filasClientes,
    filasSinDocumento,
  ] = await Promise.all([
    contar(deLaEmpresa),
    contar(and(deLaEmpresa, eq(reports.status, "terminado"))),
    contar(
      and(
        deLaEmpresa,
        eq(reports.status, "terminado"),
        isNull(reports.signatureUrl),
      ),
    ),
    contar(and(deLaEmpresa, isNull(reports.purchaseOrderNo))),

    db
      .select({
        // strftime sobre milisegundos: la columna guarda el instante en ms y
        // SQLite espera segundos, de ahí la división.
        mes: sql<string>`strftime('%Y-%m', ${reports.createdAt} / 1000, 'unixepoch')`,
        n: sql<number>`COUNT(*)`,
      })
      .from(reports)
      .where(and(deLaEmpresa, gte(reports.createdAt, new Date(desde))))
      .groupBy(sql`1`),

    db
      .select({ nombre: reports.serviceType, n: sql<number>`COUNT(*)` })
      .from(reports)
      .where(deLaEmpresa)
      .groupBy(reports.serviceType),

    db
      .select({ nombre: reportTags.tag, n: sql<number>`COUNT(*)` })
      .from(reportTags)
      .innerJoin(reports, eq(reports.id, reportTags.reportId))
      .where(deLaEmpresa)
      .groupBy(reportTags.tag),

    db
      .select({ nombre: reports.clientName, n: sql<number>`COUNT(*)` })
      .from(reports)
      .where(deLaEmpresa)
      .groupBy(reports.clientName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(6),

    // "Sin documento" es terminado y sin ningún adjunto. Se resuelve con un
    // NOT EXISTS y no contando adjuntos por reporte: basta saber si hay al
    // menos uno, y así no se recorre la tabla entera.
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(reports)
      .where(
        and(
          deLaEmpresa,
          eq(reports.status, "terminado"),
          sql`NOT EXISTS (SELECT 1 FROM ${attachments} WHERE ${attachments.reportId} = ${reports.id})`,
        ),
      ),
  ]);

  // Los meses vacíos ya están en la plantilla; esto solo rellena los que tienen.
  const porMes = ultimosDoceMeses();
  const indice = new Map(porMes.map((p, i) => [p.mes, i]));
  for (const fila of filasMes) {
    const i = indice.get(fila.mes);
    if (i !== undefined) porMes[i]!.total = Number(fila.n);
  }

  const etiquetaServicio: Record<string, string> = {
    electrico: "Eléctrico",
    mecanico: "Mecánico",
  };
  const etiquetaTrabajo: Record<string, string> = {
    preventivo: "Mantenimiento preventivo",
    urgencia: "Urgencia",
    online: "Trabajo online",
    proyecto: "Proyecto",
  };

  const ordenar = (a: Segmento, b: Segmento) => b.total - a.total;

  return {
    total,
    terminados,
    enProceso: total - terminados,
    sinDocumento: Number(filasSinDocumento[0]?.n ?? 0),
    sinFirma,
    sinOrden,
    porMes,
    porServicio: filasServicio
      .map((f) => ({
        nombre: etiquetaServicio[f.nombre ?? ""] ?? "Sin definir",
        total: Number(f.n),
      }))
      .sort(ordenar),
    porEtiqueta: filasEtiqueta
      .map((f) => ({
        nombre: etiquetaTrabajo[f.nombre] ?? f.nombre,
        total: Number(f.n),
      }))
      .sort(ordenar),
    topClientes: filasClientes.map((f) => ({
      nombre: f.nombre,
      total: Number(f.n),
    })),
  };
}
