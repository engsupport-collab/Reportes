# Prácticas de trabajo

Reglas que salieron de problemas reales de este proyecto, con la evidencia que
las justifica. No son estilo: cada una está aquí porque ignorarla ya costó
tiempo una vez.

---

## 1. Medir antes de afirmar

Cuando alguien dice "esto se volvió lento", la respuesta no es una hipótesis:
es un A/B. Se construye el commit anterior, se mide con el mismo script en el
mismo equipo contra la misma base, y se comparan números.

Así se descartó que la numeración de cotizaciones hubiera causado la latencia:
el commit anterior a todo el trabajo del día dio 420/402/533/400 ms — idéntico
al de después. El remontaje del marco llevaba ahí desde siempre.

**Corolario:** una estimación no es una medición. Estimé "40–70 ms de ahorro"
para la fase 1 y el reloj no se movió; el ahorro real estaba en otro sitio.
Decirlo en cuanto se sabe vale más que defender la estimación.

### Trampas de medición que ya mordieron

| Trampa | Síntoma | Qué hacer |
|---|---|---|
| Servidor viejo en el puerto | `npm run start` falla en silencio y mides el build anterior | Matar el proceso del puerto 3000 antes de cada medición, y comprobar que un cambio deliberado se nota |
| Selector que vive en el marco | `waitForSelector("h2, h1, form")` casa al instante: el buscador de la barra superior siempre está | Esperar a algo exclusivo del contenido, o a que desaparezca el esqueleto |
| `?` en globs de Playwright | `page.route("**/ruta?*")` no casa con `?_rsc=…` — es comodín, no literal | Usar un predicado: `page.route((url) => url.pathname === ruta, …)` |
| Retraso de red para ver un esqueleto | Si retienes la respuesta entera, Next no tiene nada que transmitir y no hay fallback | Retrasar **dentro** de la página (`await new Promise(...)` en el componente) |
| `MutationObserver` sobre un nodo reemplazado | Dice "no se tocó" justo cuando el subárbol se destruyó entero | Comparar identidad del nodo (`n === guardado`), no mutaciones |
| Medir justo tras desplegar | Arranque en frío de la función infla la primera visita | Separar frío de caliente, y decir cuál es cuál |

---

## 2. Dónde va un `loading.tsx`

La frontera de Suspense tiene que estar **en el nivel donde el segmento
cambia**. React no vuelve a mostrar el fallback de una frontera ya montada:
durante la transición conserva el contenido anterior.

Consecuencia: uno solo arriba no sirve, y uno por pantalla sobra. Los cinco que
hay están cada uno justificado por la navegación que se rompe al quitarlo (ver
`src/app/(app)/loading.tsx`, que lleva la lista y los números).

Al añadir una sección, la pregunta es: *¿qué segmento cambia al entrar en ella
desde donde se entra normalmente?* Ahí va el archivo — o ya está cubierto.

---

## 3. El marco en el layout, los permisos en cada página

`AppShell` vive en `src/app/(app)/layout.tsx`, por encima del segmento que
cambia. Va en `(app)` y no en `admin/` porque el rail lleva indistintamente a
`admin/…` y a `reportes/nuevo`: el punto donde esos módulos comparten
navegación está un nivel por encima de los dos.

**Los guards NO se movieron al layout.** Cada página conserva su
`requireAdmin()` / `requireAccesoReportes()`. Un layout no es una barrera
fiable: Next puede reutilizarlo entre navegaciones sin volver a ejecutarlo. La
autorización se comprueba donde se usa el dato.

`getCurrentUser` está envuelta en el `cache()` de React para que layout y
página compartan una lectura por petición. Sin eso, la migración habría
duplicado las consultas de cada pantalla.

---

## 4. Un número de documento no se deduce de la tabla

Cualquier regla que mire las filas existentes —`MAX + 1`, `COUNT + 1`, el
primer hueco libre— da una respuesta distinta según lo que haya en la tabla en
ese instante. Borrar una fila libera su número y dos documentos distintos
pueden acabar llamándose igual.

