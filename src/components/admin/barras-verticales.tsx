import type { BarraDato, TonoBarra } from "./barras";

const RELLENO: Record<TonoBarra, string> = {
  marca: "bg-brand",
  ok: "bg-success",
  alerta: "bg-warning",
};

/**
 * Altura máxima de una barra, en porcentaje del área de dibujo.
 *
 * No llega al 100% para dejar sitio al número que va encima: con la barra más
 * alta pegada al techo, su cifra se saldría del recuadro. Como el valor va
 * escrito en cada barra, recortar la escala no induce a error — no hay que
 * medir contra un eje que no existe.
 */
const TOPE = 86;

/**
 * Barras verticales para el recuento por estado.
 *
 * Se prefiere esta forma a la horizontal cuando las categorías son pocas y de
 * nombre corto: comparar alturas es más directo que comparar longitudes, y con
 * cuatro columnas los nombres caben debajo sin recortarse.
 *
 * El número va escrito sobre cada barra en lugar de dejarlo en un eje: son
 * cuatro cifras, se leen de un vistazo, y así el dato exacto no depende de
 * pasar el puntero por encima.
 */
export function BarrasVerticales({
  datos,
  vacio = "Todavía no hay datos.",
}: {
  datos: BarraDato[];
  vacio?: string;
}) {
  if (datos.length === 0) {
    return <p className="text-sm text-muted">{vacio}</p>;
  }

  const maximo = Math.max(...datos.map((d) => d.total), 1);

  return (
    // Ocupa el alto que le den, con un mínimo para que no se aplaste. Así la
    // tarjeta puede estirarse hasta igualar la columna de al lado y no queda
    // un hueco muerto entre una y otra.
    <div className="flex h-full flex-col">
      <div className="flex min-h-52 flex-1 items-end gap-3 border-b border-border sm:gap-6">
        {datos.map((d) => {
          // El cero no dibuja nada: una astilla de color se leería como "hay
          // poquito" cuando lo correcto es que no haya nada.
          const alto = d.total === 0 ? 0 : Math.max((d.total / maximo) * TOPE, 2);

          return (
            <div
              key={d.nombre}
              className="relative flex h-full flex-1 items-end justify-center"
            >
              {/* Ancho limitado: repartida la columna entera, la barra salía
                  más ancha que alta y dejaba de leerse como una columna para
                  parecer un bloque de color. */}
              <div
                className={`w-full max-w-20 rounded-t-md ${RELLENO[d.tono ?? "marca"]}`}
                style={{ height: `${alto}%` }}
              />
              <span
                className="absolute inset-x-0 text-center text-sm font-semibold text-text"
                style={{ bottom: `calc(${alto}% + 6px)` }}
              >
                {d.total}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex shrink-0 gap-3 sm:gap-6">
        {datos.map((d) => (
          <span
            key={d.nombre}
            className="flex-1 text-center text-xs text-muted"
            title={d.nombre}
          >
            {d.nombre}
          </span>
        ))}
      </div>
    </div>
  );
}
