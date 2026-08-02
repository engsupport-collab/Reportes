import type { Segmento } from "@/lib/queries/analytics";

/**
 * Barras horizontales para un reparto ordenado (clientes, etiquetas, tipo de
 * servicio).
 *
 * Todas las barras van del mismo color a propósito. Lo que distingue a una de
 * otra es su nombre, que está escrito al lado; pintar cada una de un color
 * distinto añadiría un código de color que no significa nada y que habría que
 * descifrar mirando arriba y abajo.
 *
 * El valor va siempre escrito junto a la barra, así que no hace falta pasar el
 * puntero por encima para leer el dato — no es un gráfico que esconda nada.
 */
export function Barras({
  datos,
  vacio = "Todavía no hay datos.",
}: {
  datos: Segmento[];
  vacio?: string;
}) {
  if (datos.length === 0) {
    return <p className="text-sm text-muted">{vacio}</p>;
  }

  // Proporcional al mayor, no al total: la pregunta es "cuál pesa más", y con
  // ocho categorías repartidas todas las barras saldrían minúsculas.
  const maximo = Math.max(...datos.map((d) => d.total), 1);

  return (
    <ul className="space-y-2.5">
      {datos.map((d) => (
        <li key={d.nombre} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          <span className="truncate text-sm text-text" title={d.nombre}>
            {d.nombre}
          </span>
          <span className="text-sm font-semibold tabular-nums text-text">
            {d.total}
          </span>
          <div className="col-span-2 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.max((d.total / maximo) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
