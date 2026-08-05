import {
  Barra,
  EncabezadoEsqueleto,
  FilasEsqueleto,
  TarjetaEsqueleto,
} from "@/components/esqueleto";

/**
 * Lo que se ve mientras carga una sección.
 *
 * Solo ocupa el área de contenido: el rail y la barra superior viven en el
 * layout de `(app)`, por encima de esta frontera, y se quedan donde están.
 * Cuando el marco lo montaba cada página esto era imposible — un esqueleto
 * habría barrido también el menú, que es peor que no tener ninguno.
 *
 * No acorta la navegación: tarda lo mismo. Lo que cambia es que durante ese
 * rato la pantalla dice "voy" en vez de seguir mostrando la sección anterior
 * como si el clic no se hubiera registrado.
 *
 * Es el mismo para todas las secciones a propósito. Uno por pantalla sería más
 * fiel, pero se desincroniza en cuanto alguien cambia una tabla, y la fidelidad
 * no aporta nada en algo que dura menos de medio segundo. La forma común
 * —encabezado, una tarjeta, una lista— es la de casi todas.
 */
export default function EsqueletoSeccion() {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">Cargando…</span>

      <EncabezadoEsqueleto />

      <TarjetaEsqueleto>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Barra className="h-5 w-48" />
          <Barra className="h-8 w-32 rounded-lg" />
        </div>
        <div className="mt-6">
          <FilasEsqueleto cuantas={5} />
        </div>
      </TarjetaEsqueleto>
    </div>
  );
}
