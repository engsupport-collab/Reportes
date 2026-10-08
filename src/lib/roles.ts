/**
 * Tipos compartidos de rol y estado.
 *
 * Viven en su propio módulo, sin dependencias, a propósito: el middleware corre
 * en Edge Runtime y se ejecuta en *cada* petición. Si importara estos tipos
 * desde src/db/schema.ts, arrastraría Drizzle entero al bundle del middleware y
 * encarecería todas las peticiones. Ver PLAN.md, sección 7.1.
 */

/**
 * "contable" nace con exactamente los mismos permisos que "empleado" — es una
 * implementación temporal. Más adelante tendrá su propia capa de permisos
 * (acceso solo a lo financiero y a viáticos); hasta entonces, cualquier
 * comprobación de acceso debe tratarlo como empleado, nunca excluirlo por
 * comparar contra `"empleado"` en positivo. Ver auth-guard.ts.
 */
export const USER_ROLES = ["admin", "empleado", "contable"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REPORT_STATUSES = ["en_proceso", "terminado"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Catálogo de la bitácora de eventos de un reporte (`report_events`): una
 * bitácora de auditoría genérica, donde añadir un tipo de evento es agregar un
 * valor aquí, no rediseñar nada. La columna es texto libre en la base, así que
 * un tipo nuevo no pide migración.
 *
 * Los tres de correo existen porque el envío al cliente no dejaba rastro: si
 * el correo no salía, no había forma de saber después si se intentó, a qué
 * dirección ni por qué falló. El del idioma, porque cambiarlo con el reporte
 * ya firmado cambia lo que recibe el cliente sin tocar nada de lo que firmó.
 */
export const REPORT_EVENT_TYPES = [
  "finalizado",
  "reabierto",
  "correo_enviado",
  "correo_fallido",
  "correo_corregido",
  "idioma_cambiado",
] as const;
export type ReportEventType = (typeof REPORT_EVENT_TYPES)[number];

/** Ruta de inicio según el rol, tras iniciar sesión. */
export function rutaInicio(role: UserRole): string {
  return role === "admin" ? "/admin" : "/reportes";
}
