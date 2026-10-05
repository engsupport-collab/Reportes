import "server-only";

import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  StandardFonts,
} from "pdf-lib";

import { esTipoServicioValido, ordenarEtiquetas } from "@/lib/etiquetas";
import { formatFechaLarga, formatInstante } from "@/lib/fechas";
import { formatearMonto } from "@/lib/moneda";
import {
  type Adjunto,
  type AdjuntoLeido,
  type AdjuntoPreparado,
  PESO_MAXIMO_PDF,
  leerAdjuntos,
  prepararAdjuntos,
  recortarFirma,
} from "@/lib/pdf-adjuntos";
import { type TextosPdf, textosDeEmpresa } from "@/lib/pdf-idioma";
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
 * PDF del reporte: la ficha, el detalle, los adjuntos y, cerrando, las firmas
 * — todo en un solo documento para que quede como constancia completa del
 * trabajo.
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
 * colores, encabezado, pie) vive en `pdf-marca.ts`, y en qué idioma sale cada
 * texto fijo, en `pdf-idioma.ts`: lo decide la empresa del reporte.
 *
 * Ningún texto se dibuja ni se mide llamando a la librería directamente: pasa
 * por `pdf-texto.ts`, que lo deja en lo que la fuente sabe dibujar. Un solo
 * carácter fuera de ese repertorio no deja un hueco, tumba el documento.
 */

type Fuentes = { normal: PDFFont; bold: PDFFont };

type Contexto = {
  logo: PDFImage | null;
  tipoDocumento: string;
  empresa: string;
  /** Los textos fijos, en el idioma de este documento. */
  textos: TextosPdf;
};

/**
 * Hasta dónde llegó lo dibujado en una hoja propia: de `y` hacia abajo está
 * libre. Sirve para seguir escribiendo en ella en vez de abrir otra.
 */
type Cursor = { pagina: PDFPage; y: number };

/** Por debajo de esta altura empieza el pie de página: ahí no se escribe. */
const PISO_TEXTO = 60;
/** Hasta dónde puede bajar una foto en su hoja. */
const PISO_IMAGEN = 56;

const TAMANO_TITULO = 19;
const INTERLINEADO_TITULO = 24;

/** La ficha y las firmas van en dos columnas iguales. */
const SEPARACION_COLUMNAS = 24;
const ANCHO_COLUMNA = (A4[0] - MARGEN * 2 - SEPARACION_COLUMNAS) / 2;
const COLUMNA_1 = MARGEN;
const COLUMNA_2 = MARGEN + ANCHO_COLUMNA + SEPARACION_COLUMNAS;

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
): Cursor {
  const pagina = doc.addPage(A4);
  paginasPropias.push(pagina);
  const y = dibujarEncabezado(pagina, fuentes, contexto);
  return {
    pagina,
    y: dibujarTituloSeccion(
      pagina,
      fuentes.normal,
      MARGEN,
      y,
      contexto.textos.continuacion(titulo),
    ),
  };
}

/**
 * Página con una foto adjunta a página completa, con su encabezado de marca y
 * el espacio del pie respetado.
 *
 * `reserva` deja libre esa altura debajo de la foto, para lo que venga después
 * en la misma hoja. Devuelve desde dónde está libre.
 */
