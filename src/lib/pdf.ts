import "server-only";

import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

import { tipoServicioLabel, ordenarEtiquetas } from "@/lib/etiquetas";
import { formatFechaLarga, formatInstante } from "@/lib/fechas";
import { formatearMonto } from "@/lib/moneda";
import { leerArchivo } from "@/lib/storage";
import type { ReporteCompleto } from "@/lib/queries/reports";

/**
 * PDF del reporte: info + firma + viáticos + adjuntos, todo en un solo
 * documento para que quede como constancia completa del trabajo.
 *
 * Fotos y PDFs se fusionan de verdad (páginas nuevas o copiadas). Word/Excel
 * no se pueden fusionar sin convertirlos primero — eso exigiría una
 * dependencia de conversión mucho más pesada para un caso que en la
 * práctica casi no ocurre (los adjuntos normales son foto o PDF) — así que
 * esos quedan solo listados por nombre, con la aclaración de que hay que
 * descargarlos aparte.
 *
 * `sharp` se usa únicamente aquí, no en la subida de archivos: PDF no
 * admite WebP como formato de imagen embebida (la mayoría de las fotos se
 * guardan así, ver `imagen-cliente.ts`), así que hay que convertirlas antes
 * de insertarlas. Es un costo que solo paga quien pide el PDF, no cada
 * petición de la aplicación — por eso aquí sí se justifica, a diferencia de
 * la subida, donde afectaría el arranque en frío de todos los usuarios.
 */

const A4: [number, number] = [595, 842];
const MARGEN = 48;
const COLOR_TEXTO = rgb(0.06, 0.08, 0.11);
const COLOR_MUTED = rgb(0.4, 0.45, 0.52);

type Adjunto = { id: string; blobUrl: string; fileName: string; mimeType: string };

