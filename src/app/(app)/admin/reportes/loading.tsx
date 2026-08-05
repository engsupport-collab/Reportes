/**
 * Esqueleto de carga de esta sección.
 *
 * Tiene que existir en CADA segmento, no basta con uno arriba: React no vuelve
 * a mostrar el fallback de una frontera de Suspense que ya está montada —
 * durante una transición conserva el contenido anterior. La frontera de
 * `(app)` ya está montada mientras navegas dentro del grupo, así que su
 * esqueleto no se vería nunca. El segmento al que entras nace nuevo, y ahí sí
 * aparece.
 *
 * El contenido es el mismo para todas: ver `EsqueletoSeccion`.
 */
export { default } from "@/components/esqueleto-seccion";
