import { z } from "zod";

/**
 * Validación de variables de entorno al arrancar.
 *
 * Sin esto, una variable faltante en Vercel se manifiesta como un error críptico
 * en tiempo de ejecución, en producción, delante del usuario. Aquí falla de
 * inmediato y dice exactamente qué falta.
 *
 * Este módulo es solo de servidor: nunca debe importarse desde un componente
 * cliente, porque expondría los secretos en el bundle del navegador.
 */
const envSchema = z.object({
  // Turso — de baja hacia PostgreSQL/Cloud SQL (ver DB_* abajo). Se dejan
  // opcionales a propósito: la app ya no las necesita para arrancar, pero la
  // base vieja se conserva como red de seguridad y los scripts de migración
  // de datos todavía las leen.
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),

  // Cloud SQL (PostgreSQL). `DB_INSTANCE_CONNECTION_NAME` es el identificador
  // "proyecto:región:instancia" que usa el conector oficial de Google
  // (`@google-cloud/cloud-sql-connector`) para abrir el túnel autenticado —
  // no es un host/puerto tradicional, así que no hay DB_HOST ni DB_PORT.
  DB_INSTANCE_CONNECTION_NAME: z
    .string()
    .min(1, "Falta DB_INSTANCE_CONNECTION_NAME"),
  DB_USER: z.string().min(1, "Falta DB_USER"),
  DB_PASSWORD: z.string().min(1, "Falta DB_PASSWORD"),
  DB_NAME: z.string().min(1, "Falta DB_NAME"),
  // Contenido completo del JSON de la cuenta de servicio, como texto — no una
  // ruta de archivo. Hace falta en Vercel, que no tiene sistema de archivos
  // persistente donde apuntar `GOOGLE_APPLICATION_CREDENTIALS`. En desarrollo
  // local se deja sin definir y se usa esa variable estándar de Google en su
  // lugar (ver `src/lib/google-credenciales.ts`). La usan tanto la conexión a
  // Cloud SQL como el cliente de Cloud Storage.
  GOOGLE_CREDENTIALS_JSON: z.string().optional(),

  // Cloud Storage — de baja hacia Vercel Blob. Opcional: sin ella,
  // `storage.ts` cae al modo local (carpeta `.uploads`), igual que antes con
  // `BLOB_READ_WRITE_TOKEN` — la diferencia es que ahora esta variable sí
  // pasa por la validación centralizada, en vez de leerse suelta como pasaba
  // con aquella.
  GCS_BUCKET_NAME: z.string().optional(),

  // Secreto de firma de las cookies de sesión (JWT HS256).
  // 32 caracteres es el mínimo razonable para HS256.
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // URL pública de la app, para construir el enlace del PDF que recibe por
  // correo quien firma. Opcional: sin ella, firmar sigue funcionando, pero no
  // se envía el correo (queda anotado en el registro del servidor).
  APP_URL: z.string().url("APP_URL debe ser una URL completa").optional(),

  // Envío de correo por la API de Gmail, con la cuenta del cliente. Sustituye
  // al webhook de n8n que corría en un servidor aparte. Las tres van juntas:
  // sin alguna, `src/lib/gmail.ts` no intenta enviar y lo deja anotado en el
  // registro, igual que antes cuando faltaba el webhook.
  //
  // El JSON completo de la cuenta de servicio, como texto — mismo motivo que
  // GOOGLE_CREDENTIALS_JSON. Es una cuenta distinta y a propósito: esta solo
  // tiene permiso de `gmail.send`, nada de la infraestructura.
  GMAIL_SERVICE_ACCOUNT_JSON: z.string().optional(),
  // Usuario real del Workspace al que suplanta la cuenta de servicio. Tiene
  // que ser una persona con buzón: Google no permite suplantar un grupo.
  GMAIL_IMPERSONATE_EMAIL: z
    .string()
    .email("GMAIL_IMPERSONATE_EMAIL debe ser un correo válido")
    .optional(),
  // La dirección que ve quien recibe. Es una identidad de envío verificada de
  // la cuenta de arriba, no su dirección personal.
  GMAIL_SENDER_EMAIL: z
    .string()
    .email("GMAIL_SENDER_EMAIL debe ser un correo válido")
    .optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const detalles = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Variables de entorno inválidas o faltantes:\n${detalles}\n\n` +
        `Copia .env.example a .env.local y complétalo.`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();
