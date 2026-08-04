/**
 * Cada empresa cotiza y cobra en su propia moneda: LLC en dólares, SAS en
 * pesos colombianos. El símbolo "$" es el mismo en las dos, pero el
 * agrupamiento de miles y los decimales no —por eso el formato depende de
 * la empresa del reporte o la cotización, nunca de un formato único fijo.
 */
export const MONEDAS = ["COP", "USD"] as const;
export type Moneda = (typeof MONEDAS)[number];

const FORMATOS: Record<Moneda, Intl.NumberFormat> = {
  COP: new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }),
  USD: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }),
};

/** El monto siempre se guarda en unidades enteras de su moneda — nunca centavos. */
export function formatearMonto(monto: number, moneda: Moneda = "COP"): string {
  return FORMATOS[moneda].format(monto);
}
