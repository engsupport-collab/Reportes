import { existsSync } from "node:fs";

import { config } from "dotenv";

/**
 * De dónde salen las credenciales de Cloud SQL en los scripts.
 *
 * Hay dos bases y es fácil escribir en la que no era. Antes había que
 * exportar las variables a mano en cada terminal nueva, y bastaba olvidar una
 * para acabar mandando el token de desarrollo a la base de producción — el
 * síntoma es un error opaco, que no dice nada de lo que pasó realmente.
 *
 * Ahora hay dos archivos y se elige con una bandera:
 *
 *   npm run <script>            -> .env.local  (desarrollo, por defecto)
 *   npm run <script> -- --prod  -> .env.prod   (producción)
 *
 * Producción va detrás de una bandera explícita a propósito: escribir ahí
 * tiene que ser algo que se pide, nunca lo que pasa por descuido.
 *
 * `.env.prod` NO se sube: el .gitignore ya excluye `.env*`.
 *
 * La autenticación con Google Cloud (`GOOGLE_APPLICATION_CREDENTIALS`, la
 * ruta al JSON de la cuenta de servicio) es aparte, y va en el entorno de la
 * terminal, no en estos archivos: es la misma para dev y para prod, cambia
 * solo la base a la que apunta.
 */

export type Credenciales = {
  /**
   * Conexión directa por cadena. Cuando viene, manda sobre todo lo demás y no
   * se toca Cloud SQL: es el PostgreSQL efímero que levanta CI en cada
   * ejecución, alcanzable sin conector ni credenciales de Google.
   */
  connectionString?: string;
  instanceConnectionName: string;
  user: string;
  password: string;
  database: string;
  /** Para poder decir en pantalla contra qué se está trabajando. */
  origen: string;
  esProduccion: boolean;
};

const VARIABLES = [
  "DB_INSTANCE_CONNECTION_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
] as const;

export function cargarCredenciales(argv: string[]): Credenciales {
  const usaProd = argv.includes("--prod");
  const archivo = usaProd ? ".env.prod" : ".env.local";

  // Conexión directa: es el modo de CI y de cualquiera que levante un
  // PostgreSQL propio. Se comprueba antes que nada porque en ese caso no hay
  // ni archivo .env ni credenciales de Google que exigir.
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      instanceConnectionName: "",
      user: "",
      password: "",
      database: process.env.DATABASE_URL.split("/").pop() ?? "",
      origen: "DATABASE_URL (conexión directa)",
      esProduccion: false,
    };
  }

  // Se anota antes de cargar el archivo: si ya venían exportadas, esas mandan
  // (dotenv no sobrescribe) y hay que decirlo, porque no coincidirían con lo
  // que diga el archivo.
  const yaEstabanEnElEntorno = VARIABLES.every((v) => Boolean(process.env[v]));

  if (usaProd && !existsSync(archivo)) {
    throw new Error(
      `No existe ${archivo}. Créalo en la raíz del proyecto con estas líneas:\n\n` +
        `  DB_INSTANCE_CONNECTION_NAME=proyecto:region:instancia\n` +
        `  DB_USER=reportes_app\n` +
        `  DB_PASSWORD=...\n` +
        `  DB_NAME=reportes_prod\n\n` +
        `No se sube a git: el .gitignore ya lo excluye.`,
    );
  }

  config({ path: archivo });

  const instanceConnectionName = process.env.DB_INSTANCE_CONNECTION_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  // Se distingue "no está" de "está pero vacía": son problemas distintos y el
  // segundo es el que pasa de verdad —la línea existe en el archivo pero el
  // valor se quedó sin escribir—, así que decir solo "falta" manda a buscar
  // en el sitio equivocado.
  const estado = (v: string | undefined) =>
    v === undefined ? "no está en el archivo" : v === "" ? "está vacía" : null;

  const problemas = [
    ["DB_INSTANCE_CONNECTION_NAME", estado(instanceConnectionName)] as const,
    ["DB_USER", estado(user)] as const,
    ["DB_PASSWORD", estado(password)] as const,
    ["DB_NAME", estado(database)] as const,
  ].filter(([, malo]) => malo !== null);

  if (problemas.length > 0 || !instanceConnectionName || !user || !password || !database) {
    throw new Error(
      `Problema con las credenciales en ${archivo}:\n` +
        problemas.map(([n, m]) => `  - ${n} ${m}`).join("\n") +
        `\n\nRevisa el archivo: cada línea va como NOMBRE=valor, sin comillas.`,
    );
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Falta GOOGLE_APPLICATION_CREDENTIALS en el entorno de esta terminal " +
        "(la ruta al JSON de la cuenta de servicio) — no va en .env.local/.env.prod.",
    );
  }

  return {
    instanceConnectionName,
    user,
    password,
    database,
    origen: yaEstabanEnElEntorno
      ? "variables de entorno (mandan sobre el archivo)"
      : archivo,
    esProduccion: usaProd,
  };
}

/** Cabecera común: contra qué base se va a trabajar, antes de tocar nada. */
export function anunciar(cred: Credenciales): void {
  console.log("");
  if (cred.connectionString) {
    console.log("  CONEXIÓN:      directa (sin Cloud SQL)");
  } else {
    console.log(`  INSTANCIA:     ${cred.instanceConnectionName}`);
  }
  console.log(`  BASE DE DATOS: ${cred.database}`);
  console.log(`  Credenciales:  ${cred.origen}`);
  if (cred.esProduccion) console.log("  *** PRODUCCIÓN ***");
  console.log("");
}
