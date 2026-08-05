/**
 * Piezas de un esqueleto de carga.
 *
 * Son bloques grises con la forma aproximada de lo que va a llegar. No imitan
 * la pantalla al detalle a propósito: un esqueleto que promete exactamente
 * cuatro filas y luego trae once es peor que uno que solo dice "aquí viene una
 * lista". Lo que tiene que comunicar es "esto está cargando y va a ocupar este
 * espacio", nada más.
 *
 * Usan los mismos tokens de color que el resto (`bg-surface`, `border-border`),
 * así que funcionan igual en claro y en oscuro sin una hoja de estilos aparte.
 *
 * `motion-reduce:animate-none` apaga el pulso para quien pidió menos
 * movimiento en su sistema; el esqueleto sigue ahí, simplemente quieto.
 */

const PULSO = "animate-pulse motion-reduce:animate-none";

/** Una barra gris del ancho que se le diga. */
export function Barra({ className = "" }: { className?: string }) {
  return <div className={`${PULSO} h-4 rounded-md bg-surface-muted ${className}`} />;
}

/** Una tarjeta con el mismo borde y fondo que las de verdad. */
export function TarjetaEsqueleto({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      {children}
    </div>
  );
}

/** El encabezado con saludo y fecha que llevan casi todas las pantallas. */
export function EncabezadoEsqueleto() {
  return (
    <div className="mb-6">
      <Barra className="h-7 w-64" />
      <Barra className="mt-2 h-4 w-44" />
    </div>
  );
}

/** Varias filas, para las pantallas que son un listado. */
export function FilasEsqueleto({ cuantas = 4 }: { cuantas?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: cuantas }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted px-3 py-3.5"
        >
          <Barra className="w-1/3 bg-border" />
          <Barra className="w-16 bg-border" />
        </div>
      ))}
    </div>
  );
}
