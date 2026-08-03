/**
 * Genera las variantes del logotipo a partir de un único original.
 *
 *   npx tsx scripts/generar-logos.ts
 *
 * Entrada: `assets/logo-original.png`, tal como lo entregue el cliente.
 * Salidas, en `public/`:
 *
 *   logo-claro.png       lockup completo, colores originales — la aplicación
 *   logo-azul.png        lockup en azul de marca — PDF y favicon, sobre blanco
 *   monograma-claro.png  solo la S, para espacios pequeños
 *   monograma-azul.png
 *
 * Se generan por programa y no se piden una por una al cliente porque así no
 * pueden desalinearse ni quedar desactualizadas entre sí: todas salen del
 * mismo archivo.
 */
import { writeFile } from "node:fs/promises";

import sharp from "sharp";

/** Azul de marca, medido sobre el logotipo original de su web. */
const AZUL = { r: 0x22, g: 0x56, b: 0xaa };

/**
 * Fuera de `public/` a propósito: es el material de partida, no algo que el
 * navegador deba descargar. Dentro de public se estaría sirviendo un archivo
 * de 2 MB que nadie pide.
 */
const ORIGEN = "assets/logo-original.png";

/** Por debajo de esta luminancia se considera fondo; por encima, dibujo. */
const FONDO_HASTA = 16;
const DIBUJO_DESDE = 56;

/**
 * Devuelve el logotipo con canal alfa, recortándole el fondo si no lo trae.
 *
 * El cliente puede entregarlo sobre un rectángulo negro en vez de sobre
 * transparencia. Pegado tal cual en la aplicación se vería ese rectángulo,
 * porque su negro (rgb 6,7,9) no coincide con el de nuestras superficies.
 *
 * La transparencia se deduce de la luminancia: el dibujo es claro y el fondo
 * casi negro, y entre los dos hay un hueco enorme —el 95% de los píxeles están
 * por debajo de 16 y el dibujo por encima de 224—, así que separarlos no es
 * ambiguo. La rampa entre los dos umbrales conserva el suavizado de los bordes
 * en vez de dejarlos dentados.
 *
 * Después se deshace la premultiplicación (color ÷ alfa). Sin ese paso, los
 * píxeles del borde —que son mezcla de dibujo y fondo negro— quedarían grises
 * y dibujarían un halo oscuro alrededor de las letras.
 */
async function conTransparencia(ruta: string): Promise<Buffer> {
  const meta = await sharp(ruta).metadata();
  if (meta.hasAlpha) {
    console.log("El original ya trae transparencia.");
    return sharp(ruta).toBuffer();
  }

  console.log("El original no trae transparencia: se recorta el fondo oscuro.");
  const { data, info } = await sharp(ruta)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const alfa = Math.max(
      0,
      Math.min(1, (luz - FONDO_HASTA) / (DIBUJO_DESDE - FONDO_HASTA)),
    );

    data[i + 3] = Math.round(alfa * 255);
    if (alfa > 0.01) {
      data[i] = Math.min(255, Math.round(r / alfa));
      data[i + 1] = Math.min(255, Math.round(g / alfa));
      data[i + 2] = Math.min(255, Math.round(b / alfa));
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/**
 * Dónde termina el monograma: la primera franja de columnas completamente
 * transparentes, que es el espacio entre la S y la palabra.
 */
async function finDelMonograma(
  imagen: Buffer,
  width: number,
  height: number,
): Promise<number> {
  const { data } = await sharp(imagen)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let seguidas = 0;
  for (let x = 0; x < width; x++) {
    let tieneTinta = false;
    for (let y = 0; y < height; y++) {
      if (data[(y * width + x) * 4 + 3]! > 12) {
        tieneTinta = true;
        break;
      }
    }

    if (tieneTinta) {
      seguidas = 0;
      continue;
    }

    // Doce columnas vacías seguidas ya no son un hueco entre trazos de la
    // misma letra, sino la separación con lo que viene después.
    seguidas++;
    if (seguidas >= 12) return x - seguidas + 1;
  }

  return width;
}

/** Pinta la silueta del alfa con un color plano. */
async function tenir(
  imagen: Buffer,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
  destino: string,
): Promise<void> {
  const alfa = await sharp(imagen).extractChannel("alpha").toBuffer();
  await sharp({ create: { width, height, channels: 3, background: color } })
    .joinChannel(alfa)
    .png()
    .toFile(destino);
}

/** Cuenta cuántos colores distintos tiene el dibujo, para avisar al teñir. */
async function esDeUnSoloColor(imagen: Buffer): Promise<boolean> {
  const { data } = await sharp(imagen)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let opacos = 0;
  let dominante = 0;
  const cuenta = new Map<string, number>();

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 250) continue;
    opacos++;
    // Agrupado de 16 en 16 para que el ruido de compresión no cuente como
    // tonos distintos.
    const k = `${data[i]! >> 4},${data[i + 1]! >> 4},${data[i + 2]! >> 4}`;
    const n = (cuenta.get(k) ?? 0) + 1;
    cuenta.set(k, n);
    if (n > dominante) dominante = n;
  }

  return opacos === 0 || dominante / opacos >= 0.85;
}

