import "server-only";

import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  StandardFonts,
} from "pdf-lib";
import sharp from "sharp";

import { tipoServicioLabel, ordenarEtiquetas } from "@/lib/etiquetas";
import { formatFechaLarga, formatInstante } from "@/lib/fechas";
import { formatearMonto } from "@/lib/moneda";
import {
  A4,
  COLOR_LINEA,
  COLOR_MUTED,
  COLOR_TEXTO,
  MARGEN,
  dibujarCampo,
  dibujarEncabezado,
  dibujarInsignia,
  dibujarPies,
  dibujarTituloSeccion,
  embeberLogo,
} from "@/lib/pdf-marca";
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
 *
 * La parte visual (logo, colores, encabezado, pie) vive en `pdf-marca.ts`.
 */

type Adjunto = { id: string; blobUrl: string; fileName: string; mimeType: string };

type Fuentes = { normal: PDFFont; bold: PDFFont };

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

/**
 * Página con una imagen a página completa (una foto adjunta o la firma),
 * con su encabezado de marca y el espacio del pie respetado.
 */
async function agregarPaginaImagen(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: { logo: PDFImage | null; tipoDocumento: string; empresa: string },
  paginasPropias: PDFPage[],
  bytes: ArrayBuffer,
  mimeType: string,
  titulo: string,
  subtitulo?: string,
): Promise<void> {
  const { bytes: datos, esJpg } = await comoImagenEmbebible(bytes, mimeType);
  const imagen = esJpg ? await doc.embedJpg(datos) : await doc.embedPng(datos);

  const page = doc.addPage(A4);
  paginasPropias.push(page);
  const [anchoPagina] = A4;

  const yTrasEncabezado = dibujarEncabezado(page, fuentes, {
    logo: contexto.logo,
    tipoDocumento: contexto.tipoDocumento,
    empresa: contexto.empresa,
    nombreEmpresa: contexto.empresa,
  });

  let y = dibujarTituloSeccion(page, fuentes.normal, MARGEN, yTrasEncabezado, titulo);

  if (subtitulo) {
    page.drawText(subtitulo, {
      x: MARGEN,
      y: y + 4,
      size: 9.5,
      font: fuentes.normal,
      color: COLOR_MUTED,
      maxWidth: anchoPagina - MARGEN * 2,
    });
    y -= 12;
  }

  // Entre el título y el pie: ese es todo el espacio que puede ocupar la foto.
  const techo = y + 6;
  const piso = 56;
  const anchoDisponible = anchoPagina - MARGEN * 2;
  const altoDisponible = techo - piso;

  const escala = Math.min(
    anchoDisponible / imagen.width,
    altoDisponible / imagen.height,
    1,
  );
  const w = imagen.width * escala;
  const h = imagen.height * escala;

  page.drawImage(imagen, {
    x: (anchoPagina - w) / 2,
    y: piso + (altoDisponible - h) / 2,
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
  fuentes: Fuentes,
  contexto: { logo: PDFImage | null; tipoDocumento: string; empresa: string },
  paginasPropias: PDFPage[],
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
      await agregarPaginaImagen(
        doc,
        fuentes,
        contexto,
        paginasPropias,
        datos,
        item.mimeType,
        titulo,
        subtitulo,
      );
    } catch {
      sinFusionar.push(item.fileName);
    }
    return;
  }

  sinFusionar.push(item.fileName);
}

/** Página final con lo que no se pudo incluir. Solo se agrega si hace falta. */
function agregarPaginaFaltantes(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: { logo: PDFImage | null; tipoDocumento: string; empresa: string },
  paginasPropias: PDFPage[],
  sinFusionar: string[],
): void {
  if (sinFusionar.length === 0) return;

  const page = doc.addPage(A4);
  paginasPropias.push(page);
  const [ancho] = A4;

  const yTrasEncabezado = dibujarEncabezado(page, fuentes, {
    logo: contexto.logo,
    tipoDocumento: contexto.tipoDocumento,
    empresa: contexto.empresa,
    nombreEmpresa: contexto.empresa,
  });

  let y = dibujarTituloSeccion(
    page,
    fuentes.normal,
    MARGEN,
    yTrasEncabezado,
    "Archivos no incluidos",
  );

  page.drawText(
    "Formato no compatible para fusionar (Word, Excel u otro) o no se pudo leer. Descárguelos por separado desde el reporte.",
    {
      x: MARGEN,
      y,
      size: 9.5,
      font: fuentes.normal,
      color: COLOR_MUTED,
      maxWidth: ancho - MARGEN * 2,
      lineHeight: 13,
    },
  );
  y -= 34;

  for (const nombre of sinFusionar) {
    if (y < 60) break;
    page.drawText(`• ${nombre}`, {
      x: MARGEN,
      y,
      size: 10,
      font: fuentes.normal,
      color: COLOR_TEXTO,
      maxWidth: ancho - MARGEN * 2,
    });
    y -= 16;
  }
}

