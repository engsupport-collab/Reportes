/**
 * Firma escrita: convierte un nombre tecleado en la misma imagen PNG que
 * produce el pad de dibujo.
 *
 * Se genera una imagen y no se guarda "el nombre y la fuente" porque todo lo
 * que hay aguas abajo —la vista del reporte, la ruta /api/firmas, el PDF— ya
 * trabaja con un PNG. Convertirlo aquí deja intacto el resto del sistema.
 */

export type EstiloFirma = {
  id: string;
  nombre: string;
  /** Variable CSS declarada en layout.tsx. */
  variable: string;
};

export const ESTILOS_FIRMA: EstiloFirma[] = [
  { id: "cursiva", nombre: "Cursiva", variable: "--font-firma-cursiva" },
  {
    id: "manuscrita",
    nombre: "Manuscrita",
    variable: "--font-firma-manuscrita",
  },
  { id: "elegante", nombre: "Elegante", variable: "--font-firma-elegante" },
];

/** Mismo color que el trazo del pad, para que las dos firmas se vean igual. */
const COLOR = "#111827";
const ANCHO = 600;
const ALTO = 200;
const MARGEN = 40;
const TAMANO_MAXIMO = 84;
const TAMANO_MINIMO = 24;

/**
 * `getComputedStyle` devuelve la pila completa —la fuente real más su
 * suplente—, que sirve para `ctx.font` pero no para `document.fonts.load`,
 * que espera una sola familia. Esto toma la primera y le quita las comillas.
 */
function primeraFamilia(pila: string): string {
  const primera = pila.split(",")[0]?.trim() ?? "";
  return primera.replace(/^["']|["']$/g, "");
}

/**
 * Dibuja el nombre centrado y devuelve el PNG.
 *
 * Antes de medir nada espera a que la tipografía esté cargada: si no, el
 * navegador mide con la fuente suplente y la firma sale con otro tamaño —o
 * directamente con la letra equivocada, que es peor porque no da error.
 */
export async function generarFirmaEscrita(
  texto: string,
  pilaDeFuentes: string,
): Promise<Blob | null> {
  const nombre = texto.trim();
  if (!nombre) return null;

  const familia = primeraFamilia(pilaDeFuentes);

  try {
    await document.fonts.load(`${TAMANO_MAXIMO}px "${familia}"`, nombre);
  } catch {
    // Si falla la carga se sigue igual: el navegador usará la suplente y la
    // firma se verá distinta, pero es preferible a no poder firmar.
  }

  const canvas = document.createElement("canvas");
  const escala = window.devicePixelRatio || 1;
  canvas.width = ANCHO * escala;
  canvas.height = ALTO * escala;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(escala, escala);
  ctx.fillStyle = COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Se reduce hasta que quepa: un nombre largo con la fuente grande se saldría
  // por los lados y quedaría recortado en el PDF.
  let tamano = TAMANO_MAXIMO;
  ctx.font = `${tamano}px ${pilaDeFuentes}`;
  while (
    ctx.measureText(nombre).width > ANCHO - MARGEN * 2 &&
    tamano > TAMANO_MINIMO
  ) {
    tamano -= 2;
    ctx.font = `${tamano}px ${pilaDeFuentes}`;
  }

  ctx.fillText(nombre, ANCHO / 2, ALTO / 2);

  return new Promise((resolver) =>
    canvas.toBlob((blob) => resolver(blob), "image/png"),
  );
}
