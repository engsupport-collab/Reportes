import type { EtiquetaTrabajo, TipoServicio } from "@/lib/etiquetas";

import mensajesEn from "../../messages/en.json";
import mensajesEs from "../../messages/es.json";

/**
 * En qué idioma sale el PDF de un reporte, y el correo que lo lleva.
 *
 * Lo decide la empresa del reporte, no el idioma de la pantalla de quien lo
 * genera: los de la LLC (Estados Unidos) salen en inglés y los de la SAS
 * (Colombia) en español. El documento lo recibe el cliente final, y el mismo
 * reporte se arma en tres sitios —la descarga, el enlace público y el correo
 * al terminar—: si dependiera de la pantalla, un técnico con el teléfono en
 * español le mandaría en español a un cliente de Estados Unidos, y el enlace
 * público, que no tiene sesión, no sabría cuál usar.
 *
 * Solo cambian los textos fijos y las fechas. Lo que escribió el técnico —el
 * detalle, los nombres— va tal como lo escribió.
 *
 * Solo de servidor: trae los diccionarios completos de dos idiomas. Desde un
 * componente de cliente se importa, como mucho, el tipo `IdiomaPdf`.
 */
export type IdiomaPdf = "es" | "en";

/** `corp` es la LLC. Cualquier otra empresa, hoy solo la SAS, va en español. */
export function idiomaDeEmpresa(companyId: string): IdiomaPdf {
  return companyId === "corp" ? "en" : "es";
}

/**
 * Tipo de servicio y etiquetas, con las mismas palabras que la pantalla en ese
 * idioma: salen del diccionario de la interfaz, no de una copia. El tipo exige
 * una entrada por cada id del catálogo.
 */
type Clasificacion = Record<TipoServicio | EtiquetaTrabajo, string>;

const CLASIFICACION: Record<IdiomaPdf, Clasificacion> = {
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

const TEXTOS: Record<IdiomaPdf, TextosPdf> = { es: ES, en: EN };

/** Los textos fijos de un documento, en el idioma que le toca a su empresa. */
export function textosDeEmpresa(companyId: string): TextosPdf {
  return TEXTOS[idiomaDeEmpresa(companyId)];
}
