/**
 * Minigráfica de tendencia para las tarjetas del panel.
 *
 * SVG a mano, sin librería de gráficas: son doce puntos y una línea. Traer una
 * dependencia de visualización para esto cargaría el navegador con código que
 * no se usa en ninguna otra parte del sistema.
 *
 * Sigue las especificaciones de marca de la guía de visualización: línea de 2px
 * con uniones redondeadas, punto final de 8px de diámetro con anillo del color
 * de la superficie, y sin ejes ni rejilla —en un espacio de 40px de alto solo
 * añadirían ruido—. La forma comunica la tendencia; el número exacto está en la
 * cifra grande, justo encima.
 */
export function Sparkline({
  puntos,
  acento = "var(--brand)",
}: {
  puntos: number[];
  acento?: string;
}) {
  // Con menos de dos puntos no hay tendencia que mostrar; una línea plana
  // sugeriría una estabilidad que no se ha medido.
  if (puntos.length < 2) return <div className="h-10" />;

  const ANCHO = 120;
  const ALTO = 40;
  const MARGEN = 4;

  const maximo = Math.max(...puntos, 1);
  const paso = ANCHO / (puntos.length - 1);

  const coordenadas = puntos.map((valor, i) => {
    const x = i * paso;
    const y = ALTO - MARGEN - (valor / maximo) * (ALTO - MARGEN * 2);
    return { x, y };
  });

  const linea = coordenadas
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // El área es un lavado del mismo tono, no un bloque saturado: acompaña a la
  // línea sin competir con ella.
  const area = `${linea} L${ANCHO} ${ALTO} L0 ${ALTO} Z`;

  const ultimo = coordenadas[coordenadas.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className="h-10 w-full"
      preserveAspectRatio="none"
      // La gráfica es decorativa: el valor y la variación ya están en texto
      // justo al lado, así que un lector de pantalla no gana nada leyéndola.
      aria-hidden
      focusable="false"
    >
      <path d={area} fill={acento} opacity={0.1} />
      <path
        d={linea}
        fill="none"
        stroke={acento}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={ultimo.x}
        cy={ultimo.y}
        r={3.5}
        fill={acento}
        stroke="var(--surface)"
        strokeWidth={2}
      />
    </svg>
  );
}
