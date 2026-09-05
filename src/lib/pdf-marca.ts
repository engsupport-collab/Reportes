import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { type PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb } from "pdf-lib";

/**
 * Identidad visual de los PDF: logo, colores y las piezas que se repiten en
 * todas las páginas (encabezado, pie, títulos de sección, insignias).
 *
 * Vive aparte de `pdf.ts` porque ese archivo ya tiene bastante con armar el
 * contenido de cada tipo de reporte; aquí está solo el "cómo se ve", que es lo
 * que se toca cuando cambia la marca.
 *
 * El azul es el del logo (muestreado del propio archivo), no el turquesa de la
 * interfaz: este documento lo recibe el cliente y representa a la empresa, no
 * a la herramienta interna con la que se hizo.
 */

export const A4: [number, number] = [595, 842];
export const MARGEN = 48;

export const COLOR_TEXTO = rgb(0.06, 0.08, 0.11);
export const COLOR_MUTED = rgb(0.4, 0.45, 0.52);
export const COLOR_MARCA = rgb(0.133, 0.337, 0.667);
export const COLOR_LINEA = rgb(0.85, 0.87, 0.9);
export const COLOR_TERMINADO = rgb(0.13, 0.5, 0.28);
export const COLOR_PROCESO = rgb(0.65, 0.47, 0.05);

/** Proporción real del archivo (1333x379); fijarla evita deformarlo. */
const LOGO_PROPORCION = 1333 / 379;
const LOGO_ANCHO = 128;
export const LOGO_ALTO = LOGO_ANCHO / LOGO_PROPORCION;

const ALTO_ENCABEZADO = LOGO_ALTO + 22;

/**
 * El logo se lee del disco una sola vez por instancia. `public/` no entra solo
 * en el paquete de una función serverless: se fuerza desde
 * `outputFileTracingIncludes` en next.config.ts. Si aun así no estuviera, el
 * documento se arma igual con el nombre de la empresa en su lugar — un PDF sin
 * logo es un problema menor; uno que no se genera, uno grave.
 */
let logoCache: Promise<Buffer | null> | undefined;

function cargarLogo(): Promise<Buffer | null> {
  logoCache ??= readFile(path.join(process.cwd(), "public", "logo-azul.png")).catch(
    (error) => {
      console.warn("No se pudo leer el logo para el PDF:", error);
      return null;
    },
  );
  return logoCache;
}

export async function embeberLogo(doc: PDFDocument): Promise<PDFImage | null> {
  const datos = await cargarLogo();
  if (!datos) return null;
  try {
    return await doc.embedPng(datos);
  } catch (error) {
    console.warn("No se pudo incrustar el logo en el PDF:", error);
    return null;
  }
}

/**
 * Encabezado: logo a la izquierda, tipo de documento y empresa a la derecha,
 * y una regla de marca debajo. Devuelve la altura ocupada, para que quien
 * llama siga escribiendo desde ahí.
 */
export function dibujarEncabezado(
  page: PDFPage,
  fuentes: { normal: PDFFont; bold: PDFFont },
  opciones: {
    logo: PDFImage | null;
    tipoDocumento: string;
    empresa: string;
    nombreEmpresa: string;
  },
): number {
  const [ancho, alto] = A4;
  const topeLogo = alto - MARGEN - LOGO_ALTO;

  if (opciones.logo) {
    page.drawImage(opciones.logo, {
      x: MARGEN,
      y: topeLogo,
      width: LOGO_ANCHO,
      height: LOGO_ALTO,
    });
  } else {
    page.drawText(opciones.nombreEmpresa, {
      x: MARGEN,
      y: topeLogo + LOGO_ALTO / 2 - 6,
      size: 15,
      font: fuentes.bold,
      color: COLOR_MARCA,
    });
  }

  const tipo = opciones.tipoDocumento.toUpperCase();
  const anchoTipo = fuentes.bold.widthOfTextAtSize(tipo, 9);
  page.drawText(tipo, {
    x: ancho - MARGEN - anchoTipo,
    y: topeLogo + LOGO_ALTO - 10,
    size: 9,
    font: fuentes.bold,
    color: COLOR_MARCA,
  });

  const anchoEmpresa = fuentes.normal.widthOfTextAtSize(opciones.empresa, 9);
  page.drawText(opciones.empresa, {
    x: ancho - MARGEN - anchoEmpresa,
    y: topeLogo + LOGO_ALTO - 24,
    size: 9,
    font: fuentes.normal,
    color: COLOR_MUTED,
  });

  const yRegla = alto - MARGEN - ALTO_ENCABEZADO + 6;
  page.drawLine({
    start: { x: MARGEN, y: yRegla },
    end: { x: ancho - MARGEN, y: yRegla },
    thickness: 1.5,
    color: COLOR_MARCA,
  });

  return yRegla - 26;
}

