/**
 * Prueba de los PDF: su texto y sus fotos.
 *
 *   npm run test:pdf
 *
 * No toca la base: arma reportes en memoria, genera el PDF de verdad y lee lo
 * que quedó dentro — qué texto, dónde, y qué fotos a qué tamaño. Las fotos de
 * prueba se escriben en la carpeta local de archivos y se borran al terminar.
 *
 * Reproduce el primer reporte real del sistema (2026-10-04), que no se pudo
 * descargar ni enviar por correo: su detalle venía de un `<textarea>`, con los
 * saltos de línea como CR+LF, y el generador solo sabía de LF. Hasta entonces
 * el PDF se había probado con texto de una línea escrito en el código — que es
 * justo el caso que nunca falló. Su foto, además, salía acostada y entera.
 *
 * Los caracteres especiales van por su número (`c(0x202f)`) y no escritos:
 * muchos son invisibles o idénticos a otros, y escritos aquí no se sabría qué
 * se está probando.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "dotenv";
import {
  PDFArray,
  PDFDocument,
  PDFName,
  type PDFNumber,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
} from "pdf-lib";
import sharp from "sharp";

import type { ReporteCompleto } from "../src/lib/queries/reports";

config({ path: ".env.local" });

const c = String.fromCodePoint;

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

function mensajeDeError(accion: () => unknown): string | null {
  try {
    accion();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function iguales(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((valor, i) => valor === b[i]);
}

/** Un texto dibujado en el PDF: qué dice, dónde y a qué tamaño. */
type Trazo = { texto: string; x: number; y: number; tamano: number };

/**
 * Lo que un PDF tiene dibujado, página por página y en el orden en que se
 * dibujó.
 *
 * Buscar el texto en los bytes del archivo no sirve (PRACTICAS.md, sección 8):
 * el contenido va comprimido y las cadenas en hexadecimal, así que la búsqueda
 * dice "no está" hasta en el PDF que sí lo tiene. Aquí se descomprime cada
 * página y se decodifica cada cadena; de paso se lee su posición, que es lo
 * que permite comprobar que dos textos no quedaron uno encima del otro.
 */
async function trazosDelPdf(bytes: Uint8Array): Promise<Trazo[][]> {
  const doc = await PDFDocument.load(bytes);
  const comoAscii = new TextDecoder("latin1");
  const comoWinAnsi = new TextDecoder("windows-1252");

  return doc.getPages().map((page) => {
    const contenido = page.node.Contents();
    const flujos =
      contenido instanceof PDFArray
        ? contenido.asArray().map((ref) => doc.context.lookup(ref))
        : [contenido];
    const trazos: Trazo[] = [];

    for (const flujo of flujos) {
      if (!(flujo instanceof PDFRawStream)) continue;
      const operadores = comoAscii.decode(decodePDFRawStream(flujo).decode());

      // Cada `drawText` es un bloque BT…ET: fuente y tamaño (Tf), interlineado
      // (TL), posición (Tm) y un Tj por renglón, separados por T*.
      for (const [, bloque] of operadores.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
        const tamano = Number(/([\d.]+)\s+Tf/.exec(bloque!)?.[1]);
        const interlineado = Number(/([\d.]+)\s+TL/.exec(bloque!)?.[1] ?? 0);
        const posicion = /(-?[\d.]+)\s+(-?[\d.]+)\s+Tm/.exec(bloque!);
        const x = Number(posicion?.[1]);
        let y = Number(posicion?.[2]);

        for (const [, hex, salto] of bloque!.matchAll(/<([0-9A-Fa-f]*)>\s*Tj|(T\*)/g)) {
          if (salto) {
            y -= interlineado;
          } else {
            trazos.push({
              texto: comoWinAnsi.decode(Buffer.from(hex!, "hex")),
              x,
              y,
              tamano,
            });
          }
        }
      }
    }

    return trazos;
  });
}

/** El pie lleva la hora de generación: se deja fuera al comparar dos documentos. */
const PISO_DEL_CONTENIDO = 60;
const sobreElPie = (trazo: Trazo) => trazo.y >= PISO_DEL_CONTENIDO;

