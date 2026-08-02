const FORMATO_COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatearMonto(pesos: number): string {
  return FORMATO_COP.format(pesos);
}