async function main() {
  const conAlfa = await conTransparencia(ORIGEN);

  // El original suele traer aire alrededor. Recortarlo evita tener que
  // compensar ese margen a mano en cada sitio donde se coloque.
  const recortado = await sharp(conAlfa).trim({ threshold: 10 }).toBuffer();
  const { width, height } = await sharp(recortado).metadata();
  console.log(`Recortado: ${width}x${height}`);

  // La versión de la aplicación conserva los colores del original: este
  // logotipo lleva un acento turquesa en la línea y en el "I4.0", y teñirlo lo
  // perdería. Va sobre fondo oscuro, donde el blanco y el turquesa se leen.
  await sharp(recortado).toFile("public/logo-claro.png");
  console.log("  public/logo-claro.png   (colores originales, para la aplicación)");

  // La del PDF y el favicon sí se tiñe: van sobre papel blanco, donde un
  // logotipo blanco no se vería. Al ser de un solo color pierde el acento,
  // que es lo aceptable de las dos opciones.
  await tenir(recortado, width!, height!, AZUL, "public/logo-azul.png");
  console.log("  public/logo-azul.png    (azul de marca, para el PDF y el favicon)");

  if (!(await esDeUnSoloColor(recortado))) {
    console.warn(
      "\n  AVISO: el logotipo tiene más de un color, así que la versión azul\n" +
        "  sale aplanada a un solo tono. Es lo esperable para un uso sobre\n" +
        "  papel; la de la aplicación conserva los colores.\n",
    );
  }

  // Monograma: la S sola. Hace falta porque a poca altura el lockup completo
  // deja el subtítulo ilegible y el conjunto se lee como una mancha.
  //
  // El corte no va a ojo ni a un porcentaje fijo: se busca la primera franja
  // de columnas enteramente transparentes, que es el hueco entre la S y la
  // palabra. Así el recorte sigue siendo correcto si mañana cambian el
  // logotipo por otro con distinta proporción.
  const anchoMonograma = await finDelMonograma(recortado, width!, height!);
  console.log(`Monograma detectado: hasta x=${anchoMonograma}`);

  // Cada monograma se recorta de su lockup ya generado, no del original, para
  // que coincida con el logotipo completo que lo acompaña.
  for (const [nombre, fuente] of [
    ["monograma-claro", "public/logo-claro.png"],
    ["monograma-azul", "public/logo-azul.png"],
  ] as const) {
    await sharp(await sharp(fuente).toBuffer())
      .extract({ left: 0, top: 0, width: anchoMonograma, height: height! })
      .trim({ threshold: 10 })
      .toFile(`public/${nombre}.png`);
    console.log(`  public/${nombre}.png`);
  }

  // Las medidas se escriben en un archivo que importa el componente, en vez de
  // quedar copiadas a mano en él. Al cambiar el logotipo cambian las
  // proporciones, y un número copiado se queda desactualizado sin dar error:
  // el logo simplemente sale con el ancho equivocado.
  const mono = await sharp("public/monograma-claro.png").metadata();
  await writeFile(
    "src/components/logotipo-medidas.ts",
    `// Generado por scripts/generar-logos.ts. No editar a mano.\n` +
      `export const MEDIDAS = {\n` +
      `  completo: { ancho: ${width}, alto: ${height} },\n` +
      `  monograma: { ancho: ${mono.width}, alto: ${mono.height} },\n` +
      `} as const;\n`,
    "utf8",
  );
  console.log("  src/components/logotipo-medidas.ts");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