export async function generarReportePdf(
  reporte: ReporteCompleto,
  adjuntos: Adjunto[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuentes: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await embeberLogo(doc);
  const contexto = {
    logo,
    tipoDocumento: "Reporte de servicio",
    empresa: reporte.companyName,
  };
  const paginasPropias: PDFPage[] = [];

  // --- Página 1: ficha del reporte ---
  const portada = doc.addPage(A4);
  paginasPropias.push(portada);
  const [ancho] = A4;

  let y = dibujarEncabezado(portada, fuentes, {
    ...contexto,
    nombreEmpresa: reporte.companyName,
  });

  portada.drawText(reporte.projectName, {
    x: MARGEN,
    y,
    size: 19,
    font: fuentes.bold,
    color: COLOR_TEXTO,
    maxWidth: ancho - MARGEN * 2 - 110,
  });

  const terminado = reporte.status === "terminado";
  dibujarInsignia(
    portada,
    fuentes.bold,
    ancho - MARGEN - (terminado ? 78 : 84),
    y + 3,
    terminado ? "Terminado" : "En proceso",
    terminado,
  );
  y -= 34;

  const anchoColumna = (ancho - MARGEN * 2 - 24) / 2;
  const columna1 = MARGEN;
  const columna2 = MARGEN + anchoColumna + 24;
  const inicioFilas = y;

  y = dibujarCampo(portada, fuentes, columna1, y, anchoColumna, "Cliente", reporte.clientName);
  y = dibujarCampo(
    portada,
    fuentes,
    columna1,
    y,
    anchoColumna,
    "Cotización",
    reporte.quoteNumber ?? "Sin asignar",
  );
  y = dibujarCampo(
    portada,
    fuentes,
    columna1,
    y,
    anchoColumna,
    "Orden de compra",
    reporte.purchaseOrderNo ?? "Sin asignar",
  );
  y = dibujarCampo(
    portada,
    fuentes,
    columna1,
    y,
    anchoColumna,
    "Fecha del trabajo",
    formatFechaLarga(reporte.workDate),
  );

  let y2 = inicioFilas;
  const etiquetas = ordenarEtiquetas(reporte.etiquetas)
    .map((e) => e.label)
    .join(", ");
  y2 = dibujarCampo(
    portada,
    fuentes,
    columna2,
    y2,
    anchoColumna,
    "Tipo de servicio",
    tipoServicioLabel(reporte.serviceType) ?? "Sin definir",
  );
  y2 = dibujarCampo(
    portada,
    fuentes,
    columna2,
    y2,
    anchoColumna,
    "Etiquetas",
    etiquetas || "Ninguna",
  );
  y2 = dibujarCampo(
    portada,
    fuentes,
    columna2,
    y2,
    anchoColumna,
    "Creado por",
    reporte.authorName,
  );
  y2 = dibujarCampo(
    portada,
    fuentes,
    columna2,
    y2,
    anchoColumna,
    "Creado el",
    formatInstante(reporte.createdAt),
  );

  y = Math.min(y, y2) - 6;
  y = dibujarTituloSeccion(portada, fuentes.normal, MARGEN, y, "Detalles del trabajo");

  const lineasDetalle = reporte.details
    ? envolverTexto(reporte.details, fuentes.normal, 10.5, ancho - MARGEN * 2)
    : ["Sin detalles."];
  for (const linea of lineasDetalle) {
    if (y < 60) break; // el detalle no es el foco del documento; lo que no cabe, no corta la página
    portada.drawText(linea, {
      x: MARGEN,
      y,
      size: 10.5,
      font: fuentes.normal,
      color: COLOR_TEXTO,
    });
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
          fuentes,
          contexto,
          paginasPropias,
          datosFirma,
          "image/png",
          "Firma de conformidad",
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
      fuentes,
      contexto,
      paginasPropias,
      a,
      `Adjunto ${i + 1} de ${adjuntos.length}`,
      a.fileName,
      sinFusionar,
    );
  }

  agregarPaginaFaltantes(doc, fuentes, contexto, paginasPropias, sinFusionar);

  dibujarPies(
    doc,
    fuentes.normal,
    paginasPropias,
    `${reporte.companyName} · ${reporte.projectName} · Generado el ${formatInstante(new Date())}`,
  );

  return doc.save();
}

type GastoViatico = Adjunto & {
  concepto: string | null;
  fechaGasto: Date | null;
  amount: number | null;
};

