import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    // `drizzle-kit generate` solo lee el esquema y no se conecta, así que debe
    // funcionar sin credenciales. Las conexiones reales las hace
    // scripts/migrate.ts, que sí valida que estas variables existan.
    url: process.env.TURSO_DATABASE_URL ?? "http://localhost:8080",
    authToken: process.env.TURSO_AUTH_TOKEN ?? "",
  },
  verbose: true,
  strict: true,
});
