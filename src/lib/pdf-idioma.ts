import type { EtiquetaTrabajo, TipoServicio } from "@/lib/etiquetas";
import type { IdiomaDocumento } from "@/lib/idioma-documento";

import mensajesEn from "../../messages/en.json";
import mensajesEs from "../../messages/es.json";

/**
 * Los textos fijos del PDF de un reporte y del correo que lo lleva, en cada
 * idioma en que pueden salir.
 *
 * Cuál le toca a cada documento no se decide aquí sino en
 * `idioma-documento.ts`: es el del cliente que lo recibe. Nunca el de la
 * pantalla de quien lo genera — el mismo reporte se arma desde la descarga, el
 * enlace público y el correo al terminar, y dos de los tres no tienen pantalla
 * con idioma.
 *
 * Solo cambian los textos fijos y las fechas. Lo que escribió el técnico —el
 * detalle, los nombres— va tal como lo escribió.
 *
 * Solo de servidor: trae los diccionarios completos de dos idiomas.
 */

/**
 * Tipo de servicio y etiquetas, con las mismas palabras que la pantalla en ese
 * idioma: salen del diccionario de la interfaz, no de una copia. El tipo exige
 * una entrada por cada id del catálogo.
 */
type Clasificacion = Record<TipoServicio | EtiquetaTrabajo, string>;

const CLASIFICACION: Record<IdiomaDocumento, Clasificacion> = {
  es: mensajesEs.etiquetas,
  en: mensajesEn.etiquetas,
};

const ES = {
  /** Con qué formato van las fechas: "4 de octubre de 2026". */
  locale: "es-CO",
  reporteServicio: "Reporte de servicio",
  reporteViaticos: "Reporte de viáticos",
  terminado: "Terminado",
  enProceso: "En proceso",
  cliente: "Cliente",
  cotizacion: "Cotización",
  ordenCompra: "Orden de compra",
  fechaTrabajo: "Fecha del trabajo",
  tipoServicio: "Tipo de servicio",
  etiquetas: "Etiquetas",
  creadoPor: "Creado por",
  creadoEl: "Creado el",
  sinAsignar: "Sin asignar",
  sinDefinir: "Sin definir",
  ninguna: "Ninguna",
  detalles: "Detalles del trabajo",
  sinDetalles: "Sin detalles.",
  continuacion: (titulo: string) => `${titulo} (continuación)`,
  adjunto: (i: number, total: number) => `Adjunto ${i} de ${total}`,
  justificaA: "Justifica a",
  total: "Total",
  gastos: (cuantos: number) => `Gastos (${cuantos})`,
  gasto: (i: number, total: number) => `Gasto ${i} de ${total}`,
  sinConcepto: "Sin concepto",
  sinMonto: "Sin monto",
  noIncluidos: "Archivos no incluidos",
  noIncluidosNota:
    "No entraron en este documento: por su formato (Word, Excel u otro), porque no se pudieron leer o porque no cabían. Descárguelos por separado desde el reporte.",
  firmas: "Firmas",
  quienReporta: "Quien reporta",
  firmaCliente: "Firma del cliente",
  firmadoEl: (fecha: string) => `Firmado el ${fecha}`,
  pendienteDeFirma: "Pendiente de firma",
  pagina: (i: number, total: number) => `Página ${i} de ${total}`,
  aviso: (fecha: string) =>
    `Documento generado electrónicamente el ${fecha} — confidencial, uso exclusivo del destinatario.`,
  clasificacion: CLASIFICACION.es,
  correoAsunto: (proyecto: string) => `Reporte firmado — ${proyecto}`,
  correoCuerpo: (
    firmante: string,
    proyecto: string,
    enlace: string | null,
    remitente: string,
  ) =>
    [
      `Hola ${firmante},`,
      "",
      `Adjunto encontrarás el reporte firmado del proyecto "${proyecto}".`,
      ...(enlace ? ["", `También puedes consultarlo en línea: ${enlace}`] : []),
      "",
      "Gracias,",
      remitente,
    ].join("\n"),
};

export type TextosPdf = typeof ES;

const EN: TextosPdf = {
  locale: "en-US",
  reporteServicio: "Service report",
  reporteViaticos: "Travel expense report",
  terminado: "Completed",
  enProceso: "In progress",
  cliente: "Client",
  cotizacion: "Quote",
  ordenCompra: "Purchase order",
  fechaTrabajo: "Work date",
  tipoServicio: "Service type",
  etiquetas: "Tags",
  creadoPor: "Created by",
  creadoEl: "Created on",
  sinAsignar: "Not assigned",
  sinDefinir: "Not set",
  ninguna: "None",
  detalles: "Work details",
  sinDetalles: "No details.",
  continuacion: (titulo) => `${titulo} (continued)`,
  adjunto: (i, total) => `Attachment ${i} of ${total}`,
  justificaA: "For project",
  total: "Total",
  gastos: (cuantos) => `Expenses (${cuantos})`,
  gasto: (i, total) => `Expense ${i} of ${total}`,
  sinConcepto: "No description",
  sinMonto: "No amount",
  noIncluidos: "Files not included",
  noIncluidosNota:
    "Not included in this document: because of their format (Word, Excel or other), because they could not be read, or because they did not fit. Download them separately from the report.",
  firmas: "Signatures",
  quienReporta: "Reported by",
  firmaCliente: "Client signature",
  firmadoEl: (fecha) => `Signed on ${fecha}`,
  pendienteDeFirma: "Pending signature",
  pagina: (i, total) => `Page ${i} of ${total}`,
  aviso: (fecha) =>
    `Document generated electronically on ${fecha} — confidential, for the exclusive use of the recipient.`,
  clasificacion: CLASIFICACION.en,
  correoAsunto: (proyecto) => `Signed report — ${proyecto}`,
  correoCuerpo: (firmante, proyecto, enlace, remitente) =>
    [
      `Hello ${firmante},`,
      "",
      `Attached is the signed report for the project "${proyecto}".`,
      ...(enlace ? ["", `You can also view it online: ${enlace}`] : []),
      "",
      "Thank you,",
      remitente,
    ].join("\n"),
};

const TEXTOS: Record<IdiomaDocumento, TextosPdf> = { es: ES, en: EN };

/** Los textos fijos de un documento, en el idioma en que sale. */
export function textosPdf(idioma: IdiomaDocumento): TextosPdf {
  return TEXTOS[idioma];
}