/**
 * PDF de un reporte de viáticos: la ficha con el total y a qué proyecto
 * pertenece, seguida de cada gasto con su foto de respaldo fusionada — igual
 * que el PDF de un reporte de servicio, pero sin firma, adjuntos genéricos, ni
 * los campos que no le aplican (orden de compra, tipo de servicio, etiquetas).
 *
 * Este PDF es exclusivamente interno: nunca se envía al cliente, ni por
 * correo ni por el enlace público de firma — solo el de servicio se comparte
 * fuera del sistema.
 */
export async function generarReporteViaticoPdf(
  reporte: ReporteCompleto,
  gastos: GastoViatico[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuentes: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await embeberLogo(doc);
  const contexto = {
    logo,
    tipoDocumento: "Reporte de viáticos",
    empresa: reporte.companyName,
  };
  const paginasPropias: PDFPage[] = [];

  const portada = doc.addPage(A4);
  paginasPropias.push(portada);
  const [ancho] = A4;

  let y = dibujarEncabezado(portada, fuentes, {
    ...contexto,
    nombreEmpresa: reporte.companyName,
  });

  portada.drawText("Reporte de viáticos", {
    x: MARGEN,
    y,
    size: 19,
    font: fuentes.bold,
    color: COLOR_TEXTO,
    maxWidth: ancho - MARGEN * 2 - 110,
  });

  const terminado = reporte.status === "terminado";
  dibujarInsignia(
    portada,
    fuentes.bold,
    ancho - MARGEN - (terminado ? 78 : 84),
    y + 3,
    terminado ? "Terminado" : "En proceso",
    terminado,
  );
  y -= 34;

  const total = gastos.reduce((suma, g) => suma + (g.amount ?? 0), 0);
  const anchoColumna = (ancho - MARGEN * 2 - 24) / 2;
  const columna1 = MARGEN;
  const columna2 = MARGEN + anchoColumna + 24;
  const inicioFilas = y;

  y = dibujarCampo(
    portada,
    fuentes,
    columna1,
    y,
    anchoColumna,
    "Justifica a",
    reporte.projectName,
  );
  y = dibujarCampo(
    portada,
    fuentes,
    columna1,
    y,
    anchoColumna,
    "Creado por",
    reporte.authorName,
  );

  let y2 = inicioFilas;
  y2 = dibujarCampo(
    portada,
    fuentes,
    columna2,
    y2,
    anchoColumna,
    "Total",
    formatearMonto(total, reporte.currency),
  );
  y2 = dibujarCampo(
    portada,
    fuentes,
    columna2,
    y2,
    anchoColumna,
    "Creado el",
    formatInstante(reporte.createdAt),
  );

  y = Math.min(y, y2) - 6;
  y = dibujarTituloSeccion(portada, fuentes.normal, MARGEN, y, `Gastos (${gastos.length})`);

  for (const g of gastos) {
    if (y < 60) break;
    const monto =
      g.amount !== null ? formatearMonto(g.amount, reporte.currency) : "Sin monto";
    const fecha = g.fechaGasto ? formatFechaLarga(g.fechaGasto) : null;

    portada.drawText(g.concepto ?? "Sin concepto", {
      x: MARGEN,
      y,
      size: 10.5,
      font: fuentes.normal,
      color: COLOR_TEXTO,
      maxWidth: ancho - MARGEN * 2 - 130,
    });

    const anchoMonto = fuentes.bold.widthOfTextAtSize(monto, 10.5);
    portada.drawText(monto, {
      x: ancho - MARGEN - anchoMonto,
      y,
      size: 10.5,
      font: fuentes.bold,
      color: COLOR_TEXTO,
    });

    if (fecha) {
      portada.drawText(fecha, {
        x: MARGEN,
        y: y - 12,
        size: 8.5,
        font: fuentes.normal,
        color: COLOR_MUTED,
      });
    }

    y -= fecha ? 26 : 18;
    portada.drawLine({
      start: { x: MARGEN, y: y + 8 },
      end: { x: ancho - MARGEN, y: y + 8 },
      thickness: 0.5,
      color: COLOR_LINEA,
    });
  }

  const sinFusionar: string[] = [];
  for (const [i, g] of gastos.entries()) {
    await agregarArchivo(
      doc,
      fuentes,
      contexto,
      paginasPropias,
      g,
      `Gasto ${i + 1} de ${gastos.length}`,
      g.concepto ?? undefined,
      sinFusionar,
    );
  }

  agregarPaginaFaltantes(doc, fuentes, contexto, paginasPropias, sinFusionar);

  dibujarPies(
    doc,
    fuentes.normal,
    paginasPropias,
    `${reporte.companyName} · Viáticos · ${reporte.projectName} · Generado el ${formatInstante(new Date())}`,
  );

  return doc.save();
}
