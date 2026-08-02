"use client";

import { useRef, useState } from "react";

import type { PuntoMes } from "@/lib/queries/analytics";

/**
 * Reportes creados por mes, últimos doce.
 *
 * Es una sola serie, así que no lleva leyenda: el título ya dice qué se está
 * mirando, y un recuadro de leyenda con una sola entrada solo ocupa sitio.
 *
 * El SVG usa un `viewBox` fijo y se escala con el ancho disponible. La
 * alternativa —medir el contenedor con JavaScript— obliga a un renderizado
 * extra en cada cambio de tamaño para no ganar nada aquí, porque no hay nada
 * que reacomodar: el dibujo entero escala igual.
 */

const ANCHO = 720;
const ALTO = 220;
const IZQ = 38;
const DER = 12;
const ARRIBA = 16;
const ABAJO = 30;

/** Techo "redondo" para el eje: 47 pasa a 50, 230 a 250. */
function techo(maximo: number): number {
  if (maximo <= 4) return 4;
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  return Math.ceil(maximo / (magnitud / 2)) * (magnitud / 2);
}

export function GraficaMeses({ puntos }: { puntos: PuntoMes[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activo, setActivo] = useState<number | null>(null);

  const maximo = techo(Math.max(...puntos.map((p) => p.total), 1));
  const anchoUtil = ANCHO - IZQ - DER;
  const altoUtil = ALTO - ARRIBA - ABAJO;

  const x = (i: number) =>
    IZQ + (puntos.length === 1 ? anchoUtil / 2 : (i * anchoUtil) / (puntos.length - 1));
  const y = (v: number) => ARRIBA + altoUtil - (v / maximo) * altoUtil;

  const punto2 = (p: PuntoMes, i: number) =>
    `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.total)}`;

  const linea = puntos.map(punto2).join(" ");
  const area = `${linea} L ${x(puntos.length - 1)} ${ARRIBA + altoUtil} L ${x(0)} ${ARRIBA + altoUtil} Z`;

  // El último mes va empezado, así que su valor no es comparable con los
  // anteriores: sin distinguirlo, la gráfica siempre termina en una caída y se
  // lee como un derrumbe del trabajo cuando solo es que el mes acaba de
  // empezar. El trazo discontinuo es la convención para "esto todavía no está
  // cerrado".
  const ultimo = puntos.length - 1;
  const cerrados = puntos.slice(0, ultimo).map(punto2).join(" ");
  const enCurso = `M ${x(ultimo - 1)} ${y(puntos[ultimo - 1]!.total)} L ${x(ultimo)} ${y(puntos[ultimo]!.total)}`;

  const marcas = [0, 0.5, 1].map((f) => Math.round(maximo * f));

  /** Traduce la posición del puntero al índice del mes más cercano. */
  function alMover(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const caja = svg.getBoundingClientRect();
    // Se pasa de píxeles de pantalla a coordenadas del viewBox: el SVG está
    // escalado, así que las dos no coinciden.
    const enViewBox = ((e.clientX - caja.left) / caja.width) * ANCHO;
    const razon = (enViewBox - IZQ) / anchoUtil;
    const i = Math.round(razon * (puntos.length - 1));
    setActivo(i >= 0 && i < puntos.length ? i : null);
  }

  const punto = activo !== null ? puntos[activo] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="w-full"
        role="img"
        aria-label={`Reportes por mes durante los últimos ${puntos.length} meses`}
        onPointerMove={alMover}
        onPointerLeave={() => setActivo(null)}
      >
        {/* Rejilla y ejes, deliberadamente tenues: son referencia, no dato. */}
        <g className="text-border">
          {marcas.map((v) => (
            <line
              key={v}
              x1={IZQ}
              x2={ANCHO - DER}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              strokeWidth={1}
            />
          ))}
        </g>

        <g className="text-muted" fontSize={11} fill="currentColor">
          {marcas.map((v) => (
            <text key={v} x={IZQ - 8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          ))}
          {puntos.map((p, i) =>
            // Una etiqueta sí y otra no: con doce nombres de mes seguidos, en
            // el ancho de un móvil se pisan unas con otras.
            i % 2 === 0 ? (
              <text key={p.mes} x={x(i)} y={ALTO - 10} textAnchor="middle">
                {p.etiqueta}
              </text>
            ) : null,
          )}
        </g>

        <g className="text-brand">
          <path d={area} fill="currentColor" fillOpacity={0.12} />
          <path
            d={cerrados}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={enCurso}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
        </g>

        {activo !== null && punto ? (
          <g>
            <line
              x1={x(activo)}
              x2={x(activo)}
              y1={ARRIBA}
              y2={ARRIBA + altoUtil}
              className="text-border"
              stroke="currentColor"
              strokeWidth={1}
            />
            {/* Anillo del color de la tarjeta: separa el punto de la línea sin
                taparla. */}
            <circle
              cx={x(activo)}
              cy={y(punto.total)}
              r={5}
              className="fill-brand stroke-surface"
              strokeWidth={2}
            />
          </g>
        ) : null}
      </svg>

      {activo !== null && punto ? (
        <div
          role="status"
          className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${(x(activo) / ANCHO) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <span className="font-semibold text-text">{punto.total}</span>{" "}
          <span className="text-muted">
            {punto.total === 1 ? "reporte" : "reportes"} · {punto.etiqueta}
            {activo === puntos.length - 1 ? " (en curso)" : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}
