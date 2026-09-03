import "server-only";

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { env } from "@/lib/env";

/**
 * En Vercel no hay sistema de archivos persistente donde dejar de antemano el
 * JSON de la cuenta de servicio, así que viaja completo en una variable de
 * entorno (`GOOGLE_CREDENTIALS_JSON`) y se escribe una única vez, al primer
 * uso, en un archivo temporal — que es justo donde
 * `GOOGLE_APPLICATION_CREDENTIALS` (la variable estándar que usan todas las
 * librerías de Google, tanto el conector de Cloud SQL como el cliente de
 * Cloud Storage) espera encontrarlo. En desarrollo local esa variable ya
 * viene seteada apuntando al archivo descargado de la consola, y esta
 * función no hace nada.
 */
export function prepararCredencialesGoogle(): void {
  if (!env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return;
  }
  const ruta = join(tmpdir(), "gcp-service-account.json");
  writeFileSync(ruta, env.GOOGLE_CREDENTIALS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = ruta;
}
