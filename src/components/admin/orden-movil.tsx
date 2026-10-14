"use client";

import { useRouter } from "next/navigation";

/**
 * Orden de la lista en el teléfono, donde no hay encabezados de columna que
 * tocar: las tarjetas no tienen columnas. Elegir lleva a la misma dirección a
 * la que llevaría el encabezado en la tabla.
 */
export function OrdenMovil({
  etiqueta,
  actual,
  opciones,
}: {
  etiqueta: string;
  actual: string;
  opciones: { valor: string; texto: string; href: string }[];
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2 md:hidden">
      <label htmlFor="orden-movil" className="shrink-0 text-sm text-muted">
        {etiqueta}
      </label>
      <select
        id="orden-movil"
        value={actual}
        onChange={(e) => {
          const elegida = opciones.find((o) => o.valor === e.target.value);
          if (elegida) router.push(elegida.href);
        }}
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );
}