function envolverTexto(
  texto: string,
  font: PDFFont,
  tamano: number,
  anchoMaximo: number,
): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(" ")) {
      const candidata = actual ? `${actual} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(candidata, tamano) > anchoMaximo && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = candidata;
      }
    }
    lineas.push(actual);
  }
  return lineas;
}

/** Convierte a PNG o JPG si hace falta: PDF solo admite esos dos formatos de imagen. */
async function comoImagenEmbebible(
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<{ bytes: Uint8Array; esJpg: boolean }> {
  if (mimeType === "image/jpeg") return { bytes: new Uint8Array(bytes), esJpg: true };
  if (mimeType === "image/png") return { bytes: new Uint8Array(bytes), esJpg: false };

  const png = await sharp(Buffer.from(bytes)).rotate().png().toBuffer();
  return { bytes: new Uint8Array(png), esJpg: false };
}

async function agregarPaginaImagen(
  doc: PDFDocument,
  font: PDFFont,
  bytes: ArrayBuffer,
  mimeType: string,
  titulo: string,
  subtitulo?: string,
): Promise<void> {
  const { bytes: datos, esJpg } = await comoImagenEmbebible(bytes, mimeType);
  const imagen = esJpg ? await doc.embedJpg(datos) : await doc.embedPng(datos);

  const page = doc.addPage(A4);
  const [anchoPagina, altoPagina] = A4;
  const anchoDisponible = anchoPagina - MARGEN * 2;
  const altoDisponible = altoPagina - MARGEN * 2 - 50; // espacio para el título

  const escala = Math.min(
    anchoDisponible / imagen.width,
    altoDisponible / imagen.height,
    1,
  );
  const w = imagen.width * escala;
  const h = imagen.height * escala;

  page.drawText(titulo, {
    x: MARGEN,
    y: altoPagina - MARGEN - 14,
    size: 12,
    font,
    color: COLOR_TEXTO,
  });
  if (subtitulo) {
    page.drawText(subtitulo, {
      x: MARGEN,
      y: altoPagina - MARGEN - 30,
      size: 10,
      font,
      color: COLOR_MUTED,
    });
  }

  page.drawImage(imagen, {
    x: (anchoPagina - w) / 2,
    y: (altoPagina - 50 - h) / 2,
    width: w,
    height: h,
  });
}

async function fusionarPdf(
  doc: PDFDocument,
  bytes: ArrayBuffer,
): Promise<boolean> {
  try {
    const origen = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const paginas = await doc.copyPages(origen, origen.getPageIndices());
    for (const pagina of paginas) doc.addPage(pagina);
    return true;
  } catch {
    return false;
  }
}

/** Agrega la foto o el PDF de un ítem (viático o adjunto); si no se puede, lo deja listado. */
async function agregarArchivo(
  doc: PDFDocument,
  font: PDFFont,
  item: Adjunto,
  titulo: string,
  subtitulo: string | undefined,
  sinFusionar: string[],
): Promise<void> {
  const datos = await leerArchivo(item.blobUrl);
  if (!datos) {
    sinFusionar.push(item.fileName);
    return;
  }

  if (item.mimeType === "application/pdf") {
    const ok = await fusionarPdf(doc, datos);
    if (!ok) sinFusionar.push(item.fileName);
    return;
  }

  if (item.mimeType.startsWith("image/")) {
    try {
      await agregarPaginaImagen(doc, font, datos, item.mimeType, titulo, subtitulo);
    } catch {
      sinFusionar.push(item.fileName);
    }
    return;
  }

  sinFusionar.push(item.fileName);
}

function agregarLista(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  etiqueta: string,
  valor: string,
): number {
  page.drawText(etiqueta, { x, y, size: 9, font, color: COLOR_MUTED });
  page.drawText(valor, { x, y: y - 14, size: 11, font, color: COLOR_TEXTO });
  return y - 34;
}

export async function generarReportePdf(
  reporte: ReporteCompleto,
  adjuntos: Adjunto[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // --- Página 1: ficha del reporte ---
  const portada = doc.addPage(A4);
  const [ancho, alto] = A4;
  let y = alto - MARGEN;

  portada.drawText(reporte.projectName, {
    x: MARGEN,
    y,
    size: 18,
    font: fontBold,
    color: COLOR_TEXTO,
    maxWidth: ancho - MARGEN * 2,
  });
  y -= 28;
  portada.drawText(reporte.companyName, {
    x: MARGEN,
    y,
    size: 11,
    font,
    color: COLOR_MUTED,
  });
  y -= 34;

  const columna1 = MARGEN;
  const columna2 = MARGEN + (ancho - MARGEN * 2) / 2;
  const inicioFilas = y;

  y = agregarLista(portada, font, columna1, y, "CLIENTE", reporte.clientName);
  y = agregarLista(
    portada,
    font,
    columna1,
    y,
    "COTIZACIÓN",
    reporte.quoteNumber ?? "Sin asignar",
  );
  y = agregarLista(
    portada,
    font,
    columna1,
    y,
    "ORDEN DE COMPRA",
    reporte.purchaseOrderNo ?? "Sin asignar",
  );
  y = agregarLista(
    portada,
    font,
    columna1,
    y,
    "FECHA DEL TRABAJO",
    formatFechaLarga(reporte.workDate),
  );
  y = agregarLista(
    portada,
    font,
    columna1,
    y,
    "ESTADO",
    reporte.status === "terminado" ? "Terminado" : "En proceso",
  );

  let y2 = inicioFilas;
  const tipo = tipoServicioLabel(reporte.serviceType) ?? "Sin definir";
  const etiquetas = ordenarEtiquetas(reporte.etiquetas)
    .map((e) => e.label)
    .join(", ");
  y2 = agregarLista(portada, font, columna2, y2, "TIPO DE SERVICIO", tipo);
  y2 = agregarLista(portada, font, columna2, y2, "ETIQUETAS", etiquetas || "Ninguna");
  y2 = agregarLista(portada, font, columna2, y2, "CREADO POR", reporte.authorName);
  y2 = agregarLista(
    portada,
    font,
    columna2,
    y2,
    "CREADO EL",
    formatInstante(reporte.createdAt),
  );

  y = Math.min(y, y2) - 10;

  portada.drawText("DETALLES DEL TRABAJO", {
    x: MARGEN,
    y,
    size: 9,
    font,
    color: COLOR_MUTED,
  });
  y -= 18;

  const lineasDetalle = reporte.details
    ? envolverTexto(reporte.details, font, 10.5, ancho - MARGEN * 2)
    : ["Sin detalles."];
  for (const linea of lineasDetalle) {
    if (y < MARGEN + 60) break; // suficiente para el caso normal; el detalle no es el foco del documento
    portada.drawText(linea, { x: MARGEN, y, size: 10.5, font, color: COLOR_TEXTO });
    y -= 15;
  }

  // --- Firma ---
  const sinFusionar: string[] = [];
  if (reporte.signatureUrl) {
    const datosFirma = await leerArchivo(reporte.signatureUrl);
    if (datosFirma) {
      const firmaSubtitulo = [
        reporte.signatureName ? `Firmado por ${reporte.signatureName}` : null,
        reporte.signedAt ? formatInstante(reporte.signedAt) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      try {
        await agregarPaginaImagen(
          doc,
          fontBold,
          datosFirma,
          "image/png",
          "Firma",
          firmaSubtitulo || undefined,
        );
      } catch {
        sinFusionar.push("firma");
      }
    }
  }

  // --- Adjuntos ---
  for (const [i, a] of adjuntos.entries()) {
    await agregarArchivo(
      doc,
      fontBold,
      a,
      `Adjunto ${i + 1} de ${adjuntos.length}`,
      a.fileName,
      sinFusionar,
    );
  }

  // --- Página final: lo que no se pudo fusionar ---
  if (sinFusionar.length > 0) {
    const notaPage = doc.addPage(A4);
    let yNota = alto - MARGEN;
    notaPage.drawText("Archivos no incluidos en este PDF", {
      x: MARGEN,
      y: yNota,
      size: 13,
      font: fontBold,
      color: COLOR_TEXTO,
    });
    yNota -= 20;
    notaPage.drawText(
      "Formato no compatible para fusionar (Word, Excel u otro) o no se pudo leer. Descárguelos por separado desde el reporte.",
      { x: MARGEN, y: yNota, size: 10, font, color: COLOR_MUTED, maxWidth: ancho - MARGEN * 2 },
    );
    yNota -= 26;
    for (const nombre of sinFusionar) {
      notaPage.drawText(`• ${nombre}`, {
        x: MARGEN,
        y: yNota,
        size: 10.5,
        font,
        color: COLOR_TEXTO,
      });
      yNota -= 16;
    }
  }

  return doc.save();
}

type GastoViatico = Adjunto & {
  concepto: string | null;
  fechaGasto: Date | null;
  amount: number | null;
};

/**
 * PDF de un reporte de viáticos: la ficha con el total y a qué reporte
 * justifica, seguida de cada gasto con su foto de respaldo fusionada — igual
 * que el PDF de un reporte de servicio, pero sin firma, adjuntos genéricos, ni
 * los campos que no le aplican (orden de compra, tipo de servicio, etiquetas).
 */
export async function generarReporteViaticoPdf(
  reporte: ReporteCompleto,
  gastos: GastoViatico[],
  proyectoEnlazado: string | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const portada = doc.addPage(A4);
  const [ancho, alto] = A4;
  let y = alto - MARGEN;

  portada.drawText("Reporte de viáticos", {
    x: MARGEN,
    y,
    size: 18,
    font: fontBold,
    color: COLOR_TEXTO,
    maxWidth: ancho - MARGEN * 2,
  });
  y -= 28;
  portada.drawText(reporte.companyName, {
    x: MARGEN,
    y,
    size: 11,
    font,
    color: COLOR_MUTED,
  });
  y -= 34;

  const total = gastos.reduce((suma, g) => suma + (g.amount ?? 0), 0);

  const columna1 = MARGEN;
  const columna2 = MARGEN + (ancho - MARGEN * 2) / 2;
  const inicioFilas = y;

  y = agregarLista(
    portada,
    font,
    columna1,
    y,
    "JUSTIFICA A",
    proyectoEnlazado ?? "Reporte eliminado",
  );
  y = agregarLista(
    portada,
    font,
    columna1,
    y,
    "ESTADO",
    reporte.status === "terminado" ? "Terminado" : "En proceso",
  );

  let y2 = inicioFilas;
  y2 = agregarLista(portada, font, columna2, y2, "TOTAL", formatearMonto(total, reporte.currency));
  y2 = agregarLista(portada, font, columna2, y2, "CREADO POR", reporte.authorName);
  y2 = agregarLista(
    portada,
    font,
    columna2,
    y2,
    "CREADO EL",
    formatInstante(reporte.createdAt),
  );

  y = Math.min(y, y2) - 10;

  portada.drawText("GASTOS", { x: MARGEN, y, size: 9, font, color: COLOR_MUTED });
  y -= 18;

  for (const g of gastos) {
    if (y < MARGEN + 40) break;
    const linea = `${g.concepto ?? "Sin concepto"} — ${
      g.amount !== null ? formatearMonto(g.amount, reporte.currency) : "Sin monto"
    }${g.fechaGasto ? ` — ${formatFechaLarga(g.fechaGasto)}` : ""}`;
    portada.drawText(`• ${linea}`, {
      x: MARGEN,
      y,
      size: 10.5,
      font,
      color: COLOR_TEXTO,
      maxWidth: ancho - MARGEN * 2,
    });
    y -= 16;
  }

  const sinFusionar: string[] = [];
  for (const [i, g] of gastos.entries()) {
    await agregarArchivo(
      doc,
      fontBold,
      g,
      `Gasto ${i + 1} de ${gastos.length}`,
      g.concepto ?? undefined,
      sinFusionar,
    );
  }

  if (sinFusionar.length > 0) {
    const notaPage = doc.addPage(A4);
    let yNota = alto - MARGEN;
    notaPage.drawText("Archivos no incluidos en este PDF", {
      x: MARGEN,
      y: yNota,
      size: 13,
      font: fontBold,
      color: COLOR_TEXTO,
    });
    yNota -= 20;
    notaPage.drawText(
      "Formato no compatible para fusionar (Word, Excel u otro) o no se pudo leer. Descárguelos por separado desde el reporte.",
      { x: MARGEN, y: yNota, size: 10, font, color: COLOR_MUTED, maxWidth: ancho - MARGEN * 2 },
    );
    yNota -= 26;
    for (const nombre of sinFusionar) {
      notaPage.drawText(`• ${nombre}`, {
        x: MARGEN,
        y: yNota,
        size: 10.5,
        font,
        color: COLOR_TEXTO,
      });
      yNota -= 16;
    }
  }

  return doc.save();
}
