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
  // Turso. Se usa la URL https:// (no libsql://) a propósito: evita abrir un
  // WebSocket en cada invocación serverless. Ver PLAN.md, sección 7.1.
  TURSO_DATABASE_URL: z.string().min(1, "Falta TURSO_DATABASE_URL"),
  TURSO_AUTH_TOKEN: z.string().min(1, "Falta TURSO_AUTH_TOKEN"),

  // Secreto de firma de las cookies de sesión (JWT HS256).
  // 32 caracteres es el mínimo razonable para HS256.
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
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
