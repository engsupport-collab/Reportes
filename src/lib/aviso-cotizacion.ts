import mensajes from "../../messages/es.json";

import { formatFechaLarga, formatInstante } from "./fechas";
import { formatearMonto } from "./moneda";
import type { CotizacionCompleta } from "./queries/quotes";

/**
 * El aviso por correo de que se creó una cotización: qué dice y cómo queda
 * anotado. Sin base de datos ni envío —eso vive en `correo-cotizacion.ts`—,
 * para poder probar el texto sin mandar nada.
 *
 * Es un correo interno: va siempre en español, sea cual sea el idioma del
 * cliente de la cotización o el de la pantalla de quien la creó.
 */

/** Lo que queda anotado en `quotes.creation_notice`. */
export type AvisoDeCotizacion =
  | { ok: true; para: string[]; cuando: string }
  | { ok: false; causa: string; cuando: string };

/** Lee lo anotado sin fiarse de lo que haya: un JSON roto es "sin aviso". */
export function leerAviso(texto: string | null): AvisoDeCotizacion | null {
  if (!texto) return null;
  try {
    const valor = JSON.parse(texto) as Partial<AvisoDeCotizacion> | null;
    if (!valor || typeof valor.cuando !== "string") return null;
    if (valor.ok === true && Array.isArray(valor.para)) {
      return { ok: true, para: valor.para.map(String), cuando: valor.cuando };
    }
    if (valor.ok === false && typeof valor.causa === "string") {
      return { ok: false, causa: valor.causa, cuando: valor.cuando };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * El asunto y el texto del aviso.
 *
 * Lo que no se llenó se dice ("Sin asignar"), en vez de omitir el renglón: en
 * un plan de pendientes, que una cotización no tenga orden de compra es
 * justamente un pendiente.
 */
export function textoDelAviso(
  cotizacion: CotizacionCompleta,
  enlace: string | null,
): { asunto: string; cuerpo: string } {
  const numero = cotizacion.quoteNumber ?? "sin número";

  const cuerpo = [
    "Se creó una cotización nueva en el Gestor de Reportes.",
    "",
    `Número: ${numero}`,
    `Proyecto: ${cotizacion.projectName}`,
    `Cliente: ${cotizacion.clientName}`,
    `Empresa: ${cotizacion.companyName}`,
    `Estado: ${mensajes.estadosCotizacion[cotizacion.status]}`,
    `Orden de compra: ${cotizacion.purchaseOrderNo ?? "Sin asignar"}`,
    `Fecha comprometida de entrega: ${
      cotizacion.dueDate ? formatFechaLarga(cotizacion.dueDate) : "Sin definir"
    }`,
    `Valor cotizado: ${
      cotizacion.amount !== null
        ? formatearMonto(cotizacion.amount, cotizacion.currency)
        : "Sin definir"
    }`,
    `Creada por: ${cotizacion.createdByName}, el ${formatInstante(cotizacion.createdAt)}`,
    ...(cotizacion.revisada
      ? []
      : ["", "Se creó desde campo, con lo mínimo: falta revisarla y completar sus datos."]),
    // La descripción viene de un formulario, con sus saltos como CR+LF: se
    // dejan como los del resto del texto.
    ...(cotizacion.description
      ? ["", "Descripción:", cotizacion.description.replace(/\r\n?/g, "\n")]
      : []),
    ...(enlace ? ["", `Abrirla en el sistema: ${enlace}`] : []),
  ].join("\n");

  return { asunto: `Nueva cotización ${numero} — ${cotizacion.projectName}`, cuerpo };
}
