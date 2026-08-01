import Link from "next/link";

import { Sparkline } from "./sparkline";

/**
 * Tarjeta de estadística del panel.
 *
 * Estructura: etiqueta · valor · variación · tendencia. Es la forma correcta
 * para un número con contexto — una gráfica de barras de un solo dato ocuparía
 * diez veces el espacio para decir lo mismo.
 */

function compacto(valor: number): string {
  if (valor < 1000) return String(valor);
  if (valor < 1_000_000) return `${(valor / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(valor / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function Variacion({
  actual,
  anterior,
  periodo,
  subirEsBueno,
}: {
  actual: number;
  anterior: number;
  periodo: string;
  subirEsBueno: boolean;
}) {
  if (anterior === 0 && actual === 0) {
    return <span className="text-xs text-muted">Sin datos previos</span>;
  }

  // Desde cero no existe el porcentaje de aumento: se dice "nuevo" en lugar de
  // inventar un "+100%" o un infinito.
  if (anterior === 0) {
    return (
      <span className="text-xs font-medium text-muted">
        Nuevo · {periodo} sin registros
      </span>
    );
  }

  const cambio = ((actual - anterior) / anterior) * 100;
  const subio = cambio > 0;
  const igual = Math.round(cambio) === 0;

  // El color depende de la dirección Y de si subir es bueno para este dato:
  // más reportes es positivo, más pendientes sin documento no lo es.
  const bueno = subio === subirEsBueno;
  const color = igual
    ? "text-muted"
    : bueno
      ? "text-success"
      : "text-danger";

  return (
    <span className={`text-xs font-medium ${color}`}>
      {/* Flecha y signo además del color: el verde y el rojo se confunden con
          daltonismo, y la dirección no puede depender solo del tono. */}
      {igual ? "=" : subio ? "▲" : "▼"} {igual ? "0" : Math.abs(Math.round(cambio))}%{" "}
      <span className="font-normal text-muted">vs {periodo}</span>
    </span>
  );
}

export function StatTile({
  etiqueta,
  valor,
  anterior,
  periodo,
  subirEsBueno = true,
  tendencia,
  href,
  tono = "normal",
  nota,
}: {
  etiqueta: string;
  valor: number;
  anterior?: number;
  periodo?: string;
  subirEsBueno?: boolean;
  tendencia?: number[];
  href?: string;
  /** "alerta" resalta la tarjeta en ámbar: es accionable, no informativa. */
  tono?: "normal" | "alerta";
  nota?: string;
}) {
  const esAlerta = tono === "alerta" && valor > 0;

  const contenido = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {etiqueta}
      </p>

      {/* Cifras proporcionales, no tabulares: en tamaño grande, `tabular-nums`
          da a cada dígito el ancho de un cero y el número se ve suelto. */}
      <p
        className={`mt-2 text-3xl font-semibold leading-none ${
          esAlerta ? "text-warning" : "text-text"
        }`}
      >
        {compacto(valor)}
      </p>

      <div className="mt-2 min-h-4">
        {anterior !== undefined && periodo ? (
          <Variacion
            actual={valor}
            anterior={anterior}
            periodo={periodo}
            subirEsBueno={subirEsBueno}
          />
        ) : nota ? (
          <span className="text-xs text-muted">{nota}</span>
        ) : null}
      </div>

      {tendencia ? (
        <div className="mt-3">
          <Sparkline puntos={tendencia} />
        </div>
      ) : null}

      {esAlerta && href ? (
        <p className="mt-3 text-xs font-semibold text-warning">Ver pendientes →</p>
      ) : null}
    </>
  );

  const clases = `block rounded-2xl border p-4 transition ${
    esAlerta
      ? "border-warning/40 bg-warning-soft"
      : "border-border bg-surface"
  } ${href ? "hover:border-brand hover:shadow-sm" : ""}`;

  if (href) {
    return (
      <Link href={href} className={clases}>
        {contenido}
      </Link>
    );
  }

  return <div className={clases}>{contenido}</div>;
}