function agregarPaginaImagen(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: Contexto,
  paginasPropias: PDFPage[],
  imagen: PDFImage,
  titulo: string,
  subtitulo: string | undefined,
  reserva: number,
): Cursor {
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

  // Entre el título y el pie —o lo reservado—: ese es todo el espacio que
  // puede ocupar la foto.
  const techo = y + 6;
  const piso = PISO_IMAGEN + reserva;
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

  return { pagina: page, y: piso };
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

/**
 * Agrega la foto o el PDF de un ítem (viático o adjunto); si no entra, lo deja
 * listado. Devuelve dónde quedó libre la hoja de la foto, o null si no abrió
 * una hoja propia (un PDF fusionado trae las suyas, y ahí no se escribe).
 */
async function agregarArchivo(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: Contexto,
  paginasPropias: PDFPage[],
  preparado: AdjuntoPreparado<Adjunto>,
  titulo: string,
  subtitulo: string | undefined,
  sinFusionar: string[],
  reserva = 0,
): Promise<Cursor | null> {
  if (preparado.clase === "foto") {
    try {
      const imagen = await doc.embedJpg(preparado.jpeg);
      return agregarPaginaImagen(
        doc,
        fuentes,
        contexto,
        paginasPropias,
        imagen,
        titulo,
        subtitulo,
        reserva,
      );
    } catch {
      sinFusionar.push(preparado.item.fileName);
      return null;
    }
  }

  if (preparado.clase === "pdf" && (await fusionarPdf(doc, preparado.bytes))) return null;

  sinFusionar.push(preparado.item.fileName);
  return null;
}

/**
 * Página con lo que no se pudo incluir. Solo se agrega si hace falta; devuelve
 * dónde terminó la lista, o null si no hubo nada que listar.
 */
function agregarPaginaFaltantes(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: Contexto,
  paginasPropias: PDFPage[],
  sinFusionar: string[],
): Cursor | null {
  if (sinFusionar.length === 0) return null;

  const { textos } = contexto;
  let page = doc.addPage(A4);
  paginasPropias.push(page);
  const [ancho] = A4;

  const yTrasEncabezado = dibujarEncabezado(page, fuentes, contexto);

  let y = dibujarTituloSeccion(
    page,
    fuentes.normal,
    MARGEN,
    yTrasEncabezado,
    textos.noIncluidos,
  );

  dibujarTexto(page, textos.noIncluidosNota, {
    x: MARGEN,
    y,
    size: 9.5,
    font: fuentes.normal,
    color: COLOR_MUTED,
    maxWidth: ancho - MARGEN * 2,
    lineHeight: 13,
  });
  y -= 34;

  for (const nombre of sinFusionar) {
    if (y < PISO_TEXTO) {
      ({ pagina: page, y } = abrirContinuacion(
        doc,
        fuentes,
        contexto,
        paginasPropias,
        textos.noIncluidos,
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

  return { pagina: page, y };
}

// --- Firmas -------------------------------------------------------------------
//
// El reporte cierra con dos firmas, una al lado de la otra: la de quien lo
// hizo —su nombre basta— y la del cliente, que es la que firma de verdad.
//
// Van al final del documento y ocupan lo justo: debajo de lo último que se
// dibujó si caben, y en hoja propia solo cuando no (lo último es un PDF
// adjunto, o la hoja ya está llena). Antes la firma del cliente llenaba una
// hoja entera, y entre el detalle y las fotos.

type Firmas = {
  reporta: string;
  /** Null mientras el cliente no haya firmado. */
  cliente: { nombre: string; fecha: string | null; imagen: PDFImage | null } | null;
};

type MedidaFirmas = {
  lineasReporta: string[];
  lineasCliente: string[];
  /** Alto del espacio sobre la raya, donde va la firma. */
  zona: number;
  /** Todo lo que el bloque ocupa, contando lo que lo separa de lo anterior. */
  alto: number;
};

/** Aire entre lo último dibujado y el título del bloque. */
const SEPARACION_FIRMAS = 24;
/** Del título a donde empieza el espacio para firmar. */
const BAJO_EL_TITULO = 18;
/**
 * Lo más grande que se dibuja la firma del cliente. El ancho también se
 * acota: una firma escrita con el teclado es muy alargada y, sin tope,
 * llenaría la columna entera y quedaría desproporcionada junto al resto.
 */
const ALTO_FIRMA = 46;
const ANCHO_FIRMA = 170;
const TAMANO_QUIEN_REPORTA = 11;
const INTERLINEADO_QUIEN_REPORTA = 13;
const TAMANO_FIRMANTE = 10;
const INTERLINEADO_FIRMANTE = 12;
/** De la raya al rótulo, y del rótulo al nombre de quien firmó. */
const RAYA_A_ROTULO = 12;
const ROTULO_A_NOMBRE = 14;
const NOMBRE_A_FECHA = 11;

/**
 * Cuánto ocupa el bloque de firmas. Se mide antes de dibujarlo porque de eso
 * depende dónde va: hay que saberlo para dejarle sitio debajo de la última
 * foto.
 */
function medirFirmas(fuentes: Fuentes, firmas: Firmas): MedidaFirmas {
  const lineasReporta = envolverTexto(
    firmas.reporta,
    fuentes.bold,
    TAMANO_QUIEN_REPORTA,
    ANCHO_COLUMNA,
  );
  const lineasCliente = firmas.cliente
    ? envolverTexto(firmas.cliente.nombre, fuentes.bold, TAMANO_FIRMANTE, ANCHO_COLUMNA)
    : [];

  const zona = Math.max(ALTO_FIRMA, lineasReporta.length * INTERLINEADO_QUIEN_REPORTA);
  const bajoLaRaya = firmas.cliente
    ? RAYA_A_ROTULO +
      ROTULO_A_NOMBRE +
      (lineasCliente.length - 1) * INTERLINEADO_FIRMANTE +
      (firmas.cliente.fecha ? NOMBRE_A_FECHA : 0)
    : RAYA_A_ROTULO;

  return {
    lineasReporta,
    lineasCliente,
    zona,
    alto: SEPARACION_FIRMAS + BAJO_EL_TITULO + zona + bajoLaRaya,
  };
}

function agregarFirmas(
  doc: PDFDocument,
  fuentes: Fuentes,
  contexto: Contexto,
  paginasPropias: PDFPage[],
  cursor: Cursor | null,
  firmas: Firmas,
  medida: MedidaFirmas,
): void {
  const { textos } = contexto;

  let pagina: PDFPage;
  let yTitulo: number;
  if (cursor && cursor.y - medida.alto >= PISO_TEXTO) {
    pagina = cursor.pagina;
    yTitulo = cursor.y - SEPARACION_FIRMAS;
  } else {
    pagina = doc.addPage(A4);
    paginasPropias.push(pagina);
    yTitulo = dibujarEncabezado(pagina, fuentes, contexto);
  }

  dibujarTituloSeccion(pagina, fuentes.normal, MARGEN, yTitulo, textos.firmas);
  const yRaya = yTitulo - BAJO_EL_TITULO - medida.zona;

  for (const [x, rotulo] of [
    [COLUMNA_1, textos.quienReporta],
    [COLUMNA_2, textos.firmaCliente],
  ] as const) {
    pagina.drawLine({
      start: { x, y: yRaya },
      end: { x: x + ANCHO_COLUMNA, y: yRaya },
      thickness: 0.75,
      color: COLOR_MUTED,
    });
    dibujarTexto(pagina, rotulo.toUpperCase(), {
      x,
      y: yRaya - RAYA_A_ROTULO,
      size: 7.5,
      font: fuentes.normal,
      color: COLOR_MUTED,
    });
  }

  // Quien reporta firma con su nombre: va sobre la raya, donde iría el trazo.
  // Si no cabe en un renglón, crece hacia arriba para no pisarla.
  for (const [i, linea] of medida.lineasReporta.entries()) {
    const renglonesDebajo = medida.lineasReporta.length - 1 - i;
    dibujarTexto(pagina, linea, {
      x: COLUMNA_1,
      y: yRaya + 7 + renglonesDebajo * INTERLINEADO_QUIEN_REPORTA,
      size: TAMANO_QUIEN_REPORTA,
      font: fuentes.bold,
      color: COLOR_TEXTO,
    });
  }

  if (!firmas.cliente) {
    dibujarTexto(pagina, textos.pendienteDeFirma, {
      x: COLUMNA_2,
      y: yRaya + 7,
      size: 9,
      font: fuentes.normal,
      color: COLOR_MUTED,
    });
    return;
  }

  const { imagen, fecha } = firmas.cliente;
  if (imagen) {
    const escala = Math.min(ANCHO_FIRMA / imagen.width, ALTO_FIRMA / imagen.height);
    pagina.drawImage(imagen, {
      x: COLUMNA_2,
      y: yRaya + 4,
      width: imagen.width * escala,
      height: imagen.height * escala,
    });
  }

  let y = yRaya - RAYA_A_ROTULO - ROTULO_A_NOMBRE;
  for (const linea of medida.lineasCliente) {
    dibujarTexto(pagina, linea, {
      x: COLUMNA_2,
      y,
      size: TAMANO_FIRMANTE,
      font: fuentes.bold,
      color: COLOR_TEXTO,
    });
    y -= INTERLINEADO_FIRMANTE;
  }
  if (fecha) {
    dibujarTexto(pagina, textos.firmadoEl(fecha), {
      x: COLUMNA_2,
      y: y + INTERLINEADO_FIRMANTE - NOMBRE_A_FECHA,
      size: 8,
      font: fuentes.normal,
      color: COLOR_MUTED,
    });
  }
}

export async function generarReportePdf(
  reporte: ReporteCompleto,
  adjuntos: Adjunto[],
): Promise<Uint8Array> {
  // Los archivos se leen una sola vez, aunque el documento haya que armarlo
  // más de una para que quepa.
  const [leidos, firmaGuardada] = await Promise.all([
    leerAdjuntos(adjuntos),
    reporte.signatureUrl ? leerArchivo(reporte.signatureUrl) : null,
  ]);
  const datosFirma = firmaGuardada ? await recortarFirma(firmaGuardada) : null;

  return armarSinPasarse(leidos, datosFirma?.byteLength ?? 0, (preparados) =>
    armarReporte(reporte, preparados, datosFirma),
  );
}

async function armarReporte(
  reporte: ReporteCompleto,
  adjuntos: AdjuntoPreparado<Adjunto>[],
  datosFirma: Uint8Array | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuentes: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await embeberLogo(doc);
  const textos = textosDeEmpresa(reporte.companyId);
  const contexto: Contexto = {
    logo,
    tipoDocumento: textos.reporteServicio,
    empresa: reporte.companyName,
    textos,
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
    terminado ? textos.terminado : textos.enProceso,
    terminado,
  );
  y -= 34 + (lineasTitulo.length - 1) * INTERLINEADO_TITULO;

  const inicioFilas = y;

  y = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_1,
    y,
    ANCHO_COLUMNA,
    textos.cliente,
    reporte.clientName,
  );
  y = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_1,
    y,
    ANCHO_COLUMNA,
    textos.cotizacion,
    reporte.quoteNumber ?? textos.sinAsignar,
  );
  y = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_1,
    y,
    ANCHO_COLUMNA,
    textos.ordenCompra,
    reporte.purchaseOrderNo ?? textos.sinAsignar,
  );
  y = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_1,
    y,
    ANCHO_COLUMNA,
    textos.fechaTrabajo,
    formatFechaLarga(reporte.workDate, textos.locale),
  );

  let y2 = inicioFilas;
  const etiquetas = ordenarEtiquetas(reporte.etiquetas)
    .map((e) => textos.clasificacion[e.id])
    .join(", ");
  y2 = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_2,
    y2,
    ANCHO_COLUMNA,
    textos.tipoServicio,
    reporte.serviceType && esTipoServicioValido(reporte.serviceType)
      ? textos.clasificacion[reporte.serviceType]
      : textos.sinDefinir,
  );
  y2 = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_2,
    y2,
    ANCHO_COLUMNA,
    textos.etiquetas,
    etiquetas || textos.ninguna,
  );
  y2 = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_2,
    y2,
    ANCHO_COLUMNA,
    textos.creadoPor,
    reporte.authorName,
  );
  y2 = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_2,
    y2,
    ANCHO_COLUMNA,
    textos.creadoEl,
    formatInstante(reporte.createdAt, textos.locale),
  );

  y = Math.min(y, y2) - 6;
  y = dibujarTituloSeccion(portada, fuentes.normal, MARGEN, y, textos.detalles);

  const lineasDetalle = reporte.details
    ? envolverTexto(reporte.details, fuentes.normal, 10.5, ancho - MARGEN * 2)
    : [textos.sinDetalles];
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
        textos.detalles,
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

  // --- Firmas: se preparan aquí y se dibujan al final ---
  const sinFusionar: string[] = [];
  let imagenFirma: PDFImage | null = null;
  if (datosFirma) {
    try {
      // La firma la dibuja la propia aplicación y siempre es un PNG pequeño:
      // entra tal cual, sin pasar por la reducción de las fotos.
      imagenFirma = await doc.embedPng(datosFirma);
    } catch {
      sinFusionar.push(textos.firmaCliente);
    }
  }
  const firmas: Firmas = {
    reporta: reporte.authorName,
    cliente: datosFirma
      ? {
          nombre: reporte.signatureName ?? reporte.clientName,
          fecha: reporte.signedAt ? formatInstante(reporte.signedAt, textos.locale) : null,
          imagen: imagenFirma,
        }
      : null,
  };
  const medida = medirFirmas(fuentes, firmas);

  // --- Adjuntos ---
  // De aquí en adelante `libre` es la última hoja propia en la que se dibujó:
  // el detalle, y después cada foto.
  let libre: Cursor = { pagina, y };
  for (const [i, a] of adjuntos.entries()) {
    // A la última foto se le pide dejar sitio debajo para las firmas, que así
    // no gastan una hoja. Si ya hay algo sin incluir no hace falta: detrás
    // viene la hoja que lo lista, y las firmas van en esa.
    const cierraElDocumento = i === adjuntos.length - 1 && sinFusionar.length === 0;
    const hoja = await agregarArchivo(
      doc,
      fuentes,
      contexto,
      paginasPropias,
      a,
      textos.adjunto(i + 1, adjuntos.length),
      a.item.fileName,
      sinFusionar,
      cierraElDocumento ? medida.alto + PISO_TEXTO - PISO_IMAGEN : 0,
    );
    libre = hoja ?? libre;
  }

  libre = agregarPaginaFaltantes(doc, fuentes, contexto, paginasPropias, sinFusionar) ?? libre;

  // Solo se sigue en esa hoja si es la última del documento: detrás de ella
  // puede haber quedado un PDF adjunto, y las firmas cierran el reporte.
  const esLaUltima = doc.getPages().at(-1) === libre.pagina;
  agregarFirmas(
    doc,
    fuentes,
    contexto,
    paginasPropias,
    esLaUltima ? libre : null,
    firmas,
    medida,
  );

  dibujarPies(
    doc,
    fuentes,
    paginasPropias,
    textos,
    formatInstante(new Date(), textos.locale),
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
 * que el PDF de un reporte de servicio, pero sin firmas, adjuntos genéricos, ni
 * los campos que no le aplican (orden de compra, tipo de servicio, etiquetas).
 *
 * Este PDF es exclusivamente interno: nunca se envía al cliente, ni por
 * correo ni por el enlace público de firma — solo el de servicio se comparte
 * fuera del sistema. El idioma sigue la misma regla que el de servicio, para
 * que todos los documentos de una empresa salgan en el suyo.
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
  const textos = textosDeEmpresa(reporte.companyId);
  const contexto: Contexto = {
    logo,
    tipoDocumento: textos.reporteViaticos,
    empresa: reporte.companyName,
    textos,
  };
  const paginasPropias: PDFPage[] = [];

  const portada = doc.addPage(A4);
  paginasPropias.push(portada);
  const [ancho] = A4;

  let y = dibujarEncabezado(portada, fuentes, contexto);

  dibujarTexto(portada, textos.reporteViaticos, {
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
    terminado ? textos.terminado : textos.enProceso,
    terminado,
  );
  y -= 34;

  const total = gastos.reduce((suma, g) => suma + (g.item.amount ?? 0), 0);
  const inicioFilas = y;

  y = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_1,
    y,
    ANCHO_COLUMNA,
    textos.justificaA,
    reporte.projectName,
  );
  y = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_1,
    y,
    ANCHO_COLUMNA,
    textos.creadoPor,
    reporte.authorName,
  );

  let y2 = inicioFilas;
  y2 = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_2,
    y2,
    ANCHO_COLUMNA,
    textos.total,
    formatearMonto(total, reporte.currency),
  );
  y2 = dibujarCampo(
    portada,
    fuentes,
    COLUMNA_2,
    y2,
    ANCHO_COLUMNA,
    textos.creadoEl,
    formatInstante(reporte.createdAt, textos.locale),
  );

  y = Math.min(y, y2) - 6;
  const tituloGastos = textos.gastos(gastos.length);
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
      g.amount !== null ? formatearMonto(g.amount, reporte.currency) : textos.sinMonto;
    const fecha = g.fechaGasto ? formatFechaLarga(g.fechaGasto, textos.locale) : null;

    dibujarTexto(pagina, g.concepto ?? textos.sinConcepto, {
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
      textos.gasto(i + 1, gastos.length),
      g.item.concepto ?? undefined,
      sinFusionar,
    );
  }

  agregarPaginaFaltantes(doc, fuentes, contexto, paginasPropias, sinFusionar);

  dibujarPies(
    doc,
    fuentes,
    paginasPropias,
    textos,
    formatInstante(new Date(), textos.locale),
  );

  return doc.save();
}
