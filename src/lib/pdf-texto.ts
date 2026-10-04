import "server-only";

import type { PDFFont, PDFPage, PDFPageDrawTextOptions } from "pdf-lib";

/**
 * Todo texto que llega a un PDF pasa por aquí antes de medirse o dibujarse.
 *
 * Las fuentes estándar de `pdf-lib` solo conocen 218 caracteres (WinAnsi: el
 * alfabeto latino con sus tildes y poco más). Con cualquier otro —un salto de
 * línea, un tabulador, un emoji, una letra griega— `widthOfTextAtSize` y
 * `drawText` no dibujan un hueco: lanzan, y el documento entero no se genera.
 *
 * Así falló el primer reporte real (2026-10-04): un `<textarea>` manda los
 * saltos de línea como CR+LF, el detalle se partía solo por LF, y el CR que
 * quedaba suelto tumbó a la vez la descarga, el enlace público y el correo
 * — los tres arman el mismo PDF. Las pruebas no lo vieron porque usaban texto
 * de una sola línea escrito en el código, no texto pasado por un formulario.
 *
 * De ahí la regla: `pdf.ts` y `pdf-marca.ts` no llaman a `drawText` ni a
 * `widthOfTextAtSize` directamente, sino a `dibujarTexto`, `anchoDeTexto` y
 * `envolverTexto`. `npm run test:pdf` comprueba que siga siendo así.
 */

const c = String.fromCodePoint;

/**
 * Lo que la fuente no tiene pero se puede decir con lo que sí tiene. Está
 * pensado para lo que se escribe en un reporte técnico desde un celular; lo
 * que no aparece aquí y no es decorativo sale como "?", a la vista, en vez de
 * desaparecer en silencio de una constancia de trabajo.
 *
 * Va por número de carácter y no con el carácter escrito: varios de estos son
 * idénticos a la vista (cuatro guiones distintos, dos omegas, dos mu) y
 * escritos aquí no se sabría cuál es cuál.
 */
const EQUIVALENCIAS = new Map<number, string>([
  // Guiones que no son el del teclado, y el signo menos.
  [0x2010, "-"],
  [0x2011, "-"],
  [0x2012, "-"],
  [0x2212, "-"],
  [0x2043, "-"],
  [0x2015, c(0x2014)],
  // Comillas y primas (pies, pulgadas, minutos).
  [0x201b, "'"],
  [0x02bc, "'"],
  [0x2032, "'"],
  [0x201f, '"'],
  [0x2033, '"'],
  // Puntos y viñetas, hacia el punto medio y la viñeta que sí están.
  [0x2024, "."],
  [0x2025, ".."],
  [0x22ef, "..."],
  [0x2219, c(0x00b7)],
  [0x25cf, c(0x2022)],
  [0x25cb, c(0x2022)],
  [0x25e6, c(0x2022)],
  [0x25aa, c(0x2022)],
  [0x25a0, c(0x2022)],
  [0x2023, c(0x2022)],
  // Flechas.
  [0x2192, "->"],
  [0x27a1, "->"],
  [0x21d2, "=>"],
  [0x2190, "<-"],
  [0x2194, "<->"],
  // Comparaciones.
  [0x2264, "<="],
  [0x2265, ">="],
  [0x2260, "!="],
  [0x2248, "~"],
  // Unidades: omega y el signo de ohmio, mu griega (al signo micro, que sí
  // está), delta y el signo de incremento, pi, grados, diámetro, número.
  [0x03a9, "ohm"],
  [0x2126, "ohm"],
  [0x03bc, c(0x00b5)],
  [0x0394, "delta"],
  [0x2206, "delta"],
  [0x03c0, "pi"],
  [0x2103, `${c(0x00b0)}C`],
  [0x2109, `${c(0x00b0)}F`],
  [0x2300, c(0x00d8)],
  [0x2116, "No."],
  // Marcas de estado: son las únicas figuras que cambian lo que dice una
  // línea ("bomba 2" con una cruz no es lo mismo que con un visto bueno).
  [0x2713, "[OK]"],
  [0x2714, "[OK]"],
  [0x2705, "[OK]"],
  [0x2611, "[OK]"],
  [0x2717, "[X]"],
  [0x2718, "[X]"],
  [0x274c, "[X]"],
  [0x274e, "[X]"],
  [0x2716, "[X]"],
  [0x2612, "[X]"],
  [0x26a0, "[!]"],
  // Subíndices y superíndices que no están en la fuente (1, 2 y 3 sí están).
  ...Array.from("0123456789", (digito, i): [number, string] => [0x2080 + i, digito]),
  [0x2070, "0"],
  ...Array.from("456789", (digito, i): [number, string] => [0x2074 + i, digito]),
]);

