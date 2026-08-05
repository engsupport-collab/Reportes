/**
 * Esqueleto de carga del grupo `(app)`.
 *
 * DÓNDE HACE FALTA UN loading.tsx, Y DÓNDE SOBRA
 *
 * La frontera de Suspense tiene que estar en el nivel donde el segmento
 * CAMBIA. React no vuelve a mostrar el fallback de una frontera que ya está
 * montada: durante la transición conserva el contenido anterior. Por eso este
 * archivo, que envuelve a los hijos de `(app)`, no sirve para ir de
 * `/admin/clientes` a `/admin/reportes`: el hijo de `(app)` sigue siendo
 * `admin` y la frontera nunca se remonta. Comprobado midiendo — sin
 * `admin/loading.tsx`, esa navegación tarda 470 ms en dar señal; con él, 108.
 *
 * De ahí que haya cinco y no uno, y tampoco uno por pantalla. Cada uno cubre
 * un nivel de cambio distinto, y quitando cualquiera se rompe una navegación
 * concreta:
 *
 *   (app)/loading.tsx                          admin ↔ reportes ↔ perfil
 *   (app)/admin/loading.tsx                    entre secciones del panel
 *   (app)/admin/cotizaciones/loading.tsx       listado ↔ nueva ↔ detalle
 *   (app)/admin/analiticas/[empresa]/          cambiar de empresa
 *   (app)/reportes/loading.tsx                 vista de empleado y detalles
 *
 * Los que había en clientes, reportes, usuarios, reportes/nuevo y perfil se
 * quitaron: sus navegaciones ya las cubre el padre, y cada archivo de más es
 * uno que se desincroniza.
 *
 * El contenido es el mismo para todas: ver `EsqueletoSeccion`.
 */
export { default } from "@/components/esqueleto-seccion";
