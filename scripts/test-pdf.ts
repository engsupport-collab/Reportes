/**
 * Prueba del texto de los PDF.
 *
 *   npm run test:pdf
 *
 * No toca la base ni el almacenamiento: arma reportes en memoria, genera el PDF
 * de verdad y lee lo que quedó dibujado en él.
 *
 * Reproduce el primer reporte real del sistema (2026-10-04), que no se pudo
 * descargar ni enviar por correo: su detalle venía de un `<textarea>`, con los
 * saltos de línea como CR+LF, y el generador solo sabía de LF. Hasta entonces
 * el PDF se había probado con texto de una línea escrito en el código — que es
 * justo el caso que nunca falló.
 *
 * Los caracteres especiales van por su número (`c(0x202f)`) y no escritos:
 * muchos son invisibles o idénticos a otros, y escritos aquí no se sabría qué
 * se está probando.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "dotenv";
import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
} from "pdf-lib";

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

  /** Genera y lee el PDF. Si no se genera, lo anota como fallo y devuelve null. */
  async function generar(
    descripcion: string,
    armar: () => Promise<Uint8Array>,
  ): Promise<Trazo[][] | null> {
    try {
      const bytes = await armar();
      const cabecera = new TextDecoder("latin1").decode(bytes.slice(0, 5));
      comprobar(`${descripcion}: se genera`, cabecera === "%PDF-", `${bytes.length} bytes`);
      return await trazosDelPdf(bytes);
    } catch (error) {
      comprobar(
        `${descripcion}: se genera`,
        false,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

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