/** Está en la fuente, pero dibujado es un guion a mitad de palabra. */
const GUION_OPCIONAL = 0x00ad;
const SALTO = 0x000a;
const TABULADOR = 0x0009;

const ESPACIO = /\p{Zs}/u;
/** Controles, marcas de formato (unión de ancho cero, dirección del texto…) y tildes sueltas. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{M}]/u;
const FIGURA = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}]/u;

/** CR+LF, CR solo, tabulador vertical, salto de página, NEL y los separadores Unicode de línea y de párrafo. */
const SALTO_DE_LINEA = /\r\n?|[\v\f\x85\p{Zl}\p{Zp}]/gu;

/**
 * Lo que la fuente puede dibujar se le pregunta a la fuente, no a una tabla
 * copiada aquí: así no hay dos listas que mantener de acuerdo.
 */
const repertorios = new WeakMap<PDFFont, Set<number>>();

function repertorioDe(font: PDFFont): Set<number> {
  let repertorio = repertorios.get(font);
  if (!repertorio) {
    repertorio = new Set(font.getCharacterSet());
    repertorios.set(font, repertorio);
  }
  return repertorio;
}

/**
 * Todos los saltos de línea, como LF. Normalizar y no borrar: CR+LF es un solo
 * salto (borrar el CR lo deja bien por casualidad), pero un CR suelto también
 * lo es, y borrándolo se pegarían dos renglones.
 */
export function normalizarSaltos(texto: string): string {
  return texto.replace(SALTO_DE_LINEA, "\n");
}

/**
 * Un texto de UN renglón que la fuente puede dibujar. Los saltos de línea se
 * vuelven espacios: para texto de varios renglones está `envolverTexto`.
 */
export function textoDibujable(texto: string, font: PDFFont): string {
  const repertorio = repertorioDe(font);
  let salida = "";

  // NFC junta una letra y su tilde suelta en una sola, que sí está en la fuente.
  for (const caracter of normalizarSaltos(texto).normalize("NFC")) {
    const codigo = caracter.codePointAt(0)!;
    if (codigo === GUION_OPCIONAL) continue;

    if (repertorio.has(codigo)) {
      salida += caracter;
      continue;
    }

    const equivalencia = EQUIVALENCIAS.get(codigo);
    if (equivalencia !== undefined) {
      salida += equivalencia;
    } else if (codigo === SALTO || ESPACIO.test(caracter)) {
      salida += " ";
    } else if (codigo === TABULADOR) {
      salida += "    ";
    } else if (INVISIBLE.test(caracter) || FIGURA.test(caracter)) {
      continue;
    } else {
      salida += "?";
    }
  }

  return salida;
}

export function anchoDeTexto(font: PDFFont, texto: string, tamano: number): number {
  return font.widthOfTextAtSize(textoDibujable(texto, font), tamano);
}

/** Parte un texto en renglones que caben en `anchoMaximo`, respetando sus saltos de línea. */
export function envolverTexto(
  texto: string,
  font: PDFFont,
  tamano: number,
  anchoMaximo: number,
): string[] {
  const lineas: string[] = [];
  for (const parrafo of normalizarSaltos(texto).split("\n")) {
    let actual = "";
    for (const palabra of textoDibujable(parrafo, font).split(" ")) {
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

/** `page.drawText`, con el texto ya limpio. `font` es obligatoria: de ella sale qué se puede dibujar. */
export function dibujarTexto(
  page: PDFPage,
  texto: string,
  opciones: PDFPageDrawTextOptions & { font: PDFFont },
): void {
  page.drawText(textoDibujable(texto, opciones.font), opciones);
}
