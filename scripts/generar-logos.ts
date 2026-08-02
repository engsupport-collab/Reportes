/**
 * Genera las variantes del logotipo a partir de un único original.
 *
 *   npx tsx scripts/generar-logos.ts
 *
 * El original (`public/logo.png`) es la versión blanca sobre transparente que
 * entregó el cliente. De ahí salen las demás **tiñendo el canal alfa**: el
 * dibujo es de un solo color plano (94% blanco puro; el resto son grises del
 * antialiasing), así que la forma vive entera en la transparencia y el color
 * se puede sustituir sin perder nada.
 *
 * Se hace así y no pidiendo cada versión al cliente porque una copia teñida
 * por programa no puede desalinearse ni quedar desactualizada respecto a la
 * otra: las dos salen del mismo archivo.
 */
import sharp from "sharp";

/** Azul de marca, medido sobre el logo original de su web. */
const AZUL = { r: 0x22, g: 0x56, b: 0xaa };

/**
 * Fuera de `public/` a propósito: es el material de partida, no algo que el
 * navegador deba descargar. Dentro de public se estaría sirviendo un archivo
 * de 2 MB que nadie pide.
 */
const ORIGEN = "assets/logo-original.png";

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

async function main() {
  // El original trae mucho aire alrededor (1536x1024 para un dibujo de
  // 1046x319). Recortarlo evita tener que compensar ese margen a mano en cada
  // sitio donde se coloque.
  const recortado = await sharp(ORIGEN).trim({ threshold: 10 }).toBuffer();
  const { width, height } = await sharp(recortado).metadata();
  console.log(`Original recortado: ${width}x${height}`);

  await sharp(recortado).toFile("public/logo-claro.png");
  console.log("  public/logo-claro.png   (blanco, para fondos oscuros)");

  // El alfa se reutiliza como molde sobre un lienzo del color de marca.
  const alfa = await sharp(recortado).extractChannel("alpha").toBuffer();
  await sharp({
    create: {
      width: width!,
      height: height!,
      channels: 3,
      background: AZUL,
    },
  })
    .joinChannel(alfa)
    .png()
    .toFile("public/logo-azul.png");
  console.log("  public/logo-azul.png    (azul de marca, para fondos claros y el PDF)");

  // Monograma: la S sola. Hace falta porque a 36px de alto el lockup completo
  // deja el subtítulo ilegible y el conjunto se lee como una mancha.
  //
  // El corte no va a ojo ni a un porcentaje fijo: se busca la primera franja
  // de columnas enteramente transparentes, que es el hueco entre la S y la
  // palabra. Así el recorte sigue siendo correcto si mañana cambian el
  // logotipo por otro con distinta proporción.
  const anchoMonograma = await finDelMonograma(recortado, width!, height!);
  console.log(`Monograma detectado: hasta x=${anchoMonograma}`);
  for (const [nombre, fuente] of [
    ["monograma-claro", recortado],
    ["monograma-azul", await sharp("public/logo-azul.png").toBuffer()],
  ] as const) {
    await sharp(fuente)
      .extract({ left: 0, top: 0, width: anchoMonograma, height: height! })
      .trim({ threshold: 10 })
      .toFile(`public/${nombre}.png`);
    console.log(`  public/${nombre}.png`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
