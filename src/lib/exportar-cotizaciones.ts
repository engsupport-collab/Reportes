import { type EstadoCotizacion, finalizacionVigente } from "./cotizaciones";
import { type ValorCsv, aCsv } from "./csv";
import { aTextoLocal, aValorInput } from "./fechas";
import type { CotizacionEnLista } from "./queries/quotes";

/**
 * Qué lleva el archivo exportado de cotizaciones, fila por fila. Aparte de la
 * ruta que lo entrega para poder probarlo sin servidor ni sesión.
 *
 * Las fechas van como "AAAA-MM-DD" (la de entrega, que es un día de
 * calendario) y "AAAA-MM-DD HH:MM" en hora de Colombia (creación y
 * finalización): así Excel las reconoce como fechas en cualquier idioma, y el
 * encabezado dice en qué hora están. El valor va como número, sin símbolo, con
 * su moneda en la columna de al lado, para que se pueda sumar.
 *
 * Una fecha de finalización escrita a mano va solo con el día ("AAAA-MM-DD"):
 * la hora no se conoce. Las dos últimas columnas dicen quién la escribió y
 * cuándo; vacías si la puso el sistema.
 */
export type TextosExportacion = {
  /** En este orden: número, proyecto, cliente, empresa, estado, orden de compra, entrega, valor, moneda, creada, finalizada, revisada, fecha registrada por, fecha registrada el. */
  encabezados: string[];
  estado: (estado: EstadoCotizacion) => string;
  sinFechaRegistrada: string;
  si: string;
  no: string;
};

export function filasDeExportacion(
  items: CotizacionEnLista[],
  textos: TextosExportacion,
): ValorCsv[][] {
  return items.map((c) => {
    const finalizada = finalizacionVigente(c);
    const manual = Boolean(finalizada && c.finalizacionRegistradaEl);
    return [
      c.quoteNumber,
      c.projectName,
      c.clientName,
      c.companyName,
      textos.estado(c.status),
      c.purchaseOrderNo,
      c.dueDate ? aValorInput(c.dueDate) : null,
      c.amount,
      c.amount !== null ? c.currency : null,
      aTextoLocal(c.createdAt),
      finalizada
        ? manual
          ? aValorInput(finalizada)
          : aTextoLocal(finalizada)
        : c.status === "finalizada"
          ? textos.sinFechaRegistrada
          : null,
      c.revisada ? textos.si : textos.no,
      manual ? c.finalizacionRegistradaPor : null,
      manual ? aTextoLocal(c.finalizacionRegistradaEl!) : null,
    ];
  });
}

export function csvDeCotizaciones(
  items: CotizacionEnLista[],
  textos: TextosExportacion,
): string {
  return aCsv(textos.encabezados, filasDeExportacion(items, textos));
}
