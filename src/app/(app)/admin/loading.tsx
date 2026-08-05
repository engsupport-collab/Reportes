/**
 * Esqueleto de carga de esta rama.
 *
 * Cubre las navegaciones entre secciones del panel: Panel, Cotizaciones,
 * Clientes, Reportes, Usuarios y Analíticas. Todas son hijos directos de
 * `admin`, así que este es el nivel donde el segmento cambia.
 *
 * No basta con el de `(app)`: allí el hijo sigue siendo `admin` y la frontera
 * no se remonta. Medido: sin este archivo, esas navegaciones tardan ~470 ms en
 * dar señal; con él, ~108 ms.
 *
 * La regla de dónde hace falta un loading.tsx, con la lista completa y el
 * porqué, está en `src/app/(app)/loading.tsx`.
 *
 * El contenido es el mismo para todas: ver `EsqueletoSeccion`.
 */
export { default } from "@/components/esqueleto-seccion";
