/**
 * Estados de una cotización.
 *
 * Este archivo no depende del servidor: lo usan el formulario, las listas y las
 * consultas. Es el mismo patrón de `etiquetas.ts` — un catálogo en un solo
 * sitio, para que agregar un estado no obligue a acordarse de tocarlo en varios.
 *
 * Las etiquetas visibles NO viven aquí: salen de `messages/*.json`, porque la
 * interfaz está en tres idiomas. Aquí solo están los identificadores, que son
 * lo que se guarda en la base y nunca se traduce.
 */

export const ESTADOS_COTIZACION = [
  "pendiente_autorizacion",
  "en_curso",
  "finalizada",
  "cancelada",
] as const;

export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];

/**
 * Los estados en los que una cotización sigue disponible para trabajar.
 *
 * "Pendiente por autorización" cuenta como activa a propósito: el cliente
 * puede haber dado el visto bueno de palabra y el trabajo ya estar en marcha
 * aunque no haya llegado la orden de compra. Dejarla fuera obligaría al
 * técnico a inventarse una cotización que sí existe.
 *
 * Ojo con el nombre: se refiere a la autorización del CLIENTE, no a un
 * permiso interno. Ninguna cotización nace aquí — el estado por defecto es
 * "en curso" — y que la haya creado un técnico se marca con `revisada`, no
 * con el estado. Ver el comentario de `quotes.status` en el esquema.
 */
export const ESTADOS_ACTIVOS = [
  "pendiente_autorizacion",
  "en_curso",
] as const satisfies readonly EstadoCotizacion[];

export function esEstadoCotizacion(valor: string): valor is EstadoCotizacion {
  return (ESTADOS_COTIZACION as readonly string[]).includes(valor);
}

export function esEstadoActivo(valor: string): boolean {
  return (ESTADOS_ACTIVOS as readonly string[]).includes(valor);
}
