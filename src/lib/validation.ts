import { z } from "zod";

import { ESTADOS_COTIZACION } from "./cotizaciones";
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
 *
 * Los mensajes salen del idioma de quien hace la petición, así que cada
 * esquema es una función que recibe el traductor ya resuelto (`getTranslations`
 * en el servidor) en vez de un objeto Zod fijo — no hay forma de fijar un
 * idioma en tiempo de módulo cuando el idioma depende de la sesión.
 */
// Acepta tanto el traductor tipado de next-intl (claves literales de
// "validacion", con sobrecargas según lleven o no parámetros) como cualquier
// función compatible; `any` evita el choque de varianza entre ambos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = (key: any, values?: any) => string;

export function loginSchema(t: T) {
  return z.object({
    username: z
      .string()
      .trim()
      .min(1, t("ingresaUsuario"))
      .max(60, t("loginUsuarioDemasiadoLargo")),
    password: z
      .string()
      .min(1, t("ingresaContrasena"))
      .max(200, t("contrasenaDemasiadoLarga")),
  });
}

export type LoginInput = z.infer<ReturnType<typeof loginSchema>>;

export function nuevaContrasenaSchema(t: T) {
  return z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      t("contrasenaMinima", { min: PASSWORD_MIN_LENGTH }),
    )
    .max(200, t("contrasenaDemasiadoLarga"));
}

/**
 * Cambio de contraseña hecho por el propio usuario desde su perfil.
 *
 * Pide la actual además de la nueva: sin eso, cualquiera que encuentre una
 * sesión abierta en un celular prestado se queda con la cuenta. La repetición
 * es porque el campo va enmascarado — un dedazo sin confirmación deja a la
 * persona fuera de su propia cuenta hasta que un admin se la resetee.
 */
export function cambiarContrasenaSchema(t: T) {
  return z
    .object({
      actual: z.string().min(1, t("ingresaContrasenaActual")),
      nueva: nuevaContrasenaSchema(t),
      repetir: z.string(),
    })
    .refine((d) => d.nueva === d.repetir, {
      message: t("contrasenasNoCoinciden"),
      path: ["repetir"],
    })
    .refine((d) => d.nueva !== d.actual, {
      message: t("contrasenaNuevaIgualActual"),
      path: ["nueva"],
    });
}

/**
 * Reporte de servicio.
 *
 * Proyecto, cliente, orden de compra y número de cotización YA NO se escriben
 * aquí: se copian del servidor a partir de la cotización elegida
 * (`quoteId`) — es lo que evita que el mismo proyecto termine escrito de tres
 * formas distintas. Ver `crearReporteAction` en `src/actions/reports.ts`, que
 * hace esa copia después de validar este esquema.
 *
 * Los límites de longitud no son decorativos: sin ellos, alguien puede mandar
 * un campo de varios megabytes por una Server Action y llenar la base.
 */
export function reporteSchema(t: T) {
  return z.object({
    quoteId: z.string().trim().min(1, t("eligeCotizacion")),
    workDate: z
      .string()
      .trim()
      .min(1, t("ingresaFecha"))
      .transform((valor, ctx) => {
        const fecha = parseFechaISO(valor);
        if (!fecha) {
          ctx.addIssue({ code: "custom", message: t("fechaInvalida") });
          return z.NEVER;
        }
        return fecha;
      }),
    serviceType: z.enum(TIPOS_SERVICIO_IDS, {
      message: t("indicaTipoServicio"),
    }),
    // Opcional, y a propósito sin ningún `min(1)`: el cliente pidió
    // explícitamente que la ausencia de detalles no dispare ninguna alerta, a
    // diferencia de la orden de compra.
    details: z
      .string()
      .trim()
      .max(5000, t("detallesLargos"))
      .transform((v) => (v.length > 0 ? v : null)),
  });
}

export type ReporteInput = z.infer<ReturnType<typeof reporteSchema>>;

/**
 * Reporte de viáticos: solo pide a qué reporte de servicio justifica. El
 * resto —proyecto, cliente— se copia de ese reporte al crearlo, así que no se
 * le vuelve a preguntar algo que ya está escrito ahí.
 */
export function reporteViaticoSchema(t: T) {
  return z.object({
    linkedReportId: z.string().trim().min(1, t("eligeReporteAEnlazar")),
  });
}

/**
 * Un gasto dentro de un reporte de viáticos: concepto, monto y fecha propios,
 * más su foto de respaldo (que se valida aparte, como archivo). El monto es
 * obligatorio aquí —a diferencia del viático suelto de antes— porque ahora el
 * reporte existe para sumarlos: un gasto sin monto rompe el total.
 */