/** Genera el PDF. Si no se genera, lo anota como fallo y devuelve null. */
async function generarBytes(
  descripcion: string,
  armar: () => Promise<Uint8Array>,
): Promise<Uint8Array | null> {
  try {
    const t0 = performance.now();
    const bytes = await armar();
    const cabecera = new TextDecoder("latin1").decode(bytes.slice(0, 5));
    comprobar(
      `${descripcion}: se genera`,
      cabecera === "%PDF-",
      `${bytes.length} bytes, ${Math.round(performance.now() - t0)} ms`,
    );
    return bytes;
  } catch (error) {
    comprobar(
      `${descripcion}: se genera`,
      false,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/** Genera el PDF y lee lo que tiene dibujado. */
async function generar(
  descripcion: string,
  armar: () => Promise<Uint8Array>,
): Promise<Trazo[][] | null> {
  const bytes = await generarBytes(descripcion, armar);
  return bytes ? trazosDelPdf(bytes) : null;
}

/** Una foto incrustada en el PDF: sus dimensiones y el JPEG tal como quedó dentro. */
type FotoEnPdf = { ancho: number; alto: number; jpeg: Uint8Array };

/** Las fotos (JPEG) de un PDF, en el orden en que entraron. El logo y la firma son PNG y no cuentan. */
async function fotosDelPdf(bytes: Uint8Array): Promise<FotoEnPdf[]> {
  const doc = await PDFDocument.load(bytes);
  const fotos: FotoEnPdf[] = [];

  for (const [, objeto] of doc.context.enumerateIndirectObjects()) {
    if (!(objeto instanceof PDFRawStream)) continue;
    const dic = objeto.dict;
    if (dic.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    if (dic.get(PDFName.of("Filter")) !== PDFName.of("DCTDecode")) continue;
    fotos.push({
      ancho: (dic.get(PDFName.of("Width")) as PDFNumber).asNumber(),
      alto: (dic.get(PDFName.of("Height")) as PDFNumber).asNumber(),
      jpeg: objeto.contents,
    });
  }

  return fotos;
}

/** Color medio de un recuadro de una imagen. */
async function colorEn(
  imagen: Uint8Array,
  izquierda: number,
  arriba: number,
): Promise<{ r: number; g: number; b: number }> {
  const { data } = await sharp(imagen)
    .extract({ left: izquierda, top: arriba, width: 20, height: 20 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const suma = [0, 0, 0];
  for (let i = 0; i < data.length; i += 3) {
    suma[0]! += data[i]!;
    suma[1]! += data[i + 1]!;
    suma[2]! += data[i + 2]!;
  }
  const pixeles = data.length / 3;
  return { r: suma[0]! / pixeles, g: suma[1]! / pixeles, b: suma[2]! / pixeles };
}

// --- Archivos de prueba ------------------------------------------------------
//
// El generador lee los adjuntos del almacenamiento. Sin bucket configurado ese
// almacenamiento es la carpeta `.uploads`, así que las fotos de prueba se
// escriben ahí con un prefijo propio y se borran al terminar.

const CARPETA_LOCAL = path.join(process.cwd(), ".uploads");
const archivosDePrueba: string[] = [];

async function guardarDePrueba(nombre: string, datos: Uint8Array): Promise<string> {
  await mkdir(CARPETA_LOCAL, { recursive: true });
  const archivo = `prueba-pdf-${nombre}`;
  await writeFile(path.join(CARPETA_LOCAL, archivo), datos);
  archivosDePrueba.push(archivo);
  return `local:${archivo}`;
}

async function borrarArchivosDePrueba(): Promise<void> {
  for (const archivo of archivosDePrueba) {
    await rm(path.join(CARPETA_LOCAL, archivo), { force: true });
  }
}

/**
 * Una "foto": ruido suavizado, que pesa parecido a una foto real de campo.
 * Un color liso pesaría casi nada y no pondría a prueba ningún límite.
 */
function texturaDeFoto(ancho: number, alto: number) {
  return sharp({
    create: {
      width: ancho,
      height: alto,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: 60 },
    },
  }).blur(2);
}

const ROJO = { r: 230, g: 20, b: 20 };
type Color = { r: number; g: number; b: number };
const esRojo = (color: Color) => color.r > 180 && color.g < 90 && color.b < 90;
const esBlanco = (color: Color) => color.r > 235 && color.g > 235 && color.b > 235;

/**
 * Fotos y archivos dentro del PDF.
 *
 * Lo que el primer reporte real dejó al descubierto, además del texto: la foto
 * salía acostada y a su tamaño original, de modo que con tres el documento ya
 * no se podía descargar ni enviar.
 */
async function comprobarFotos() {
  const { generarReportePdf, generarReporteViaticoPdf } = await import("../src/lib/pdf");
  const { PESO_MAXIMO_PDF } = await import("../src/lib/pdf-adjuntos");
  /** Vercel no entrega una respuesta de más de 4,5 MB: de ahí para arriba, el PDF no se descarga. */
  const TOPE_DE_VERCEL = 4.5 * 1024 * 1024;
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  console.log("\nFoto tomada con el teléfono de lado\n");

  // Como la guarda un teléfono: los píxeles acostados (4032 x 3024) y una nota
  // en los metadatos que dice "gírame a la derecha" (orientación 6). La esquina
  // superior izquierda de lo guardado va pintada de rojo: con la foto derecha,
  // ese rojo queda arriba a la derecha.
  const acostada = await texturaDeFoto(4032, 3024)
    .composite([
      {
        input: { create: { width: 700, height: 700, channels: 3, background: ROJO } },
        left: 0,
        top: 0,
      },
    ])
    .jpeg({ quality: 88 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const metaAcostada = await sharp(acostada).metadata();
  comprobar(
    "la foto de prueba es como la de un teléfono: 12 megapíxeles, acostada, con el giro anotado",
    metaAcostada.width === 4032 && metaAcostada.height === 3024 && metaAcostada.orientation === 6,
    `${mb(acostada.length)}`,
  );

  const refAcostada = await guardarDePrueba("acostada.jpg", acostada);
  const conAcostada = await generarBytes("un reporte con esa foto", () =>
    generarReportePdf(reporte(), [
      { id: "f1", blobUrl: refAcostada, fileName: "IMG_0001.jpg", mimeType: "image/jpeg" },
    ]),
  );
  if (conAcostada) {
    const [foto, ...otras] = await fotosDelPdf(conAcostada);
    comprobar("el PDF lleva esa foto, y solo esa", Boolean(foto) && otras.length === 0);
    if (foto) {
      comprobar(
        "queda de pie y con el lado mayor en 1600 px",
        foto.ancho === 1200 && foto.alto === 1600,
        `${foto.ancho} x ${foto.alto}`,
      );
      comprobar(
        "girada hacia el lado correcto: lo rojo quedó arriba a la derecha",
        esRojo(await colorEn(foto.jpeg, foto.ancho - 120, 100)),
      );
      comprobar(
        "contraste: arriba a la izquierda no hay rojo",
        !esRojo(await colorEn(foto.jpeg, 100, 100)),
      );
      comprobar(
        "dentro del PDF pesa una fracción de la original",
        foto.jpeg.length < acostada.length / 3,
        `${mb(foto.jpeg.length)} de ${mb(acostada.length)}`,
      );
    }
  }

  console.log("\nCada archivo entra por lo que es, no por cómo se llama\n");

  const transparente = await sharp({
    create: { width: 900, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: { create: { width: 300, height: 300, channels: 4, background: { ...ROJO, alpha: 1 } } },
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
  const webp = await texturaDeFoto(1200, 900).webp({ quality: 80 }).toBuffer();
  const yaLista = await texturaDeFoto(800, 600).jpeg({ quality: 82 }).toBuffer();
  const danada = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]);
  const word = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(3000, 1)]);
  const plano = await PDFDocument.create();
  plano.addPage([400, 300]);
  plano.addPage([400, 300]);
  const pdfAdjunto = await plano.save();

  const variados = [
    { id: "v1", fileName: "captura.png", mimeType: "image/png", datos: transparente },
    { id: "v2", fileName: "foto.webp", mimeType: "image/webp", datos: webp },
    // Lo que mandaba Safari: un PNG con nombre y etiqueta de WebP.
    { id: "v3", fileName: "IMG_3041.webp", mimeType: "image/webp", datos: transparente },
    { id: "v4", fileName: "pequena.jpg", mimeType: "image/jpeg", datos: yaLista },
    { id: "v5", fileName: "danada.jpg", mimeType: "image/jpeg", datos: danada },
    {
      id: "v6",
      fileName: "informe.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      datos: word,
    },
    { id: "v7", fileName: "plano.pdf", mimeType: "application/pdf", datos: pdfAdjunto },
  ];
  const adjuntosVariados: { id: string; fileName: string; mimeType: string; blobUrl: string }[] = [];
  for (const { datos, ...resto } of variados) {
    adjuntosVariados.push({ ...resto, blobUrl: await guardarDePrueba(resto.fileName, datos) });
  }

  const conVariados = await generarBytes("un reporte con PNG, WebP, JPEG, un archivo dañado, un Word y un PDF", () =>
    generarReportePdf(reporte(), adjuntosVariados),
  );
  if (conVariados) {
    const fotos = await fotosDelPdf(conVariados);
    const paginas = await trazosDelPdf(conVariados);
    const noIncluidos = paginas.at(-1)!.map((t) => t.texto);

    comprobar("entran las cuatro imágenes", fotos.length === 4, `${fotos.length}`);
    if (fotos.length === 4) {
      comprobar(
        "el PNG con nombre de WebP entra igual que el PNG bien nombrado",
        fotos[0]!.ancho === 900 && fotos[2]!.ancho === 900 && fotos[2]!.alto === 600,
      );
      comprobar(
        "lo transparente queda blanco, no negro",
        esBlanco(await colorEn(fotos[0]!.jpeg, 600, 400)) &&
          esRojo(await colorEn(fotos[0]!.jpeg, 100, 100)),
      );
      comprobar(
        "una foto que ya está reducida y derecha entra tal cual, sin volver a comprimirla",
        Buffer.compare(fotos[3]!.jpeg, yaLista) === 0,
      );
    }
    comprobar(
      "el PDF adjunto queda fusionado: portada, 4 fotos, sus 2 páginas y la de no incluidos",
      paginas.length === 8,
      `${paginas.length} páginas`,
    );
    comprobar(
      "el archivo dañado y el Word se listan como no incluidos, y nada más",
      noIncluidos.includes("ARCHIVOS NO INCLUIDOS") &&
        iguales(
          noIncluidos.filter((t) => t.startsWith("• ")),
          ["• danada.jpg", "• informe.docx"],
        ),
      noIncluidos.filter((t) => t.startsWith("• ")).join(", "),
    );
  }

  console.log("\nSin tope de fotos: el que tiene tope es el documento\n");

  const tipica = await texturaDeFoto(1600, 1200).jpeg({ quality: 88 }).toBuffer();
  const refTipica = await guardarDePrueba("tipica.jpg", tipica);
  const fotosIguales = (cuantas: number) =>
    Array.from({ length: cuantas }, (_, i) => ({
      id: `m${i}`,
      blobUrl: refTipica,
      fileName: `foto-${String(i + 1).padStart(3, "0")}.jpg`,
      mimeType: "image/jpeg",
    }));
  const ladoMayor = (fotos: FotoEnPdf[]) => Math.max(...fotos.map((f) => Math.max(f.ancho, f.alto)));

  comprobar(
    "la foto de prueba pesa como una real ya reducida por la aplicación",
    tipica.length > 200 * 1024 && tipica.length < 450 * 1024,
    mb(tipica.length),
  );
  comprobar(
    "contraste: 40 de esas, sin reducir, no caben en lo que Vercel entrega",
    40 * tipica.length > TOPE_DE_VERCEL,
    mb(40 * tipica.length),
  );

  const con3 = await generarBytes("un reporte con 3 fotos", () =>
    generarReportePdf(reporte(), fotosIguales(3)),
  );
  if (con3) {
    const fotos = await fotosDelPdf(con3);
    comprobar(
      "van las 3 a calidad completa, sin tocar",
      fotos.length === 3 && fotos.every((f) => Buffer.compare(f.jpeg, tipica) === 0),
    );
  }

  const pesoPorFoto: number[] = [];
  for (const cuantas of [16, 40, 150]) {
    const pdf = await generarBytes(`un reporte con ${cuantas} fotos`, () =>
      generarReportePdf(reporte(), fotosIguales(cuantas)),
    );
    if (!pdf) continue;
    const fotos = await fotosDelPdf(pdf);
    pesoPorFoto.push(fotos.reduce((suma, f) => suma + f.jpeg.length, 0) / fotos.length);
    comprobar(
      `${cuantas} fotos: están todas`,
      fotos.length === cuantas,
      `${fotos.length} de ${cuantas}`,
    );
    comprobar(
      `${cuantas} fotos: el documento se puede descargar y enviar`,
      pdf.length <= PESO_MAXIMO_PDF + 200 * 1024 && pdf.length < TOPE_DE_VERCEL,
      mb(pdf.length),
    );
    comprobar(
      `${cuantas} fotos: aprovecha el espacio que hay, no se queda corta de más`,
      pdf.length > PESO_MAXIMO_PDF / 2,
      mb(pdf.length),
    );
    comprobar(
      `${cuantas} fotos: van reducidas, pero no a menos de lo que se lee`,
      fotos.every((f) => f.jpeg.length < tipica.length) && ladoMayor(fotos) >= 480,
      `lado mayor ${ladoMayor(fotos)} px, ${Math.round(pesoPorFoto.at(-1)! / 1024)} KB cada una`,
    );
  }
  comprobar(
    "a más fotos, menos pesa cada una",
    pesoPorFoto.length === 3 &&
      pesoPorFoto[1]! < pesoPorFoto[0]! &&
      pesoPorFoto[2]! < pesoPorFoto[1]!,
  );

  // El caso de cientos de fotos, sin generarlas: el mismo reparto con un
  // presupuesto que ni al tamaño mínimo alcanza para todas.
  const { leerAdjuntos, prepararAdjuntos } = await import("../src/lib/pdf-adjuntos");
  const APRETADO = 150 * 1024;
  const repartidas = await prepararAdjuntos(await leerAdjuntos(fotosIguales(30)), APRETADO);
  const dentro = repartidas.flatMap((a) => (a.clase === "foto" ? [a.jpeg] : []));
  const fuera = repartidas.filter((a) => a.clase === "fuera").length;
  comprobar(
    "si ni al mínimo caben todas, entran las que caben y las demás se listan: ninguna desaparece",
    dentro.length > 0 && fuera > 0 && dentro.length + fuera === 30,
    `${dentro.length} dentro + ${fuera} listadas`,
  );
  comprobar(
    "y lo que entra respeta el presupuesto",
    dentro.reduce((suma, f) => suma + f.length, 0) <= APRETADO,
  );

  console.log("\nUn PDF adjunto no se puede reducir\n");

  const ruido = await sharp({
    create: {
      width: 1500,
      height: 1100,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: 70 },
    },
  })
    .jpeg({ quality: 93 })
    .toBuffer();
  const escaneado = await PDFDocument.create();
  escaneado.addPage([600, 440]).drawImage(await escaneado.embedJpg(ruido), {
    x: 0,
    y: 0,
    width: 600,
    height: 440,
  });
  const pdfPesado = await escaneado.save();
  const refPesado = await guardarDePrueba("escaneado.pdf", pdfPesado);
  comprobar(
    "contraste: tres copias del PDF de prueba, juntas, pesan más que todo el documento",
    3 * pdfPesado.length > PESO_MAXIMO_PDF,
    `${mb(pdfPesado.length)} cada una`,
  );

  const conPdfs = await generarBytes("un reporte con 3 PDF pesados y 5 fotos", () =>
    generarReportePdf(reporte(), [
      ...[1, 2, 3].map((n) => ({
        id: `p${n}`,
        blobUrl: refPesado,
        fileName: `escaneado-${n}.pdf`,
        mimeType: "application/pdf",
      })),
      ...fotosIguales(5),
    ]),
  );
  if (conPdfs) {
    const textos = (await trazosDelPdf(conPdfs)).flat().map((t) => t.texto);
    const fotos = await fotosDelPdf(conPdfs);
    const fuera = textos.filter((t) => t.startsWith("• escaneado-"));
    comprobar("el documento se puede descargar", conPdfs.length < TOPE_DE_VERCEL, mb(conPdfs.length));
    comprobar(
      "entran los PDF que caben, en orden, y el que no cabe se lista",
      fuera.length >= 1 && fuera.length < 3 && fuera.at(-1) === "• escaneado-3.pdf",
      fuera.join(", "),
    );
    // El PDF adjunto trae su propia imagen: se descuenta al contar las fotos.
    const delReporte = fotos.length - (3 - fuera.length);
    comprobar("las 5 fotos están, reducidas para dejarles sitio", delReporte === 5, `${delReporte}`);
  }

  console.log("\nViáticos con muchos gastos\n");

  const gastos = Array.from({ length: 45 }, (_, i) => ({
    id: `g${i}`,
    blobUrl: refTipica,
    fileName: `recibo-${i + 1}.jpg`,
    mimeType: "image/jpeg",
    concepto: `Gasto de prueba ${String(i + 1).padStart(2, "0")}`,
    fechaGasto: new Date("2026-10-04T12:00:00Z"),
    amount: 1000 * (i + 1),
  }));
  const viaticos = await generarBytes("un reporte de viáticos con 45 gastos", () =>
    generarReporteViaticoPdf(reporte({ type: "viaticos" }), gastos),
  );
  if (viaticos) {
    const paginas = await trazosDelPdf(viaticos);
    const conceptos = paginas
      .flat()
      .filter((t) => t.texto.startsWith("Gasto de prueba ") && t.tamano === 10.5)
      .map((t) => t.texto);
    comprobar(
      "la lista trae los 45 gastos, en orden: no se corta al final de la hoja",
      iguales(conceptos, gastos.map((g) => g.concepto)),
      `${conceptos.length} de 45`,
    );
    comprobar(
      "sigue en otra hoja, que lo dice",
      paginas.some((p) => p.some((t) => t.texto === "GASTOS (45) (CONTINUACIÓN)")),
    );
    comprobar("lleva los 45 recibos", (await fotosDelPdf(viaticos)).length === 45);
    comprobar("y se puede descargar", viaticos.length < TOPE_DE_VERCEL, mb(viaticos.length));
  }
}

// --- El reporte de prueba ---------------------------------------------------
//
// Mismo perfil que el que falló, sin copiar un dato del cliente: un nombre de
// proyecto que no cabe en un renglón, y un detalle de seis párrafos (uno en
// blanco) escrito en un formulario — cinco saltos, los cinco CR+LF.

const PARRAFOS = [
  "Se realizó visita de soporte técnico en planta para la revisión de la línea de extrusión número 2, a solicitud del cliente.",
  "Se verificaron las presiones de trabajo en los manómetros del sistema hidráulico: 120 bar en la entrada y 95 bar en el retorno.",
  "Se reemplazó el sensor de temperatura de la zona 3 (PT100) y se ajustaron los parámetros del controlador.",
  "",
  "Pendiente: el cliente debe programar el cambio del filtro de la bomba de vacío antes de la próxima visita.",
  "Equipo entregado en operación normal a las 12:30 p. m.",
];
const DETALLE_DEL_FORMULARIO = PARRAFOS.join("\r\n");

const BASE: ReporteCompleto = {
  id: "00000000-0000-4000-8000-000000000001",
  companyId: "saas",
  companyName: "SAS",
  currency: "COP",
  authorId: "00000000-0000-4000-8000-000000000002",
  authorName: "Técnico de Prueba",
  type: "servicio",
  quoteId: null,
  projectName:
    "Soporte Técnico En Sitio  Línea de Extrusión Sept-24 Sept-25-Planta Demo Colombia",
  purchaseOrderNo: null,
  quoteNumber: "Q2026_001",
  clientName: `Plásticos O${c(0x2019)}Brien & Cía. S.A.S.`,
  workDate: new Date("2026-10-04T12:00:00Z"),
  details: DETALLE_DEL_FORMULARIO,
  status: "terminado",
  serviceType: "soporte",
  completedAt: new Date("2026-10-04T17:36:46Z"),
  signatureUrl: null,
  signatureName: null,
  signatureEmail: null,
  signedAt: null,
  createdAt: new Date("2026-10-04T17:23:03Z"),
  updatedAt: new Date("2026-10-04T17:36:46Z"),
  updatedBy: null,
  attachmentCount: 0,
  etiquetas: ["online"],
};

function reporte(cambios: Partial<ReporteCompleto> = {}): ReporteCompleto {
  return { ...BASE, ...cambios };
}

async function main() {
  // Importación diferida: `pdf.ts` carga `storage.ts`, y este `env.ts`, que
  // valida las variables al cargarse — dotenv tiene que haber corrido antes.
  const { envolverTexto, normalizarSaltos, textoDibujable } = await import(
    "../src/lib/pdf-texto"
  );
  const { generarReportePdf, generarReporteViaticoPdf } = await import(
    "../src/lib/pdf"
  );
  const { formatearMonto } = await import("../src/lib/moneda");

  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  /** El ancho del detalle: una hoja A4 menos sus dos márgenes. */
  const ANCHO = 499;
  const TAMANO = 10.5;

  console.log("\nLo que falló en producción\n");

  const errorCrudo = mensajeDeError(() => normal.widthOfTextAtSize("uno\r\ndos", TAMANO));
  comprobar(
    "contraste: la librería, sin limpiar el texto, lanza con un salto CR+LF",
    errorCrudo !== null && errorCrudo.includes("WinAnsi cannot encode"),
    errorCrudo ?? "no lanzó",
  );
  comprobar(
    "el detalle de prueba trae lo mismo que el de producción: 5 saltos, los 5 con CR",
    DETALLE_DEL_FORMULARIO.split("\r").length - 1 === 5 &&
      DETALLE_DEL_FORMULARIO.split("\n").length - 1 === 5,
  );

  const delFormulario = await generar("el reporte con el detalle del formulario", () =>
    generarReportePdf(reporte(), []),
  );

  if (delFormulario) {
    const portada = delFormulario[0]!;
    const textos = portada.map((t) => t.texto);
    const esperado = envolverTexto(DETALLE_DEL_FORMULARIO, normal, TAMANO, ANCHO);
    const inicio = textos.indexOf(esperado[0]!);
    const dibujado = portada.slice(inicio, inicio + esperado.length);

    comprobar("tiene una sola página (no lleva firma ni adjuntos)", delFormulario.length === 1);
    comprobar(
      "el detalle está dibujado renglón por renglón, en orden",
      inicio >= 0 && iguales(dibujado.map((t) => t.texto), esperado),
      `${esperado.length} renglones`,
    );
    comprobar(
      "no se perdió ni una palabra de los párrafos",
      dibujado.map((t) => t.texto).filter(Boolean).join(" ") ===
        PARRAFOS.filter(Boolean).join(" "),
    );
    comprobar(
      "cada párrafo empieza en un renglón propio",
      PARRAFOS.filter(Boolean).every((parrafo) =>
        dibujado.some((t) => t.texto.length > 20 && parrafo.startsWith(t.texto)),
      ),
    );
    comprobar(
      "el renglón en blanco que dejó quien escribió sigue ahí",
      dibujado.some((t) => t.texto === ""),
    );
    comprobar(
      "cada renglón va debajo del anterior, sin montarse",
      dibujado.every((t, i) => i === 0 || Math.abs(dibujado[i - 1]!.y - t.y - 15) < 0.01),
    );
    comprobar(
      "ningún texto del documento lleva caracteres de control",
      textos.every((t) => [...t].every((ch) => ch.codePointAt(0)! >= 32)),
    );
    comprobar(
      "el nombre del cliente, con el apóstrofo del teclado del iPhone, está tal cual",
      textos.includes(BASE.clientName),
    );
    comprobar(
      "contraste: un texto que no está en el reporte no aparece",
      !textos.some((t) => t.includes("Texto que nadie escribió")),
    );
  }

  for (const [nombre, salto] of [
    ["LF", "\n"],
    ["CR suelto", "\r"],
  ] as const) {
    const variante = await generar(`el mismo detalle con saltos ${nombre}`, () =>
      generarReportePdf(reporte({ details: PARRAFOS.join(salto) }), []),
    );
    if (variante && delFormulario) {
      comprobar(
        `con saltos ${nombre} se dibuja exactamente lo mismo que con CR+LF`,
        iguales(
          variante[0]!.filter(sobreElPie).map((t) => t.texto),
          delFormulario[0]!.filter(sobreElPie).map((t) => t.texto),
        ),
      );
    }
  }

  const unaLinea = await generar("un detalle de una sola línea (lo único que se probaba)", () =>
    generarReportePdf(reporte({ details: "Mantenimiento preventivo sin novedad." }), []),
  );
  if (unaLinea) {
    comprobar(
      "el detalle de una línea está en el documento",
      unaLinea[0]!.some((t) => t.texto === "Mantenimiento preventivo sin novedad."),
    );
  }

  const sinDetalle = await generar("un reporte sin detalle", () =>
    generarReportePdf(reporte({ details: null }), []),
  );
  if (sinDetalle) {
    comprobar(
      "lo dice, en vez de dejar el espacio vacío",
      sinDetalle[0]!.some((t) => t.texto === "Sin detalles."),
    );
  }

  console.log("\nSaltos de línea\n");

  const SALTOS: [string, string][] = [
    ["CR+LF (Windows, y todo <textarea>)", "\r\n"],
    ["LF (Unix)", "\n"],
    ["CR suelto", "\r"],
    ["tabulador vertical", c(0x0b)],
    ["salto de página", c(0x0c)],
    ["NEL (U+0085)", c(0x85)],
    ["separador de línea (U+2028)", c(0x2028)],
    ["separador de párrafo (U+2029)", c(0x2029)],
  ];
  for (const [nombre, salto] of SALTOS) {
    const lineas = envolverTexto(`uno${salto}dos`, normal, TAMANO, ANCHO);
    comprobar(
      `${nombre}: dos renglones, ni pegados ni con uno de más`,
      iguales(lineas, ["uno", "dos"]),
      JSON.stringify(lineas),
    );
  }
  comprobar(
    "un renglón en blanco entre dos párrafos se conserva",
    iguales(envolverTexto("uno\r\n\r\ndos", normal, TAMANO, ANCHO), ["uno", "", "dos"]),
  );
  comprobar(
    "el CR suelto se convierte en salto, no se borra (borrarlo pegaría dos renglones)",
    normalizarSaltos("uno\rdos") === "uno\ndos",
  );
  comprobar(
    "en un texto de un solo renglón (un campo de la ficha), el salto es un espacio",
    textoDibujable("uno\r\ndos", normal) === "uno dos",
  );

  console.log("\nLo que se conserva tal cual\n");

  const ESPANOL = `Instalación eléctrica: señal de 4${c(0x2013)}20 mA, presión ${c(0xb1)}0,5 bar a 25 ${c(0xb0)}C, 10 ${c(0xb5)}m. ${c(0xbf)}Listo? ${c(0xa1)}Sí! Ñandú, pingüino, 1${c(0xba)} y 2${c(0xaa)}, 50 ${c(0x20ac)}.`;
  comprobar(
    "tildes, eñes, grados, micro, más-menos, ordinales y euro",
    textoDibujable(ESPANOL, normal) === ESPANOL,
    textoDibujable(ESPANOL, normal),
  );
  const IPHONE = `El cliente dijo ${c(0x201c)}todo bien${c(0x201d)} ${c(0x2014)} no hay pendientes${c(0x2026)} O${c(0x2019)}Brien`;
  comprobar(
    "la puntuación tipográfica que pone el teclado del iPhone",
    textoDibujable(IPHONE, normal) === IPHONE,
    textoDibujable(IPHONE, normal),
  );
  const HORA = `12:30 p.${c(0xa0)}m.`;
  comprobar(
    "el espacio de no separación (lo traen las horas y los montos)",
    textoDibujable(HORA, normal) === HORA,
  );

  console.log("\nLo que se traduce a algo que sí se puede dibujar\n");

  const TRADUCCIONES: [string, string, string][] = [
    ["tabulador", "a\tb", "a    b"],
    ["espacio fino de no separación (U+202F)", `12:30${c(0x202f)}p. m.`, "12:30 p. m."],
    ["espacio fino (U+2009)", `5${c(0x2009)}bar`, "5 bar"],
    ["tilde suelta, de un texto descompuesto", `Instalacio${c(0x301)}n`, "Instalación"],
    ["marca de orden de bytes y espacio de ancho cero", `${c(0xfeff)}va${c(0x200b)}cío`, "vacío"],
    ["guion opcional", `sen${c(0xad)}sor`, "sensor"],
    ["emoji", `Listo ${c(0x1f44d)}`, "Listo "],
    ["emoji con tono de piel", `Listo ${c(0x1f44d)}${c(0x1f3fd)}`, "Listo "],
    [
      "emoji compuesto (familia)",
      `${c(0x1f468)}${c(0x200d)}${c(0x1f469)}${c(0x200d)}${c(0x1f467)} equipo`,
      " equipo",
    ],
    ["bandera", `${c(0x1f1e8)}${c(0x1f1f4)} Colombia`, " Colombia"],
    ["tecla numerada", `1${c(0xfe0f)}${c(0x20e3)} paso`, "1 paso"],
    ["visto bueno", `${c(0x2705)} Bomba 1`, "[OK] Bomba 1"],
    ["cruz", `${c(0x274c)} Bomba 2`, "[X] Bomba 2"],
    ["advertencia", `${c(0x26a0)}${c(0xfe0f)} Fuga`, "[!] Fuga"],
    ["ohmios", `120 ${c(0x3a9)}`, "120 ohm"],
    ["mu griega, al signo micro", `10 ${c(0x3bc)}m`, `10 ${c(0xb5)}m`],
    ["menor o igual", `P ${c(0x2264)} 6 bar`, "P <= 6 bar"],
    ["flecha", `A ${c(0x2192)} B`, "A -> B"],
    ["subíndice", `CO${c(0x2082)}`, "CO2"],
    ["grados Celsius en un solo carácter", `25 ${c(0x2103)}`, `25 ${c(0xb0)}C`],
    ["guion de no separación", `PT${c(0x2011)}100`, "PT-100"],
    ["letras de otro alfabeto, a la vista y no borradas", `${c(0x416)}${c(0x4e2d)}`, "??"],
  ];
  for (const [nombre, entrada, salida] of TRADUCCIONES) {
    const obtenido = textoDibujable(entrada, normal);
    comprobar(nombre, obtenido === salida, JSON.stringify(obtenido));
  }

  console.log("\nNingún carácter puede tumbar el documento\n");

  // De a 256 y no de a uno: son 1,1 millones, y en bloque además se prueban
  // combinados entre sí. Cada bloque pasa por los dos caminos que usa el
  // generador (un renglón, y varios) y por las dos fuentes.
  const TOTAL = 0x110000;
  let rechazaLaLibreria = 0;
  for (let codigo = 0; codigo < 0x300; codigo++) {
    if (mensajeDeError(() => normal.encodeText(c(codigo))) !== null) rechazaLaLibreria++;
  }
  comprobar(
    "contraste: de los primeros 768 caracteres de Unicode, la librería sola rechaza la mayoría",
    rechazaLaLibreria > 500,
    `${rechazaLaLibreria} rechazados`,
  );

  let bloquesRotos = 0;
  let primerRoto = "";
  for (let desde = 0; desde < TOTAL; desde += 256) {
    const bloque = Array.from({ length: 256 }, (_, i) => c(desde + i)).join("");
    const error = mensajeDeError(() => {
      normal.encodeText(textoDibujable(bloque, normal));
      for (const linea of envolverTexto(bloque, negrita, TAMANO, ANCHO)) {
        negrita.encodeText(linea);
      }
    });
    if (error !== null) {
      bloquesRotos++;
      primerRoto ||= `desde U+${desde.toString(16)}: ${error}`;
    }
  }
  comprobar(
    `los ${TOTAL.toLocaleString("es-CO")} caracteres de Unicode, ya limpios, se pueden dibujar`,
    bloquesRotos === 0,
    primerRoto,
  );

  console.log("\nPárrafos largos\n");

  const PARRAFO_LARGO = Array.from(
    { length: 80 },
    (_, i) => `palabra${i + 1} de un párrafo largo`,
  ).join(" ");
  const renglones = envolverTexto(PARRAFO_LARGO, normal, TAMANO, ANCHO);
  comprobar(
    "se parte en renglones que caben en el ancho de la hoja",
    renglones.length > 1 && renglones.every((r) => normal.widthOfTextAtSize(r, TAMANO) <= ANCHO),
    `${renglones.length} renglones`,
  );
  comprobar(
    "al partirlo no se pierde ni se repite ninguna palabra",
    renglones.join(" ") === PARRAFO_LARGO,
  );

  console.log("\nNombre de proyecto que no cabe en un renglón\n");

  const esTitulo = (t: Trazo) => t.tamano === 19;
  const corto = await generar("un nombre de proyecto corto", () =>
    generarReportePdf(reporte({ projectName: "Mantenimiento de tablero" }), []),
  );
  if (corto && delFormulario) {
    for (const [nombre, pagina] of [
      ["corto", corto[0]!],
      ["largo", delFormulario[0]!],
    ] as const) {
      const titulo = pagina.filter(esTitulo);
      const etiqueta = pagina.find((t) => t.texto === "CLIENTE");
      const ultimo = titulo.at(-1);
      comprobar(
        `nombre ${nombre}: ocupa ${nombre === "corto" ? "un renglón" : "más de un renglón"}`,
        nombre === "corto" ? titulo.length === 1 : titulo.length > 1,
        `${titulo.length}`,
      );
      comprobar(
        `nombre ${nombre}: la ficha empieza debajo de su último renglón, no encima`,
        Boolean(etiqueta && ultimo) && Math.abs(ultimo!.y - etiqueta!.y - 34) < 0.01,
        etiqueta && ultimo ? `${ultimo.y - etiqueta.y} pt de separación` : "no se encontró",
      );
    }
    comprobar(
      "el nombre largo está completo",
      delFormulario[0]!
        .filter(esTitulo)
        .map((t) => t.texto)
        .join(" ") === BASE.projectName,
    );
  }

  console.log("\nDetalle que no cabe en una página\n");

  const PUNTOS = Array.from(
    { length: 120 },
    (_, i) => `Punto ${String(i + 1).padStart(3, "0")}: revisado y en operación.`,
  );
  const largo = await generar("un detalle de 120 renglones", () =>
    generarReportePdf(reporte({ details: PUNTOS.join("\r\n") }), []),
  );
  if (largo) {
    const esPunto = (t: Trazo) => t.texto.startsWith("Punto ");
    const dibujados = largo.flatMap((pagina) => pagina.filter(esPunto));
    comprobar(
      "están los 120, una vez cada uno y en orden: nada se corta al final de la hoja",
      iguales(dibujados.map((t) => t.texto), PUNTOS),
      `${dibujados.length} de ${PUNTOS.length}`,
    );
    comprobar("sigue en las páginas que haga falta", largo.length > 1, `${largo.length} páginas`);
    comprobar(
      "ningún renglón invade el pie de página",
      dibujados.every(sobreElPie),
    );
    comprobar(
      "cada página de continuación lleva el encabezado y dice que es continuación",
      largo
        .slice(1)
        .every(
          (pagina) =>
            pagina.some((t) => t.texto === "REPORTE DE SERVICIO") &&
            pagina.some((t) => t.texto === "DETALLES DEL TRABAJO (CONTINUACIÓN)"),
        ),
    );
    comprobar(
      "el pie numera todas las páginas",
      largo.every((pagina, i) =>
        pagina.some((t) => t.texto === `Página ${i + 1} de ${largo.length}`),
      ),
    );
  }
  if (delFormulario) {
    comprobar(
      "contraste: un detalle que cabe no agrega páginas",
      delFormulario.length === 1,
    );
  }

  console.log("\nCaracteres especiales en cualquier campo\n");

  const raro = await generar(
    "un reporte con emojis, símbolos y otros alfabetos en todos sus campos",
    () =>
      generarReportePdf(
        reporte({
          projectName: `Línea 2 ${c(0x2192)} arranque ${c(0x2705)}\tfase 1`,
          clientName: `Cliente ${c(0x416)}${c(0x4e2d)} S.A.S.`,
          purchaseOrderNo: `OC${c(0x2011)}4500${c(0x202f)}123`,
          quoteNumber: `Q2026_001${c(0x200b)}`,
          authorName: `Jose${c(0x301)} Pe${c(0x301)}rez ${c(0x1f44d)}`,
          details: `Resistencia: 120 ${c(0x3a9)}\tOK\r\n${c(0x274c)} Bomba 2 ${c(0x26a0)}${c(0xfe0f)} fuga\r\nP ${c(0x2264)} 6 bar`,
        }),
        [
          {
            id: "a1",
            blobUrl: "local:prueba-pdf-no-existe-1.png",
            fileName: `Captura 2026-10-04 a la(s) 1.26.33${c(0x202f)}p.${c(0xa0)}m..png`,
            mimeType: "image/png",
          },
          {
            id: "a2",
            blobUrl: "local:prueba-pdf-no-existe-2.pdf",
            fileName: `Plano ${c(0x1f4d0)} eléctrico.pdf`,
            mimeType: "application/pdf",
          },
        ],
      ),
  );
  if (raro) {
    const textos = raro.flat().map((t) => t.texto);
    comprobar(
      "las marcas de estado del detalle quedan escritas",
      textos.includes("[X] Bomba 2 [!] fuga"),
    );
    comprobar(
      "los símbolos del detalle quedan traducidos",
      textos.includes("Resistencia: 120 ohm    OK") && textos.includes("P <= 6 bar"),
    );
    comprobar(
      "el nombre con las tildes sueltas queda compuesto",
      textos.some((t) => t.trim() === "José Pérez"),
    );
    comprobar(
      "la orden de compra queda legible",
      textos.some((t) => t.trim() === "OC-4500 123"),
    );
    comprobar(
      "los archivos que no se pudieron incluir se listan en su propia página",
      raro.length === 2 &&
        raro[1]!.some((t) => t.texto.includes("Captura 2026-10-04 a la(s) 1.26.33 p.")) &&
        raro[1]!.some((t) => t.texto.includes("Plano  eléctrico.pdf")),
      `${raro.length} páginas`,
    );
  }

  console.log("\nReporte de viáticos\n");

  const viaticos = await generar("un reporte de viáticos con emoji y tabulador en el concepto", () =>
    generarReporteViaticoPdf(reporte({ type: "viaticos" }), [
      {
        id: "g1",
        blobUrl: "local:prueba-pdf-no-existe-3.jpg",
        fileName: "recibo.jpg",
        mimeType: "image/jpeg",
        concepto: `Almuerzo ${c(0x1f354)}\tdel equipo`,
        fechaGasto: new Date("2026-10-04T12:00:00Z"),
        amount: 45000,
      },
      {
        id: "g2",
        blobUrl: "local:prueba-pdf-no-existe-4.jpg",
        fileName: "taxi.jpg",
        mimeType: "image/jpeg",
        concepto: null,
        fechaGasto: null,
        amount: null,
      },
    ]),
  );
  if (viaticos) {
    const textos = viaticos.flat().map((t) => t.texto);
    comprobar(
      "el concepto está, sin el emoji",
      textos.some((t) => t.replace(/ +/g, " ").trim() === "Almuerzo del equipo"),
    );
    comprobar(
      "el monto está, con su separador de miles",
      textos.includes(formatearMonto(45000, "COP")),
      formatearMonto(45000, "COP"),
    );
    comprobar("el gasto sin concepto lo dice", textos.includes("Sin concepto"));
  }

  try {
    await comprobarFotos();
  } finally {
    await borrarArchivosDePrueba();
  }

  console.log("\nNombre con el que se descarga\n");

  const { nombreDelPdf, sanearNombre } = await import("../src/lib/archivos");
  comprobar(
    "las tildes se le quitan a la letra, no se cambia la letra por un guion",
    nombreDelPdf("Soporte Técnico  Línea 2 – Ñandú") === "reporte-soporte-tecnico-linea-2-nandu.pdf",
    nombreDelPdf("Soporte Técnico  Línea 2 – Ñandú"),
  );
  const nombreRaro = nombreDelPdf(`${c(0x1f44d)} Planta ${c(0x4e2d)} / fase 1`);
  comprobar(
    "cualquier nombre de proyecto da un nombre que cabe en una cabecera HTTP",
    /^reporte-[a-z0-9-]+\.pdf$/.test(nombreRaro) && nombreRaro.length <= 100,
    nombreRaro,
  );
  comprobar(
    "un nombre sin nada aprovechable no deja el archivo sin nombre",
    nombreDelPdf(c(0x1f44d)) === "reporte-servicio.pdf",
  );
  comprobar(
    "el nombre de un adjunto pierde los caracteres de control y las rutas",
    sanearNombre(`..${c(0x00)}foto${c(0x1f)}/de\\obra${c(0x7f)}.jpg`) === "foto_de_obra.jpg",
    JSON.stringify(sanearNombre(`..${c(0x00)}foto${c(0x1f)}/de\\obra${c(0x7f)}.jpg`)),
  );

  console.log("\nNadie dibuja texto por fuera de pdf-texto.ts\n");

  // Si alguien llama a la librería directamente, su texto se salta la
  // limpieza y vuelve a ser cuestión de tiempo que un carácter tumbe el PDF.
  const LLAMADA_DIRECTA = /\.(drawText|widthOfTextAtSize|encodeText)\(/;
  const conLlamadas: string[] = [];
  for (const entrada of await readdir("src", { recursive: true, withFileTypes: true })) {
    if (!entrada.isFile() || !/\.tsx?$/.test(entrada.name)) continue;
    const ruta = path.join(entrada.parentPath, entrada.name);
    if (LLAMADA_DIRECTA.test(await readFile(ruta, "utf8"))) {
      conLlamadas.push(ruta.split(path.sep).join("/"));
    }
  }
  comprobar(
    "el único archivo de src/ que llama a drawText o widthOfTextAtSize es pdf-texto.ts",
    iguales(conLlamadas, ["src/lib/pdf-texto.ts"]),
    conLlamadas.join(", ") || "ninguno: el buscador no está encontrando nada",
  );

  console.log(
    fallos === 0
      ? "\nTodas las comprobaciones pasaron.\n"
      : `\n${fallos} comprobación(es) fallaron.\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
