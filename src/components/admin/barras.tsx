import type { Segmento } from "@/lib/queries/analytics";

/**
 * Un tono por barra. Solo se usa cuando las categorías tienen valencias
 * distintas —algo que está bien frente a algo que falta—, no para repartos
 * donde todas las barras miden lo mismo.
 */
export type TonoBarra = "marca" | "ok" | "alerta";

const RELLENO: Record<TonoBarra, string> = {
  marca: "bg-brand",
  ok: "bg-success",
  alerta: "bg-warning",
};

export type BarraDato = Segmento & { tono?: TonoBarra };

/**
 * Barras horizontales para un reparto ordenado (clientes, etiquetas, tipo de
 * servicio) o para un recuento por estado.
 *
 * Por defecto todas las barras van del mismo color. Lo que distingue a una de
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
  datos: BarraDato[];
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
            {/* El mínimo del 2% es para que un valor pequeño pero real siga
                viéndose. El cero se excluye a mano: con el mínimo aplicado
                pintaba una astilla de color que se lee como "hay poquito"
                cuando lo correcto es que no haya nada. */}
            <div
              className={`h-full rounded-full ${RELLENO[d.tono ?? "marca"]}`}
              style={{
                width:
                  d.total === 0
                    ? "0%"
                    : `${Math.max((d.total / maximo) * 100, 2)}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