export function gastoViaticoSchema(t: T) {
  return z.object({
    concepto: z
      .string()
      .trim()
      .min(1, t("ingresaConcepto"))
      .max(200, t("conceptoLargo")),
    fechaGasto: z
      .string()
      .trim()
      .min(1, t("ingresaFechaGasto"))
      .transform((valor, ctx) => {
        const fecha = parseFechaISO(valor);
        if (!fecha) {
          ctx.addIssue({ code: "custom", message: t("fechaInvalida") });
          return z.NEVER;
        }
        return fecha;
      }),
    amount: z
      .string()
      .trim()
      .min(1, t("ingresaMonto"))
      .transform((valor, ctx) => {
        const numero = Number(valor);
        if (!Number.isFinite(numero) || numero < 0) {
          ctx.addIssue({ code: "custom", message: t("montoInvalido") });
          return z.NEVER;
        }
        return Math.round(numero);
      }),
  });
}

/**
 * Firma de un reporte. El correo es obligatorio: quien firma recibe por ahí
 * un enlace seguro con una copia del reporte, así que sin correo no hay a
 * dónde mandarlo.
 */
export function firmaSchema(t: T) {
  return z.object({
    signatureName: z
      .string()
      .trim()
      .min(1, t("ingresaNombreFirmante"))
      .max(120, t("nombreLargo")),
    signatureEmail: z
      .string()
      .trim()
      .min(1, t("ingresaCorreoFirmante"))
      .max(200, t("correoLargo"))
      .pipe(z.email(t("correoInvalido"))),
  });
}

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
 * Cotización, creada o editada por un administrador.
 *
 * Todos los campos aquí son opcionales salvo proyecto y cliente: una
 * cotización puede registrarse sin número todavía asignado, sin orden de
 * compra, sin fecha comprometida — son datos que llegan en momentos distintos
 * y el admin los va completando.
 */
export function cotizacionSchema(t: T) {
  return z.object({
    quoteNumber: z
      .string()
      .trim()
      .max(60, t("cotizacionLarga"))
      .transform((v) => (v.length > 0 ? v : null)),
    projectName: z
      .string()
      .trim()
      .min(1, t("ingresaNombreProyecto"))
      .max(200, t("nombreProyectoLargo")),
    clientName: z
      .string()
      .trim()
      .min(1, t("ingresaCliente"))
      .max(200, t("clienteLargo")),
    purchaseOrderNo: z
      .string()
      .trim()
      .max(60, t("ordenLarga"))
      .transform((v) => (v.length > 0 ? v : null)),
    dueDate: z
      .string()
      .trim()
      .transform((valor, ctx) => {
        if (valor.length === 0) return null;
        const fecha = parseFechaISO(valor);
        if (!fecha) {
          ctx.addIssue({ code: "custom", message: t("fechaInvalida") });
          return z.NEVER;
        }
        return fecha;
      }),
    description: z
      .string()
      .trim()
      .max(2000, t("descripcionLarga"))
      .transform((v) => (v.length > 0 ? v : null)),
    amount: z
      .string()
      .trim()
      .transform((valor, ctx) => {
        if (valor.length === 0) return null;
        const numero = Number(valor);
        if (!Number.isFinite(numero) || numero < 0) {
          ctx.addIssue({ code: "custom", message: t("montoInvalido") });
          return z.NEVER;
        }
        return Math.round(numero);
      }),
  });
}

/**
 * Cotización mínima, creada por un técnico desde campo cuando el trabajo se
 * acordó de palabra o es urgente y todavía no existe en el sistema. Solo pide
 * lo que el técnico realmente tiene a mano — nada de número de cotización, que
 * es justo el dato que le correspondería inventar si se le exigiera.
 */
export function cotizacionCampoSchema(t: T) {
  return z.object({
    projectName: z
      .string()
      .trim()
      .min(1, t("ingresaNombreProyecto"))
      .max(200, t("nombreProyectoLargo")),
    clientName: z
      .string()
      .trim()
      .min(1, t("ingresaCliente"))
      .max(200, t("clienteLargo")),
  });
}

export const estadoCotizacionSchema = z.enum(ESTADOS_COTIZACION);

/**
 * Nombre de usuario para cuentas nuevas.
 *
 * Restringido a minúsculas, números, puntos y guiones — nada de espacios ni
 * símbolos. Es lo que la persona va a escribir para iniciar sesión; un nombre
 * con caracteres raros es una fuente segura de errores de tipeo.
 */
export function usernameSchema(t: T) {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(3, t("usuarioMinimo"))
    .max(40, t("usuarioLargo"))
    .regex(/^[a-z0-9._-]+$/, t("usuarioFormato"));
}

export function crearUsuarioSchema(t: T) {
  return z
    .object({
      username: usernameSchema(t),
      fullName: z
        .string()
        .trim()
        .min(1, t("ingresaNombreCompleto"))
        .max(120, t("nombreLargo")),
      role: z.enum(USER_ROLES),
      companyIds: z.array(z.string()).default([]),
    })
    .refine(
      // Al menos una empresa, pero solo para un empleado: sin ninguna, no
      // podría entrar nunca — quedaría creado pero inservible. El admin no
      // depende de esto para nada: ve las dos empresas siempre, por definición
      // del rol, así que exigirle elegir sería pedirle algo que no usa.
      (data) => data.role !== "empleado" || data.companyIds.length > 0,
      { message: t("seleccionaEmpresa"), path: ["companyIds"] },
    );
}