/** Título de sección: una barra corta de marca y el rótulo en versalitas. */
export function dibujarTituloSeccion(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  texto: string,
): number {
  page.drawRectangle({
    x,
    y: y - 1,
    width: 3,
    height: 9,
    color: COLOR_MARCA,
  });
  page.drawText(texto.toUpperCase(), {
    x: x + 9,
    y,
    size: 8.5,
    font,
    color: COLOR_MUTED,
  });
  return y - 20;
}

/**
 * Un dato con su rótulo. Devuelve la nueva altura. El rótulo va arriba y
 * pequeño, el valor debajo y con más peso: leído en diagonal, lo que salta es
 * el dato, no la etiqueta.
 */
export function dibujarCampo(
  page: PDFPage,
  fuentes: { normal: PDFFont; bold: PDFFont },
  x: number,
  y: number,
  ancho: number,
  etiqueta: string,
  valor: string,
): number {
  page.drawText(etiqueta.toUpperCase(), {
    x,
    y,
    size: 7.5,
    font: fuentes.normal,
    color: COLOR_MUTED,
  });
  page.drawText(valor, {
    x,
    y: y - 14,
    size: 10.5,
    font: fuentes.bold,
    color: COLOR_TEXTO,
    maxWidth: ancho,
  });
  page.drawLine({
    start: { x, y: y - 24 },
    end: { x: x + ancho, y: y - 24 },
    thickness: 0.5,
    color: COLOR_LINEA,
  });
  return y - 40;
}

/** Insignia de estado: rectángulo de color con el texto encima, en blanco. */
export function dibujarInsignia(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  texto: string,
  terminado: boolean,
): void {
  const tamano = 8.5;
  const anchoTexto = font.widthOfTextAtSize(texto.toUpperCase(), tamano);
  page.drawRectangle({
    x,
    y: y - 4,
    width: anchoTexto + 16,
    height: 17,
    color: terminado ? COLOR_TERMINADO : COLOR_PROCESO,
  });
  page.drawText(texto.toUpperCase(), {
    x: x + 8,
    y,
    size: tamano,
    font,
    color: rgb(1, 1, 1),
  });
}

/**
 * Pie de página, al final de todo — hace falta conocer el total de páginas.
 *
 * Solo se dibuja en las páginas que arma este generador, nunca en las que
 * vienen de un PDF adjunto del cliente: ahí el contenido no es nuestro y
 * escribir encima podría tapar algo. La numeración sí cuenta el documento
 * completo, así que "Página 3 de 10" sigue siendo cierto aunque la 4 no lleve
 * pie.
 */
export function dibujarPies(
  doc: PDFDocument,
  font: PDFFont,
  paginasPropias: PDFPage[],
  textoIzquierda: string,
): void {
  const paginas = doc.getPages();
  const total = paginas.length;

  for (const page of paginasPropias) {
    const indice = paginas.indexOf(page);
    if (indice === -1) continue;

    const { width } = page.getSize();

    page.drawLine({
      start: { x: MARGEN, y: 40 },
      end: { x: width - MARGEN, y: 40 },
      thickness: 0.5,
      color: COLOR_LINEA,
    });

    page.drawText(textoIzquierda, {
      x: MARGEN,
      y: 28,
      size: 7.5,
      font,
      color: COLOR_MUTED,
    });

    const numero = `Página ${indice + 1} de ${total}`;
    const anchoNumero = font.widthOfTextAtSize(numero, 7.5);
    page.drawText(numero, {
      x: width - MARGEN - anchoNumero,
      y: 28,
      size: 7.5,
      font,
      color: COLOR_MUTED,
    });
  }
}
