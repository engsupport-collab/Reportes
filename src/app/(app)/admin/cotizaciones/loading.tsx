/**
 * Esqueleto de carga de esta rama.
 *
 * Cubre el listado de cotizaciones ↔ nueva ↔ detalle ↔ editar. Ahí el
 * segmento que cambia cuelga de `cotizaciones`, no de `admin`, así que el
 * `loading.tsx` del padre no se remonta y no mostraría nada.
 *
 * La regla de dónde hace falta un loading.tsx, con la lista completa y el
 * porqué, está en `src/app/(app)/loading.tsx`.
 *
 * El contenido es el mismo para todas: ver `EsqueletoSeccion`.
 */
export { default } from "@/components/esqueleto-seccion";
