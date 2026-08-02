import { existsSync } from "node:fs";

import { config } from "dotenv";

/**
 * De dónde salen las credenciales de Turso en los scripts.
 *
 * Hay dos bases y es fácil escribir en la que no era. Antes había que
 * exportar las variables a mano en cada terminal nueva, y bastaba olvidar una
 * para acabar mandando el token de desarrollo a la base de producción — el
 * síntoma es un HTTP 400 opaco, que no dice nada de lo que pasó realmente.
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
 */

export type Credenciales = {
  url: string;
  authToken: string;
  /** Para poder decir en pantalla contra qué se está trabajando. */
  origen: string;
  esProduccion: boolean;
};

export function cargarCredenciales(argv: string[]): Credenciales {
  const usaProd = argv.includes("--prod");
  const archivo = usaProd ? ".env.prod" : ".env.local";

  // Se anota antes de cargar el archivo: si ya venían exportadas, esas mandan
  // (dotenv no sobrescribe) y hay que decirlo, porque no coincidirían con lo
  // que diga el archivo.
  const yaEstabanEnElEntorno =
    Boolean(process.env.TURSO_DATABASE_URL) &&
    Boolean(process.env.TURSO_AUTH_TOKEN);

  if (usaProd && !existsSync(archivo)) {
    throw new Error(
      `No existe ${archivo}. Créalo en la raíz del proyecto con estas dos ` +
        `líneas:\n\n` +
        `  TURSO_DATABASE_URL=libsql://...\n` +
        `  TURSO_AUTH_TOKEN=eyJ...\n\n` +
        `No se sube a git: el .gitignore ya lo excluye.`,
    );
  }

  config({ path: archivo });

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // Se distingue "no está" de "está pero vacía": son problemas distintos y el
  // segundo es el que pasa de verdad —la línea existe en el archivo pero el
  // valor se quedó sin escribir—, así que decir solo "falta" manda a buscar
  // en el sitio equivocado.
  const estado = (v: string | undefined) =>
    v === undefined ? "no está en el archivo" : v === "" ? "está vacía" : null;

  const problemas = [
    ["TURSO_DATABASE_URL", estado(url)] as const,
    ["TURSO_AUTH_TOKEN", estado(authToken)] as const,
  ].filter(([, malo]) => malo !== null);

  if (problemas.length > 0 || !url || !authToken) {
    throw new Error(
      `Problema con las credenciales en ${archivo}:\n` +
        problemas.map(([n, m]) => `  - ${n} ${m}`).join("\n") +
        `\n\nRevisa el archivo: cada línea va como NOMBRE=valor, sin comillas.`,
    );
  }

  // Un token de Turso es un JWT largo. Si mide menos, casi seguro se copió a
  // medias o se dejó el texto de ejemplo sin reemplazar.
  if (authToken.length < 100) {
    throw new Error(
      `El token tiene solo ${authToken.length} caracteres. Uno real de Turso ` +
        `pasa de 300 y empieza por "eyJ". Revísalo en ${archivo}.`,
    );
  }

  return {
    url,
    authToken,
    origen: yaEstabanEnElEntorno
      ? "variables de entorno (mandan sobre el archivo)"
      : archivo,
    esProduccion: usaProd,
  };
}

/** Cabecera común: contra qué base se va a trabajar, antes de tocar nada. */
export function anunciar(cred: Credenciales): void {
  console.log("");
  console.log(`  BASE DE DATOS: ${new URL(cred.url).host}`);
  console.log(`  Credenciales:  ${cred.origen}`);
  if (cred.esProduccion) console.log("  *** PRODUCCIÓN ***");
  console.log("");
}