El número sale de `quote_sequences`, un contador por año que solo avanza. Se
reserva con `INSERT … ON CONFLICT DO UPDATE … RETURNING` dentro de un `batch`
de libSQL, que es una transacción en un solo viaje.

**`batch` y no transacción interactiva:** cada transacción interactiva mantiene
abierto un stream contra Turso, y cien creaciones simultáneas agotan el límite
(falla con `ECONNRESET`). Con `batch`, las cien salen sin un error.

**La unicidad vive en la base**, no en el código: dos admins escribiendo el
mismo número a la vez pasan los dos por la validación de la aplicación —cada
uno mira un instante en el que el otro no ha guardado— y solo el índice
`UNIQUE` los separa. El rechazo se traduce a un mensaje legible, no a una
pantalla de error.

---

## 5. Migraciones

- **Drizzle mete TODAS las migraciones pendientes en UNA transacción.** Una
  migración en dos tiempos (columna nullable → backfill → NOT NULL) no se puede
  aplicar de una sola pasada. Hay que aplicar la primera, hacer el backfill, y
  luego la segunda.
- SQLite no aplica claves foráneas con `ALTER TABLE ADD COLUMN`: hace falta
  reconstruir la tabla.
- Un índice `UNIQUE` sobre una columna nullable admite tantos nulos como haga
  falta. No hay que elegir entre las dos cosas.
- **Ritual:** respaldo a JSON en el scratchpad → migrar → verificar conteos y
  semántica → limpiar scripts temporales.

---

## 6. Ritual de entrega

Una funcionalidad no está hecha hasta que se ve funcionando en producción.

1. `npx tsc --noEmit` y `npx eslint .` — borrar `tsconfig.tsbuildinfo` antes si
   se tocaron los `messages/*.json`, o `tsc` reporta claves obsoletas.
2. `npm run build` — que la tabla de rutas no cambie sin querer.
3. Recorrido en el navegador con Playwright, contra el build de producción
   local. Los scripts van **fuera** del proyecto y se ejecutan con
   `npx -y -p playwright node <ruta>`.
4. Commit, push a `main`.
5. Migrar producción si cambió el esquema.
6. `npx vercel --prod --yes --scope engsupport`, y comprobar `● Ready`.
7. Verificar en https://reportes-eight.vercel.app/ y **limpiar los datos de
   prueba** de la base real.

Comprobar en producción cuesta consumir números de cotización: la secuencia no
retrocede. Es el precio correcto, pero conviene avisarlo.

---

## 7. Esta versión de Next no es la conocida

Antes de escribir código de framework, leer `node_modules/next/dist/docs/`. Lo
que ya se aprendió leyendo:

- La documentación describe literalmente el síntoma de la navegación sin
  esqueleto: *"the old page stays visible until the server finishes rendering,
  making the navigation feel unresponsive"*.
- Existe `unstable_instant` para navegación instantánea de verdad, **pero exige
  `cacheComponents: true`**, que cambia la semántica de caché de toda la
  aplicación. Esta app es enteramente dinámica por usuario (sesión en cookie,
  datos por empresa), así que ese camino es una decisión aparte.

---

## 8. Verificar de verdad, no de forma

- Un PDF generado con `pdf-lib` va comprimido (FlateDecode) y con las cadenas
  en hexadecimal. Buscar texto en los bytes crudos **siempre** da "no está",
  incluso en el PDF que sí lo contiene. Hay que descomprimir y decodificar.
- Una comprobación que solo puede salir bien no comprueba nada. Al verificar
  que el PDF del cliente no lleva los viáticos, hay que comprobar **también**
  que el PDF de viáticos sí los lleva. El contraste es lo que descarta el falso
  positivo.
- Registrar el manejador de diálogos **antes** del clic: Playwright descarta un
  `confirm()` sin manejador y la acción se cancela en silencio.
