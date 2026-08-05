/**
 * Esqueleto de carga de esta rama.
 *
 * Cubre el cambio de empresa dentro de analíticas (corp ↔ saas), que es lo
 * que ofrece el desplegable del rail. Sin este archivo esa navegación se
 * queda sin señal ~900 ms; con él, ~136 ms.
 *
 * La regla de dónde hace falta un loading.tsx, con la lista completa y el
 * porqué, está en `src/app/(app)/loading.tsx`.
 *
 * El contenido es el mismo para todas: ver `EsqueletoSeccion`.
 */
export { default } from "@/components/esqueleto-seccion";
