/**
 * Prueba de qué archivos acepta el servidor al subirlos.
 *
 *   npm run test:archivos
 *
 * No toca la base ni el almacenamiento: son las funciones que deciden, con el
 * archivo en la mano, si entra y como qué se guarda.
 *
 * El caso que la motivó (2026-10-04): Safari no sabe escribir WebP, y cuando
 * la aplicación le pedía reducir una foto a ese formato devolvía un PNG sin
 * avisar. Llegaba al servidor un PNG llamado `IMG_3041.webp`, y el servidor lo
 * rechazaba con "el contenido no corresponde a su extensión". Ninguna foto
 * reducida entraba desde un iPhone.
 */
import sharp from "sharp";

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(
    `${condicion ? "  ok  " : " FALLA"}  ${descripcion}${detalle ? `  (${detalle})` : ""}`,
  );
  if (!condicion) fallos++;
}

function archivo(nombre: string, tipo: string, datos: Uint8Array): File {
  // `Uint8Array.from` copia a un búfer propio, que es lo que `File` admite.
  return new File([Uint8Array.from(datos)], nombre, { type: tipo });
}

async function main() {
  const { aceptarArchivo, aceptarMiniatura } = await import("../src/lib/archivo-subido");
  const { ACEPTAR_EN_SELECTOR, MAX_BYTES, pareceFoto } = await import("../src/lib/archivos");
  const { tipoRealDeImagen } = await import("../src/lib/archivos-firma");

  const lienzo = sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 200, g: 60, b: 60 } },
  });
  const jpeg = await lienzo.clone().jpeg().toBuffer();
  const png = await lienzo.clone().png().toBuffer();
  const webp = await lienzo.clone().webp().toBuffer();
  const gif = await lienzo.clone().gif().toBuffer();
  const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200, 1)]);
  const ejecutable = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 2)]);
  // Un video MP4: comparte con el HEIC la cabecera "ftyp", pero no es una foto.
  const mp4 = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from("ftypisom"),
    Buffer.alloc(200, 3),
  ]);
  const heic = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from("ftypheic"),
    Buffer.alloc(200, 4),
  ]);

  console.log("\nLo que mandaba Safari\n");

  const deSafari = await aceptarArchivo(archivo("IMG_3041.webp", "image/webp", png));
  comprobar(
    "un PNG con nombre y etiqueta de WebP se acepta",
    deSafari.ok,
    deSafari.ok ? "" : deSafari.error,
  );
  if (deSafari.ok) {
    comprobar(
      "y se guarda como lo que es: PNG, con su extensión y su nombre corregidos",
      deSafari.archivo.mimeType === "image/png" &&
        deSafari.archivo.extension === ".png" &&
        deSafari.archivo.fileName === "IMG_3041.png",
      `${deSafari.archivo.mimeType}, ${deSafari.archivo.fileName}`,
    );
  }

  console.log("\nUna foto entra por su contenido\n");

  const FOTOS: [string, string, string, Buffer, string, string][] = [
    ["JPEG bien nombrado", "foto.jpg", "image/jpeg", jpeg, "image/jpeg", "foto.jpg"],
    ["JPEG con extensión .jpeg: conserva su nombre", "IMG_3027.jpeg", "image/jpeg", jpeg, "image/jpeg", "IMG_3027.jpeg"],
    ["PNG bien nombrado", "captura.png", "image/png", png, "image/png", "captura.png"],
    ["WebP bien nombrado", "foto.webp", "image/webp", webp, "image/webp", "foto.webp"],
    ["JPEG llamado .png", "foto.png", "image/png", jpeg, "image/jpeg", "foto.jpg"],
    ["JPEG sin tipo declarado", "foto.jpg", "", jpeg, "image/jpeg", "foto.jpg"],
    ["JPEG sin extensión", "foto", "image/jpeg", jpeg, "image/jpeg", "foto.jpg"],
  ];
  for (const [nombre, archivoNombre, tipo, datos, tipoEsperado, nombreEsperado] of FOTOS) {
    const r = await aceptarArchivo(archivo(archivoNombre, tipo, datos));
    comprobar(
      nombre,
      r.ok && r.archivo.mimeType === tipoEsperado && r.archivo.fileName === nombreEsperado,
      r.ok ? `${r.archivo.mimeType}, ${r.archivo.fileName}` : r.error,
    );
  }

  console.log("\nLo que sigue sin entrar\n");

  const RECHAZOS: [string, string, string, Buffer][] = [
    ["un ejecutable renombrado a .pdf", "factura.pdf", "application/pdf", ejecutable],
    ["un ejecutable renombrado a .jpg", "foto.jpg", "image/jpeg", ejecutable],
    ["un PDF que dice ser una foto", "foto.jpg", "image/jpeg", pdf],
    ["un video con extensión de foto", "video.heic", "image/heic", mp4],
    ["un GIF (formato que no se acepta)", "animacion.gif", "image/gif", gif],
    ["un archivo comprimido cualquiera", "cosas.zip", "application/zip", zip],
    ["un archivo vacío", "vacio.jpg", "image/jpeg", Buffer.alloc(0)],
  ];
  for (const [nombre, archivoNombre, tipo, datos] of RECHAZOS) {
    const r = await aceptarArchivo(archivo(archivoNombre, tipo, datos));
    comprobar(`${nombre}: rechazado`, !r.ok, r.ok ? `entró como ${r.archivo.mimeType}` : r.error);
  }

  const grande = await aceptarArchivo(
    archivo("escaneo.pdf", "application/pdf", Buffer.concat([pdf, Buffer.alloc(MAX_BYTES)])),
  );
  comprobar("un PDF de más de 4 MB: rechazado por tamaño", !grande.ok && grande.error.includes("4 MB"));

  console.log("\nLos documentos tienen que decir la verdad\n");

  const DOCUMENTOS: [string, string, string, Buffer, boolean][] = [
    ["PDF", "plano.pdf", "application/pdf", pdf, true],
    [
      "Word (.docx)",
      "informe.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      zip,
      true,
    ],
    ["PDF con extensión de Word", "plano.docx", "application/pdf", pdf, false],
    [
      "Word cuyo contenido es un PDF",
      "informe.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pdf,
      false,
    ],
  ];
  for (const [nombre, archivoNombre, tipo, datos, entra] of DOCUMENTOS) {
    const r = await aceptarArchivo(archivo(archivoNombre, tipo, datos));
    comprobar(`${nombre}: ${entra ? "aceptado" : "rechazado"}`, r.ok === entra, r.ok ? "" : r.error);
  }

  console.log("\nMiniaturas\n");

  comprobar(
    "una miniatura JPEG (las de ahora) se guarda como JPEG",
    (await aceptarMiniatura(archivo("m.jpg", "image/jpeg", jpeg)))?.mimeType === "image/jpeg",
  );
  comprobar(
    "una miniatura WebP (las de antes) se sigue aceptando",
    (await aceptarMiniatura(archivo("m.webp", "image/webp", webp)))?.mimeType === "image/webp",
  );
  comprobar(
    "algo que no es una imagen no se guarda como miniatura",
    (await aceptarMiniatura(archivo("m.jpg", "image/jpeg", ejecutable))) === null,
  );
  comprobar("sin miniatura no pasa nada", (await aceptarMiniatura(null)) === null);

  console.log("\nQué es de verdad cada cosa\n");

  comprobar("un HEIC de verdad se reconoce como HEIC", tipoRealDeImagen(heic) === "image/heic");
  comprobar(
    "contraste: un MP4, que empieza casi igual, no",
    tipoRealDeImagen(mp4) === null,
  );

  console.log("\nLo que el navegador trata como foto\n");

  comprobar(
    "el selector pide imágenes en general y no ofrece .heic por su nombre",
    ACEPTAR_EN_SELECTOR.split(",").includes("image/*") && !ACEPTAR_EN_SELECTOR.includes("heic"),
    ACEPTAR_EN_SELECTOR,
  );
  comprobar(
    "y sigue ofreciendo PDF, Word y Excel",
    [".pdf", ".doc", ".docx", ".xls", ".xlsx"].every((ext) =>
      ACEPTAR_EN_SELECTOR.split(",").includes(ext),
    ),
  );
  comprobar(
    "una foto sin tipo declarado se reconoce por su extensión",
    pareceFoto({ name: "IMG_0001.HEIC", type: "" }) && pareceFoto({ name: "a.jpg", type: "" }),
  );
  comprobar(
    "un PDF no se trata como foto",
    !pareceFoto({ name: "plano.pdf", type: "application/pdf" }),
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
