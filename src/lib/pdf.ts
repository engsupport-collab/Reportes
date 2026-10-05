import "server-only";

import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  StandardFonts,
} from "pdf-lib";

import { tipoServicioLabel, ordenarEtiquetas } from "@/lib/etiquetas";
import { formatFechaLarga, formatInstante } from "@/lib/fechas";
import { formatearMonto } from "@/lib/moneda";
import {
  type Adjunto,
  type AdjuntoLeido,
  type AdjuntoPreparado,
  PESO_MAXIMO_PDF,
  leerAdjuntos,
  prepararAdjuntos,
} from "@/lib/pdf-adjuntos";
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
import { anchoDeTexto, dibujarTexto, envolverTexto } from "@/lib/pdf-texto";
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
 * Cómo entra cada archivo —enderezado, reducido y sin pasarse del peso que el
 * documento puede tener— lo decide `pdf-adjuntos.ts`. La parte visual (logo,
 * colores, encabezado, pie) vive en `pdf-marca.ts`.
 *
 * Ningún texto se dibuja ni se mide llamando a la librería directamente: pasa
 * por `pdf-texto.ts`, que lo deja en lo que la fuente sabe dibujar. Un solo
 * carácter fuera de ese repertorio no deja un hueco, tumba el documento.
 */

type Fuentes = { normal: PDFFont; bold: PDFFont };

type Contexto = { logo: PDFImage | null; tipoDocumento: string; empresa: string };

/** Por debajo de esta altura empieza el pie de página: ahí no se escribe. */
const PISO_TEXTO = 60;

const TAMANO_TITULO = 19;
const INTERLINEADO_TITULO = 24;

/**
 * Lo que pesa el documento antes de sumarle ningún archivo: el logo, las
 * páginas de texto y lo que la librería añade alrededor de cada imagen.
 */
const PESO_BASE = 200 * 1024;

/**
 * Tope real. El presupuesto se calcula sobre los archivos, y un PDF adjunto
 * puede pesar algo distinto una vez copiado: si el documento ya armado supera
 * esto, se vuelve a armar con menos presupuesto antes que entregar algo que
 * Vercel va a rechazar.
 */
const PESO_QUE_NO_SE_ENTREGA = 4.4 * 1024 * 1024;

/**
 * Arma el documento repartiendo el peso entre los adjuntos, y comprueba el
 * resultado en vez de fiarse del cálculo.
 */
async function armarSinPasarse<T extends Adjunto>(
  leidos: AdjuntoLeido<T>[],
  pesoFijo: number,
  armar: (preparados: AdjuntoPreparado<T>[]) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  let presupuesto = PESO_MAXIMO_PDF - PESO_BASE - pesoFijo;

  for (let intento = 1; ; intento++) {
    const pdf = await armar(await prepararAdjuntos(leidos, presupuesto));
    if (pdf.length <= PESO_QUE_NO_SE_ENTREGA || intento === 3) return pdf;
    presupuesto = Math.floor(presupuesto * 0.7);
  }
}

/** Hoja nueva con el encabezado y el título de la sección que continúa. */
function abrirContinuacion(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: Contexto,
  paginasPropias: PDFPage[],
  titulo: string,
): { pagina: PDFPage; y: number } {
  const pagina = doc.addPage(A4);
  paginasPropias.push(pagina);
  const y = dibujarEncabezado(pagina, fuentes, contexto);
  return {
    pagina,
    y: dibujarTituloSeccion(pagina, fuentes.normal, MARGEN, y, `${titulo} (continuación)`),
  };
}

/**
 * Página con una imagen a página completa (una foto adjunta o la firma),
 * con su encabezado de marca y el espacio del pie respetado.
 */
