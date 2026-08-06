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
 * Catálogo de la bitácora de eventos de un reporte (`report_events`). Hoy
 * solo se registran estos dos, pero la tabla no está pensada solo para
 * ellos — es una bitácora de auditoría genérica, y añadir un tercer tipo de
 * evento el día que haga falta es agregar un valor aquí, no rediseñar nada.
 */
export const REPORT_EVENT_TYPES = ["finalizado", "reabierto"] as const;
export type ReportEventType = (typeof REPORT_EVENT_TYPES)[number];

/** Ruta de inicio según el rol, tras iniciar sesión. */
export function rutaInicio(role: UserRole): string {
  return role === "admin" ? "/admin" : "/reportes";
}
