import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // `drizzle-kit generate` solo lee el esquema y no se conecta, así que debe
    // funcionar sin credenciales reales — este valor es un relleno. Las
    // conexiones reales las hace `scripts/migrate.ts` (que sí valida las
    // variables) a través del conector de Cloud SQL, no con una cadena de
    // conexión plana como esta: por eso `drizzle-kit studio` no funciona tal
    // cual contra Cloud SQL sin el Cloud SQL Auth Proxy corriendo aparte.
    url: process.env.DB_LOCAL_URL_PLACEHOLDER ?? "postgresql://localhost:5432/reportes_dev",
  },
  verbose: true,
  strict: true,
});
