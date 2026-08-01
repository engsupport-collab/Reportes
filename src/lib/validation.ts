import { z } from "zod";

import { TIPOS_SERVICIO_IDS, esEtiquetaValida } from "./etiquetas";
import { parseFechaISO } from "./fechas";
import { PASSWORD_MIN_LENGTH } from "./password";
import { REPORT_STATUSES, USER_ROLES } from "./roles";

/**
 * Esquemas de validación.
 *
 * Todo lo que llega del navegador se valida aquí antes de tocar la base de
 * datos, sin excepción. La validación del formulario en el cliente es para
 * comodidad del usuario; esta es la que cuenta, porque una Server Action puede
 * invocarse con cualquier contenido, sin pasar por el formulario.
 */

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Ingresa tu usuario")
    .max(60, "Usuario demasiado largo"),
  password: z
    .string()
    .min(1, "Ingresa tu contraseña")
    .max(200, "Contraseña demasiado larga"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const nuevaContrasenaSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
  )
  .max(200, "Contraseña demasiado larga");

/**
 * Reporte de trabajo.
 *
 * Los límites de longitud no son decorativos: sin ellos, alguien puede mandar
 * un campo de varios megabytes por una Server Action y llenar la base.
 */
export const reporteSchema = z.object({
  projectName: z
    .string()
    .trim()
    .min(1, "Ingresa el nombre del proyecto")
    .max(200, "El nombre del proyecto es demasiado largo"),
  purchaseOrderNo: z
    .string()
    .trim()
    .min(1, "Ingresa el número de orden de compra")
    .max(60, "El número de orden es demasiado largo"),
  clientName: z
    .string()
    .trim()
    .min(1, "Ingresa el cliente")
    .max(200, "El nombre del cliente es demasiado largo"),
  workDate: z
    .string()
    .trim()
    .min(1, "Ingresa la fecha del trabajo")
    .transform((valor, ctx) => {
      const fecha = parseFechaISO(valor);
      if (!fecha) {
        ctx.addIssue({ code: "custom", message: "Fecha inválida" });
        return z.NEVER;
      }
      return fecha;
    }),
  serviceType: z.enum(TIPOS_SERVICIO_IDS, {
    message: "Indica si el trabajo fue eléctrico o mecánico",
  }),
  details: z
    .string()
    .trim()
    .min(1, "Describe el trabajo realizado")
    .max(5000, "Los detalles no pueden superar los 5000 caracteres"),
});

export type ReporteInput = z.infer<typeof reporteSchema>;

/**
 * Etiquetas enviadas desde el formulario.
 *
 * Se descartan en silencio los valores que no estén en el catálogo, en vez de
 * rechazar todo el formulario: si alguien manipula la petición, el reporte se
 * guarda sin esa etiqueta inventada y no se pierde el trabajo escrito. Lo que
 * no puede pasar es que un valor arbitrario llegue a la base.
 */
export function leerEtiquetas(valores: (FormDataEntryValue | null)[]): string[] {
  const limpias = valores
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(esEtiquetaValida);

  return [...new Set(limpias)];
}

export const estadoReporteSchema = z.enum(REPORT_STATUSES);

/**
 * Nombre de usuario para cuentas nuevas.
 *
 * Restringido a minúsculas, números, puntos y guiones — nada de espacios ni
 * símbolos. Es lo que la persona va a escribir para iniciar sesión; un nombre
 * con caracteres raros es una fuente segura de errores de tipeo.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "El usuario debe tener al menos 3 caracteres")
  .max(40, "El usuario es demasiado largo")
  .regex(
    /^[a-z0-9._-]+$/,
    "Solo minúsculas, números, puntos, guiones y guiones bajos",
  );

export const crearUsuarioSchema = z
  .object({
    username: usernameSchema,
    fullName: z
      .string()
      .trim()
      .min(1, "Ingresa el nombre completo")
      .max(120, "El nombre es demasiado largo"),
    role: z.enum(USER_ROLES),
    companyIds: z.array(z.string()).default([]),
  })
  .refine(
    // Al menos una empresa, pero solo para un empleado: sin ninguna, no
    // podría entrar nunca — quedaría creado pero inservible. El admin no
    // depende de esto para nada: ve las dos empresas siempre, por definición
    // del rol, así que exigirle elegir sería pedirle algo que no usa.
    (data) => data.role !== "empleado" || data.companyIds.length > 0,
    { message: "Selecciona al menos una empresa", path: ["companyIds"] },
  );
