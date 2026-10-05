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

**Lo mismo para lo que "no existe".** Afirmé dos veces que un reporte no tenía
tope de archivos; había uno de 10, a un `grep` de distancia. Antes de decir
que algo no está en el código, se busca.

### Trampas de medición que ya mordieron

| Trampa | Síntoma | Qué hacer |
|---|---|---|
| Servidor viejo en el puerto | `npm run start` falla en silencio y mides el build anterior | Matar el proceso del puerto 3000 antes de cada medición, y comprobar que un cambio deliberado se nota |
| Selector que vive en el marco | `waitForSelector("h2, h1, form")` casa al instante: el buscador de la barra superior siempre está | Esperar a algo exclusivo del contenido, o a que desaparezca el esqueleto |
| `?` en globs de Playwright | `page.route("**/ruta?*")` no casa con `?_rsc=…` — es comodín, no literal | Usar un predicado: `page.route((url) => url.pathname === ruta, …)` |
| Retraso de red para ver un esqueleto | Si retienes la respuesta entera, Next no tiene nada que transmitir y no hay fallback | Retrasar **dentro** de la página (`await new Promise(...)` en el componente) |
| `MutationObserver` sobre un nodo reemplazado | Dice "no se tocó" justo cuando el subárbol se destruyó entero | Comparar identidad del nodo (`n === guardado`), no mutaciones |
| Medir justo tras desplegar | Arranque en frío de la función infla la primera visita | Separar frío de caliente, y decir cuál es cuál |
| Escribir en un formulario recién cargado | La hidratación devuelve el campo a su valor original y lo tecleado cae en medio del texto viejo | `waitUntil: "networkidle"`, y comprobar que el campo quedó vacío antes de escribir |
| WebKit contra el build local | El build de producción marca la cookie de sesión como `Secure`, y WebKit no la guarda sobre `http://localhost`: el login "funciona" y vuelve al login | Poner la cookie a mano en el contexto, sin `secure`. Chromium no avisa de esto: sí la guarda |

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

**Desde la entrega (2026-09-07) producción tiene datos reales del cliente, y un
push a `main` es un despliegue:** Vercel lo publica solo un par de minutos
después. No hay un paso manual que sirva de freno.

1. `npx tsc --noEmit` y `npx eslint .` — borrar `tsconfig.tsbuildinfo` antes si
   se tocaron los `messages/*.json`, o `tsc` reporta claves obsoletas.
2. `npm run build` — que la tabla de rutas no cambie sin querer.
3. Recorrido en el navegador con Playwright, contra el build de producción
   local. Los scripts van **fuera** del proyecto y se ejecutan con
   `npx -y -p playwright node <ruta>`.
4. Commit, push a `main`.
5. Migrar producción si cambió el esquema.
6. Comprobar que el despliegue terminó bien. Lo anota `vercel[bot]` en el
   propio commit: `gh api repos/engsupport-collab/Reportes/commits/<sha>/status`.
7. Verificar en https://reportes.engsupports.com.co **sin crear cuentas ni
   datos de prueba**. Lo que necesite datos se prueba en desarrollo o en el
   PostgreSQL de CI; contra producción, solo lectura — por ejemplo, armar en
   local el PDF de un reporte real con el código nuevo.

Por eso ya no se crean cotizaciones de prueba ahí: la secuencia no retrocede, y
el número gastado sería uno del cliente.

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

---

## 9. El texto de una prueba no es el texto de un formulario

El primer reporte real (2026-10-04) no se pudo descargar ni enviar por correo.
Su detalle tenía saltos de línea; todos los PDF de prueba se habían generado
con texto de una sola línea escrito en el código.

- Un `<textarea>` manda los saltos de línea como CR+LF. Las fuentes estándar
  de `pdf-lib` solo saben dibujar 218 caracteres, y con cualquier otro —el CR,
  un tabulador, un emoji— no dejan un hueco: lanzan, y no hay documento.
- Todo texto que va a un PDF pasa por `src/lib/pdf-texto.ts`. Nadie llama a
  `drawText` ni a `widthOfTextAtSize` directamente; `npm run test:pdf` lo
  comprueba, y de paso prueba los 1,1 millones de caracteres de Unicode.
- El cliente usa solo celulares. Un dato de prueba realista es lo que sale de
  un teléfono: varios renglones, comillas tipográficas, emojis, nombres que no
  caben en un renglón, fotos de varios megas con la orientación en EXIF. Un PDF
  generado con "aaa" no prueba nada.
- Un carácter especial no se escribe en el código: se pone por su número
  (`String.fromCodePoint(0x202f)`). Varios son invisibles o idénticos a otros,
  y un separador de línea Unicode dentro de una expresión regular ni compila.

---

## 10. Lo que el teléfono manda, y lo que sale hacia afuera

Del mismo día. Subir fotos desde un iPhone fallaba de cuatro formas distintas,
y ninguna se veía en un navegador de escritorio.

- **Lo que devuelve el navegador se comprueba, no se supone.** Safari no sabe
  escribir WebP: `canvas.toBlob(…, "image/webp")` devuelve un PNG sin avisar.
  El código lo etiquetaba como WebP y el servidor lo rechazaba. Se mira
  `blob.type`; y en el servidor una foto entra por lo que es
  (`tipoRealDeImagen`), no por cómo se llama.
- **Un límite se mide sobre lo que viaja.** El tope de 4 MB se comparaba con la
  foto original, antes de reducirla: casi todas lo pasaban.
- **Un límite se pone donde está de verdad.** El tope no es "cuántas fotos":
  es cuánto pesa una petición (4,5 MB en Vercel, de entrada y de salida). Así
  que cada archivo sube en su propia petición, y el peso del PDF se reparte
  entre sus fotos (`pdf-adjuntos.ts`) en vez de limitar cuántas caben.
- **Una petición que no llega no devuelve un error: lanza.** Y dentro de una
  transición, lo que nadie atrapa tumba la página. Toda llamada a una acción
  del servidor desde un botón va con su `catch` y dice qué pasó junto al
  botón. Si la acción puede redirigir, el `catch` empieza por
  `unstable_rethrow(error)`. Las pantallas `error.tsx` son la red, no el plan.
- **Un teléfono no gira los píxeles de una foto**: anota el giro en EXIF. Lo
  que la incruste tal cual (un PDF) la muestra acostada.
- **Lo que sale hacia afuera deja rastro.** El correo al cliente no dejaba
  ninguno: no se podía saber si se intentó, a quién ni por qué falló. Cada
  intento es ahora un evento del reporte, con su causa.
- **Probar el correo sin mandarlo.** `npm run test:correo` reemplaza `fetch`.
  Para el recorrido en el navegador, un doble dentro del servidor local
  (`NODE_OPTIONS="--require doble.cjs" npm start`) que conteste por Google:
  así el único correo real es el que se decide mandar.
- **Las pruebas de navegador van en WebKit y en Chromium, con pantalla de
  teléfono**, y con archivos como los de un teléfono: una foto de más de 4 MB
  tomada de lado, un PNG, un WebP, varios a la vez, y la señal cortada a mitad.
