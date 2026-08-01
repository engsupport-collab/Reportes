/**
 * Clasificación de un reporte. Son dos marcas distintas:
 *
 *   1. **Tipo de servicio** — eléctrico o mecánico. Una sola, excluyente. Por
 *      eso es una columna del propio reporte y no una etiqueta suelta: la base
 *      impide que un reporte quede marcado como las dos cosas a la vez.
 *
 *   2. **Etiquetas del trabajo** — preventivo, urgencia, online, proyecto.
 *      Varias a la vez. Viven en su propia tabla, con índice, porque el admin
 *      va a filtrar los mantenimientos ya hechos por estas etiquetas.
 *
 * Este archivo no depende del servidor: el formulario, las listas y las
 * consultas usan el mismo catálogo. Duplicado, agregar una etiqueta nueva
 * obligaría a acordarse de tocarlo en varios sitios.
 */

export const TIPOS_SERVICIO_IDS = ["electrico", "mecanico"] as const;
export type TipoServicio = (typeof TIPOS_SERVICIO_IDS)[number];

export type OpcionEtiqueta = {
  id: string;
  label: string;
  /** Se destaca en rojo: una urgencia tiene que saltar a la vista en la lista. */
  urgente?: boolean;
};

export const TIPOS_SERVICIO: { id: TipoServicio; label: string }[] = [
  { id: "electrico", label: "Eléctrico" },
  { id: "mecanico", label: "Mecánico" },
];

/** Cómo se originó o bajo qué modalidad se hizo. Se pueden marcar varias. */
export const ETIQUETAS_TRABAJO: OpcionEtiqueta[] = [
  { id: "preventivo", label: "Mantenimiento preventivo" },
  { id: "urgencia", label: "Urgencia", urgente: true },
  { id: "online", label: "Trabajo online" },
  { id: "proyecto", label: "Proyecto" },
];

const ETIQUETAS_POR_ID = new Map(ETIQUETAS_TRABAJO.map((o) => [o.id, o]));

export function esEtiquetaValida(id: string): boolean {
  return ETIQUETAS_POR_ID.has(id);
}

export function etiquetaPorId(id: string): OpcionEtiqueta | undefined {
  return ETIQUETAS_POR_ID.get(id);
}

export function tipoServicioLabel(id: string | null): string | null {
  return TIPOS_SERVICIO.find((t) => t.id === id)?.label ?? null;
}

/** Etiquetas de un reporte, ordenadas como el catálogo y sin valores extraños. */
export function ordenarEtiquetas(ids: string[]): OpcionEtiqueta[] {
  const set = new Set(ids);
  return ETIQUETAS_TRABAJO.filter((o) => set.has(o.id));
}