function agregarPaginaImagen(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: Contexto,
  paginasPropias: PDFPage[],
  imagen: PDFImage,
  titulo: string,
  subtitulo?: string,
): void {
  const page = doc.addPage(A4);
  paginasPropias.push(page);
  const [anchoPagina] = A4;

  const yTrasEncabezado = dibujarEncabezado(page, fuentes, contexto);

  let y = dibujarTituloSeccion(page, fuentes.normal, MARGEN, yTrasEncabezado, titulo);

  if (subtitulo) {
    dibujarTexto(page, subtitulo, {
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

async function fusionarPdf(doc: PDFDocument, bytes: Uint8Array): Promise<boolean> {
  try {
    const origen = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const paginas = await doc.copyPages(origen, origen.getPageIndices());
    for (const pagina of paginas) doc.addPage(pagina);
    return true;
  } catch {
    return false;
  }
}

/** Agrega la foto o el PDF de un ítem (viático o adjunto); si no entra, lo deja listado. */
async function agregarArchivo(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: Contexto,
  paginasPropias: PDFPage[],
  preparado: AdjuntoPreparado<Adjunto>,
  titulo: string,
  subtitulo: string | undefined,
  sinFusionar: string[],
): Promise<void> {
  if (preparado.clase === "foto") {
    try {
      const imagen = await doc.embedJpg(preparado.jpeg);
      agregarPaginaImagen(doc, fuentes, contexto, paginasPropias, imagen, titulo, subtitulo);
    } catch {
      sinFusionar.push(preparado.item.fileName);
    }
    return;
  }

  if (preparado.clase === "pdf" && (await fusionarPdf(doc, preparado.bytes))) return;

  sinFusionar.push(preparado.item.fileName);
}

/** Página final con lo que no se pudo incluir. Solo se agrega si hace falta. */
function agregarPaginaFaltantes(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: Contexto,
  paginasPropias: PDFPage[],
  sinFusionar: string[],
): void {
  if (sinFusionar.length === 0) return;

  let page = doc.addPage(A4);
  paginasPropias.push(page);
  const [ancho] = A4;

  const yTrasEncabezado = dibujarEncabezado(page, fuentes, contexto);

  let y = dibujarTituloSeccion(
    page,
    fuentes.normal,
    MARGEN,
    yTrasEncabezado,
    "Archivos no incluidos",
  );

  dibujarTexto(
    page,
    "No entraron en este documento: por su formato (Word, Excel u otro), porque no se pudieron leer o porque no cabían. Descárguelos por separado desde el reporte.",
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
    if (y < PISO_TEXTO) {
      ({ pagina: page, y } = abrirContinuacion(
        doc,
        fuentes,
        contexto,
        paginasPropias,
        "Archivos no incluidos",
      ));
    }
    dibujarTexto(page, `• ${nombre}`, {
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
  // Los archivos se leen una sola vez, aunque el documento haya que armarlo
  // más de una para que quepa.
  const [leidos, datosFirma] = await Promise.all([
    leerAdjuntos(adjuntos),
    reporte.signatureUrl ? leerArchivo(reporte.signatureUrl) : null,
  ]);

  return armarSinPasarse(leidos, datosFirma?.byteLength ?? 0, (preparados) =>
    armarReporte(reporte, preparados, datosFirma),
  );
}

async function armarReporte(
  reporte: ReporteCompleto,
  adjuntos: AdjuntoPreparado<Adjunto>[],
  datosFirma: ArrayBuffer | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuentes: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await embeberLogo(doc);
  const contexto: Contexto = {
    logo,
    tipoDocumento: "Reporte de servicio",
    empresa: reporte.companyName,
  };
  const paginasPropias: PDFPage[] = [];

  // --- Página 1: ficha del reporte ---
  const portada = doc.addPage(A4);
  paginasPropias.push(portada);
  const [ancho] = A4;

  let y = dibujarEncabezado(portada, fuentes, contexto);

  // El nombre del proyecto se parte aquí, y no con `maxWidth`, para saber
  // cuántos renglones ocupó: la ficha empieza debajo del último. Bajando
  // siempre lo de un renglón, un nombre largo quedaba escrito encima del
  // cliente.
  const lineasTitulo = envolverTexto(
    reporte.projectName,
    fuentes.bold,
    TAMANO_TITULO,
    ancho - MARGEN * 2 - 110,
  );
  for (const [i, linea] of lineasTitulo.entries()) {
    dibujarTexto(portada, linea, {
      x: MARGEN,
      y: y - i * INTERLINEADO_TITULO,
      size: TAMANO_TITULO,
      font: fuentes.bold,
      color: COLOR_TEXTO,
    });
  }

  const terminado = reporte.status === "terminado";
  dibujarInsignia(
    portada,
    fuentes.bold,
    ancho - MARGEN - (terminado ? 78 : 84),
    y + 3,
    terminado ? "Terminado" : "En proceso",
    terminado,
  );
  y -= 34 + (lineasTitulo.length - 1) * INTERLINEADO_TITULO;

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
  // Lo que no cabe en la hoja sigue en la siguiente. Cortarlo ahí dejaba al
  // cliente con un reporte incompleto sin que nadie se enterara.
  let pagina = portada;
  for (const linea of lineasDetalle) {
    if (y < PISO_TEXTO) {
      // Un renglón en blanco no abre hoja: quedaría una continuación vacía.
      if (!linea) continue;
      ({ pagina, y } = abrirContinuacion(
        doc,
        fuentes,
        contexto,
        paginasPropias,
        "Detalles del trabajo",
      ));
    }
    dibujarTexto(pagina, linea, {
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
  if (datosFirma) {
    const firmaSubtitulo = [
      reporte.signatureName ? `Firmado por ${reporte.signatureName}` : null,
      reporte.signedAt ? formatInstante(reporte.signedAt) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    try {
      // La firma la dibuja la propia aplicación y siempre es un PNG pequeño:
      // entra tal cual, sin pasar por la reducción de las fotos.
      const imagen = await doc.embedPng(datosFirma);
      agregarPaginaImagen(
        doc,
        fuentes,
        contexto,
        paginasPropias,
        imagen,
        "Firma de conformidad",
        firmaSubtitulo || undefined,
      );
    } catch {
      sinFusionar.push("firma");
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
      a.item.fileName,
      sinFusionar,
    );
  }

  agregarPaginaFaltantes(doc, fuentes, contexto, paginasPropias, sinFusionar);

  dibujarPies(doc, fuentes, paginasPropias, formatInstante(new Date()));

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
  const leidos = await leerAdjuntos(gastos);

  return armarSinPasarse(leidos, 0, (preparados) => armarViatico(reporte, preparados));
}

async function armarViatico(
  reporte: ReporteCompleto,
  gastos: AdjuntoPreparado<GastoViatico>[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuentes: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await embeberLogo(doc);
  const contexto: Contexto = {
    logo,
    tipoDocumento: "Reporte de viáticos",
    empresa: reporte.companyName,
  };
  const paginasPropias: PDFPage[] = [];

  const portada = doc.addPage(A4);
  paginasPropias.push(portada);
  const [ancho] = A4;

  let y = dibujarEncabezado(portada, fuentes, contexto);

  dibujarTexto(portada, "Reporte de viáticos", {
    x: MARGEN,
    y,
    size: TAMANO_TITULO,
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

  const total = gastos.reduce((suma, g) => suma + (g.item.amount ?? 0), 0);
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
  const tituloGastos = `Gastos (${gastos.length})`;
  y = dibujarTituloSeccion(portada, fuentes.normal, MARGEN, y, tituloGastos);

  // Igual que el detalle de un servicio: la lista sigue en otra hoja en vez de
  // cortarse. El total de arriba suma todos los gastos; una lista recortada
  // mostraría menos de los que suma.
  let pagina = portada;
  for (const { item: g } of gastos) {
    if (y < PISO_TEXTO) {
      ({ pagina, y } = abrirContinuacion(doc, fuentes, contexto, paginasPropias, tituloGastos));
    }
    const monto =
      g.amount !== null ? formatearMonto(g.amount, reporte.currency) : "Sin monto";
    const fecha = g.fechaGasto ? formatFechaLarga(g.fechaGasto) : null;

    dibujarTexto(pagina, g.concepto ?? "Sin concepto", {
      x: MARGEN,
      y,
      size: 10.5,
      font: fuentes.normal,
      color: COLOR_TEXTO,
      maxWidth: ancho - MARGEN * 2 - 130,
    });

    const anchoMonto = anchoDeTexto(fuentes.bold, monto, 10.5);
    dibujarTexto(pagina, monto, {
      x: ancho - MARGEN - anchoMonto,
      y,
      size: 10.5,
      font: fuentes.bold,
      color: COLOR_TEXTO,
    });

    if (fecha) {
      dibujarTexto(pagina, fecha, {
        x: MARGEN,
        y: y - 12,
        size: 8.5,
        font: fuentes.normal,
        color: COLOR_MUTED,
      });
    }

    y -= fecha ? 26 : 18;
    pagina.drawLine({
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
      g.item.concepto ?? undefined,
      sinFusionar,
    );
  }

  agregarPaginaFaltantes(doc, fuentes, contexto, paginasPropias, sinFusionar);

  dibujarPies(doc, fuentes, paginasPropias, formatInstante(new Date()));

  return doc.save();
}
