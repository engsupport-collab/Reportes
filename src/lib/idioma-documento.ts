/**
 * En qué idioma sale lo que recibe un cliente: el PDF de su reporte y el
 * correo que lo lleva.
 *
 * Lo decide **el cliente**, no la empresa que le factura ni la pantalla de
 * quien genera el documento. Primero se probó por empresa —LLC en inglés, SAS
 * en español— y en uso real no sirvió: los clientes de Estados Unidos también
 * se atienden desde la SAS, y a uno le llegó el reporte en español. Cada
 * cliente del catálogo lleva marcado su idioma (`clients.document_language`).
 *
 * Y quien envía un reporte tiene la última palabra: junto al correo de quien
 * firma se elige en qué idioma sale ese reporte, con el del cliente ya
 * marcado. Así, aunque el reporte haya quedado en la cotización o el cliente
 * que no era, el idioma se corrige ahí mismo, también después de terminado.
 *
 * La regla por empresa queda como valor de partida: es el idioma que se
 * propone al crear un cliente, y el que vale para los que nadie ha marcado.
 *
 * Son menos idiomas que los de la interfaz (`idiomas.ts`): un documento solo
 * sale en los que tienen sus textos escritos en `pdf-idioma.ts`.
 *
 * Este archivo no depende del servidor: lo usan el formulario de clientes, la
 * validación y el generador de documentos.
 */
export const IDIOMAS_DOCUMENTO = ["es", "en"] as const;
export type IdiomaDocumento = (typeof IDIOMAS_DOCUMENTO)[number];

export function esIdiomaDeDocumento(valor: unknown): valor is IdiomaDocumento {
  return (IDIOMAS_DOCUMENTO as readonly unknown[]).includes(valor);
}

/** `corp` es la LLC. Cualquier otra empresa, hoy solo la SAS, parte en español. */
export function idiomaDeEmpresa(companyId: string): IdiomaDocumento {
  return companyId === "corp" ? "en" : "es";
}

/**
 * El idioma de un cliente: el que tiene marcado y, si no tiene ninguno —los
 * que ya existían cuando se agregó el dato—, el de su empresa.
 */
export function idiomaDeCliente(
  marcado: string | null | undefined,
  companyId: string,
): IdiomaDocumento {
  return esIdiomaDeDocumento(marcado) ? marcado : idiomaDeEmpresa(companyId);
}

/**
 * En qué idioma salen el PDF y el correo de un reporte.
 *
 * El de servicio lo recibe el cliente: va en el que se eligió para ese
 * reporte y, si nadie eligió, en el de su cliente (`idiomaDelCliente` es lo
 * que tiene marcado el de su cotización; un reporte sin cotización no tiene
 * ninguno). El de viáticos es interno y nunca sale de la empresa: va en el de
 * la empresa, sea quien sea el cliente.
 */
export function idiomaDeReporte(
  reporte: {
    type: "servicio" | "viaticos";
    companyId: string;
    documentLanguage?: string | null;
  },
  idiomaDelCliente: string | null | undefined,
): IdiomaDocumento {
  if (reporte.type === "viaticos") return idiomaDeEmpresa(reporte.companyId);
  if (esIdiomaDeDocumento(reporte.documentLanguage)) return reporte.documentLanguage;
  return idiomaDeCliente(idiomaDelCliente, reporte.companyId);
}

/**
 * Lo que se guarda en el reporte cuando alguien elige su idioma: nada si es
 * el mismo que ya le tocaba por su cliente, y el elegido si es otro. Guardarlo
 * siempre dejaría al reporte sordo a un cambio posterior en el catálogo: el
 * día que se marque a su cliente en inglés, seguiría saliendo en español.
 */
export function idiomaPropioDeReporte(
  elegido: IdiomaDocumento,
  idiomaDelCliente: IdiomaDocumento,
): IdiomaDocumento | null {
  return elegido === idiomaDelCliente ? null : elegido;
}
