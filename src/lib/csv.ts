/**
 * Un archivo CSV que Excel abra bien en Colombia.
 *
 * - Separado por punto y coma, no por coma: en la configuración regional de
 *   Colombia la coma es el separador decimal, y Excel en español espera ";".
 *   Con coma, todo caería en la primera columna.
 * - Con la marca de orden de bytes de UTF-8 al principio: sin ella, Excel lee
 *   el archivo en la codificación de Windows y las tildes salen rotas.
 * - Renglones terminados en CR+LF, como manda el formato.
 *
 * Además, un texto que empiece por "=", "+", "-" o "@" se escribe con una
 * comilla simple delante. Excel trata esas celdas como fórmulas: un nombre de
 * proyecto escrito así podría ejecutar algo al abrir el archivo. Con la
 * comilla la celda queda como texto; al abrir un CSV, Excel la deja a la
 * vista. Es el precio de la protección, y solo lo pagan esos textos.
 */

/** La marca de UTF-8, por su número: escrita a mano sería invisible. */
const MARCA_UTF8 = String.fromCharCode(0xfeff);
const SEPARADOR = ";";
const PARECE_FORMULA = /^[=+\-@\t\r]/;

export type ValorCsv = string | number | null | undefined;

function celda(valor: ValorCsv): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return String(valor);

  const texto = PARECE_FORMULA.test(valor) ? `'${valor}` : valor;
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aCsv(encabezados: string[], filas: ValorCsv[][]): string {
  return (
    MARCA_UTF8 +
    [encabezados, ...filas].map((fila) => fila.map(celda).join(SEPARADOR)).join("\r\n") +
    "\r\n"
  );
}
