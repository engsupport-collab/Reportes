# Plan: la cotización como contenedor, numeración automática, búsqueda y rol contable

Cuatro cambios independientes. El grande es el 3 — los otros tres son acotados y
pueden hacerse en cualquier orden.

**Contexto que cambia el riesgo:** la base de producción se reconstruyó vacía el
2026-08-04 (cero cotizaciones, cero reportes). Las migraciones de datos de este
plan aplican de verdad solo sobre la base de desarrollo. Eso convierte el cambio
3, que habría sido delicado, en un cambio barato — conviene hacerlo **ahora**.

---

## 1. Numeración automática `Q2026_001`

### Qué existe hoy

`quotes.quoteNumber` es texto libre que el admin escribe a mano
(`src/components/admin/quote-form.tsx:190`), admite `null` (las creadas en campo)
y **no tiene restricción de unicidad**, a propósito: en el Excel original una
cotización con varias entregas mensuales comparte número.

### Decisión

Autogenerar al crear: `Q{año}_{consecutivo de 3 dígitos}`, contador **por año**
(en enero de 2027 vuelve a `Q2027_001`). Se asigna a **todas** las cotizaciones,
incluidas las creadas en campo por el técnico — hoy nacen sin número, y darles
uno desde el principio es justamente lo que la parte contable necesita.

**No agregar índice único.** Rompería los duplicados legítimos y la carga
histórica. El campo sigue siendo editable por el admin para corregir o registrar
números viejos.

### Requisito adicional del usuario — vista previa + edición + atomicidad

El admin debe **ver el número sugerido al abrir el formulario**, no solo al
guardar, y debe poder **sobrescribirlo** libremente (para mantener una
numeración externa o continuar una secuencia del cliente). Al mismo tiempo, la
generación real tiene que ser atómica en la base — nunca "leer y luego
insertar" desde el servidor de aplicación. Estas dos cosas parecen chocar
(¿cómo muestro un número "seguro" antes de guardarlo, si otro admin puede crear
una cotización mientras el primero todavía tiene el formulario abierto?), y la
resolución es distinguir **sugerencia** (una lectura, para UX) de
**asignación** (atómica, al guardar):

1. Al renderizar `/admin/cotizaciones/nueva`, el servidor calcula el siguiente
   número con un `SELECT` simple (no atómico — es solo para mostrar) y lo pasa
   al formulario en dos sitios: como `defaultValue` del input visible
   `quoteNumber`, y como valor de un input oculto `quoteNumberSugerido`.
2. El admin puede dejarlo tal cual o escribir otra cosa en el mismo campo
   visible — un único input, no dos.
3. Al enviar, `crearCotizacionAction` compara `formData.get("quoteNumber")`
   contra `formData.get("quoteNumberSugerido")`:
   - **Son iguales** → el admin no lo tocó (o volvió a escribir lo mismo). El
     servidor **ignora ese valor** y genera el número de verdad con la
     sentencia atómica de abajo, que puede diferir del sugerido si alguien más
     creó una cotización mientras el formulario estaba abierto — así nunca hay
     dos cotizaciones con el mismo número por esta vía.
   - **Son distintos** → el admin escribió un valor a propósito. Se inserta
     tal cual, sin pasar por el generador. Es una elección explícita; los
     duplicados intencionales siguen permitidos, como ya lo están hoy.

Esto evita la trampa obvia: prellenar el campo y confiar en que ese valor siga
siendo válido para cuando el admin por fin haga clic en guardar, minutos
después.

**La creación desde campo** (el mini-formulario del técnico) no tiene esta UI —
ahí no hay número visible que sugerir. Simplemente llama siempre al generador
atómico, sin la lógica de comparación.

### Concurrencia — la sentencia atómica

Calcular `MAX(...) + 1` en JavaScript y luego insertar es una condición de
carrera: dos cotizaciones creadas a la vez leerían el mismo máximo y las dos
intentarían guardar el siguiente número. **Tiene que resolverse en una sola
sentencia SQL**, que en SQLite corre atómica:

```sql
INSERT INTO quotes (id, quote_number, ...)
SELECT ?, 'Q2026_' || printf('%03d', COALESCE(MAX(CAST(substr(quote_number, 7) AS INTEGER)), 0) + 1), ...
FROM quotes WHERE quote_number LIKE 'Q2026_%';
```

`substr(quote_number, 7)` — contando `Q2026_` como 6 caracteres, el primer
dígito del consecutivo empieza en la posición 7 (SQLite indexa `substr` desde
1). Verificar con un caso real (`Q2026_080` → `substr(...,7)` debe dar `'080'`)
antes de confiar en el offset; es el tipo de índice que se escribe mal a la
primera.

El año (`2026`) no puede quedar fijo en la consulta — tiene que derivarse de
`new Date().getFullYear()` al construir el SQL, para que el salto a
`Q2027_001` ocurra solo con que cambie el reloj, sin ningún paso manual.

Con Drizzle esto es `db.run(sql\`...\`)` parametrizado por año y por id. Lo que
**no** vale es leer, calcular en JavaScript y escribir en dos viajes separados
— eso es exactamente la condición de carrera que hay que evitar.

### Archivos

- `src/actions/quotes.ts` — `crearCotizacionAction`: recibe `quoteNumber` +
  `quoteNumberSugerido`, decide si genera o respeta el valor explícito, e
  inserta. La creación en campo llama siempre al generador.
- `src/lib/queries/quotes.ts` — nueva función `siguienteNumeroCotizacionSugerido()`
  (el `SELECT` de vista previa) y la sentencia atómica usada por la acción.
- `src/app/(app)/admin/cotizaciones/nueva/page.tsx` — calcula la sugerencia y
  se la pasa al formulario.
- `src/components/admin/quote-form.tsx` — el input ya no está vacío al crear:
  `defaultValue={sugerido}`, más el input oculto `quoteNumberSugerido`.
- `src/lib/validation.ts:223` — `quoteNumber` sigue sin ser obligatorio (puede
  llegar vacío desde la creación en campo, y el generador atómico lo cubre).

### Verificación

Crear tres cotizaciones seguidas sin tocar el campo y confirmar `_001`, `_002`,
`_003`. Abrir el formulario y verificar que el número sugerido ya aparece antes
de enviar nada. Editarlo a mano a un valor arbitrario y confirmar que se
respeta. Crear una desde campo (técnico) y confirmar que también recibe
número. Simular la carrera: abrir dos pestañas en `/admin/cotizaciones/nueva`,
crear en una, luego crear en la otra sin refrescar — la segunda no debe repetir
el número que ya vio, porque su envío dispara el generador atómico, no el valor
que traía en pantalla. Forzar el año en la consulta (o esperar al cambio real)
para confirmar que arranca en `_001` al cambiar de año.

---

## 2. Barra de búsqueda en Reportes

### Qué existe hoy

**La consulta ya está construida.** `listarReportes` filtra por `q` con `LIKE`
sobre `projectName`, `clientName` y `purchaseOrderNo`
(`src/lib/queries/reports.ts:190-198`), y la página ya lee `params.q`
(`src/app/(app)/reportes/page.tsx:223`) — pero solo para el mensaje de "sin
resultados". **Falta únicamente el input.**

### Qué hacer

1. Agregar `like(reports.quoteNumber, patron)` a las condiciones de búsqueda. Es
   el campo que la parte contable va a usar más y hoy no se busca.
2. Poner un input de búsqueda visible en `/reportes` y `/admin/reportes`, con el
   mismo patrón `q` que ya usa `/admin/cotizaciones`
   (`src/lib/queries/quotes.ts:91-93` es la referencia).
3. Que conserve los demás filtros al enviarse, y el valor actual al recargar.

Nota: el buscador del encabezado ("Buscar reportes o ir a una sección…") es otra
cosa — navegación global. Este es un filtro persistente sobre la lista.

---

## 3. La cotización como contenedor: servicio y viáticos separados

Este es el cambio de fondo. **El objetivo es que la información interna de
viáticos no pueda llegar al cliente**, ni por PDF, ni por correo, ni por la
pantalla de firma.

### Qué existe hoy

La mitad del modelo ya sirve. `reports` tiene:

- `type` con valores `"servicio" | "viaticos"` (`src/db/schema.ts:228`)
- `quoteId` → `quotes.id` (`:248`)
- `linkedReportId` → `reports.id` (`:237`) — **este es el que sobra**

Hoy un reporte de viáticos cuelga del reporte de servicio vía `linkedReportId`.
Por eso `listarViaticosEnlazadosA(reportId)` (`reports.ts:506`) los trae dentro
de la ficha del servicio, y de ahí se filtran al cliente.

Lo bueno: **los PDF ya están separados** — existe `generarReporteViaticoPdf`
aparte de la generación normal (`src/lib/pdf.ts:370`). No hay que partir nada ahí.

### El cambio

Los viáticos dejan de colgar del reporte de servicio y pasan a colgar de la
cotización. Los dos reportes se vuelven hermanos bajo el mismo `quoteId`, sin
relación entre sí.

```
Antes:   Cotización ──► Reporte servicio ──► Reporte viáticos
Después: Cotización ──┬► Reporte servicio
                      └► Reporte viáticos     (independientes)
```

### Pasos

**a) Migración.** Poblar `quoteId` de cada reporte de viáticos con el `quoteId`
de su reporte padre, y luego anular `linkedReportId`:

```sql
UPDATE reports SET quote_id = (
  SELECT p.quote_id FROM reports p WHERE p.id = reports.linked_report_id
) WHERE type = 'viaticos' AND linked_report_id IS NOT NULL;

UPDATE reports SET linked_report_id = NULL WHERE type = 'viaticos';
```

**Cuidado con la trampa ya conocida en este repo**: dentro de un subselect
correlacionado, `${reports.id}` sin calificar se resuelve contra la tabla
interna. Escribir los nombres calificados literalmente. Ver el comentario en
`src/lib/queries/reports.ts` sobre `conteoAdjuntos`.

Dejar la columna `linked_report_id` en la tabla por ahora (quitarla exige
reconstruir la tabla entera en SQLite, y no estorba). Marcarla como obsoleta en
el comentario del esquema.

**b) Consultas.** `listarViaticosEnlazadosA(reportId)` → `listarViaticosDeCotizacion(quoteId)`.
Revisar también `src/lib/queries/viaticos.ts:69` y
`src/actions/viaticos.ts:34` (`revalidarViatico` revalida la ruta del padre —
ahora debe revalidar la de la cotización).

**c) Ficha del reporte de servicio.** Quitar por completo la sección de viáticos.
No dejar ni el total: el requisito es que el reporte de servicio muestre
*únicamente* lo del servicio.

**d) Ficha de la cotización.** Es el nuevo centro de trabajo. Debe mostrar los
dos reportes y permitir entrar a cada uno. Si falta alguno, ofrecer crearlo.

**e) Creación.** Un reporte de viáticos se crea eligiendo cotización, igual que
uno de servicio — ya no eligiendo un reporte padre. Revisar
`src/actions/reports.ts:164-207`, que hoy resuelve `linkedReportId`.

**f) Listado `/reportes`.** Hoy filtra `eq(reports.type, "servicio")`
(`reports.ts:153`), así que los viáticos son invisibles ahí. Agregar un filtro de
tipo para que la parte contable pueda listarlos, manteniendo servicio como valor
por defecto.

**g) Lo que protege al cliente — verificar explícitamente.** Confirmar que ni el
PDF de servicio, ni el correo, ni la pantalla de firma tocan datos de viáticos.
Este es el punto del cambio; no darlo por hecho porque el código "parezca" bien.

### Verificación

1. Crear una cotización, y bajo ella un reporte de servicio y uno de viáticos.
2. Abrir el de servicio: **no debe aparecer nada de viáticos**, ni montos ni conteos.
3. Descargar su PDF y **abrirlo**: no debe contener gastos.
4. Abrir el de viáticos: solo gastos.
5. Firmar el de servicio y confirmar que el flujo de firma no expone viáticos.
6. Desde la cotización, llegar a los dos reportes.
7. Borrar el de servicio y confirmar que el de viáticos sobrevive — ahora son
   independientes, y esto lo demuestra.

---

## 4. Rol "contable"

**Corrección de alcance** (según precisión del usuario): el rol "contable"
**no nace sin permisos** — nace con **exactamente los mismos permisos que
"empleado"**, como implementación temporal. Cuando más adelante se diseñe su
capa de permisos propia (acceso a gestión financiera y viáticos, nada más), se
diferenciará de empleado; hasta entonces se comporta como uno.

Esto invierte el riesgo que había anotado antes: el peligro **no** es que
contable herede permisos de empleado por descarte — **eso es lo que se quiere**.
El peligro real es el opuesto: cualquier comprobación que hoy compare
`role === "empleado"` en positivo (en vez de `role !== "admin"`) va a **excluir**
al contable de algo que sí debería tener, porque no hay ninguna razón para que
lo excluya todavía.

- `src/lib/roles.ts:10` → `USER_ROLES = ["admin", "empleado", "contable"]`
- **No requiere migración**: la columna es `text` con `enum`, que SQLite no
  fuerza; el enum es una restricción de TypeScript

### Lo que rompe si solo se toca `roles.ts` — hay que arreglarlo, no solo revisarlo

Revisar el código encontró puntos que **no son un riesgo a vigilar, son un
bug garantizado** si se agrega el valor al enum sin tocarlos:

**a) `src/lib/session.ts:92` — el más grave. Rompe el login, no los permisos.**
La verificación del JWT es un allowlist literal:
```ts
(payload.role !== "admin" && payload.role !== "empleado")
```
Un usuario contable con sesión válida pasaría por aquí y **la función
devolvería `null`**, como si el token estuviera corrompido — la cuenta quedaría
en un bucle de redirección a `/login` sin poder entrar nunca, con una sesión
técnicamente correcta. Cambiar a comparar contra `USER_ROLES` (el arreglo, no
literales sueltos) para que agregar un rol no vuelva a exigir tocar este
archivo.

**b) `src/lib/auth-guard.ts` — `UserConAcceso` es una unión discriminada de solo
dos ramas** (`"admin"` | `"empleado"`), y `requireAccesoReportes()`
(`:195`) fuerza `role: "empleado"` a cualquiera que no sea admin. Dado que hoy
contable = empleado en permisos, la forma más simple y correcta es **dejar esta
función tal cual** — un contable cae en la rama "empleado" y hereda su
`empresaActiva` obligatoria, que es justo el comportamiento correcto porque
contable también necesita empresa elegida. Pero hay que dejarlo **explícito en
comentario**, no como una coincidencia silenciosa: cuando contable tenga
permisos propios, este colapso deja de ser válido y alguien tiene que acordarse
de separar la rama.

**c) Chequeos positivos `role === "empleado"` que hoy excluirían a contable de
UI que sí necesita:**
- `src/components/admin/crear-usuario-form.tsx:136` — el bloque de "empresas
  con acceso" solo se muestra si `role === "empleado"`. Un contable creado con
  este formulario no podría asignársele empresa. Cambiar a
  `role !== "admin"`.
- `src/components/admin/users-table.tsx:159` — mismo patrón, mismo fix, para
  mostrarle al admin los toggles de empresa de un contable.
- `src/lib/validation.ts:332` y `src/actions/users.ts:50` — la regla "si el rol
  es empleado, exige al menos una empresa" debe ser "si el rol no es admin,
  exige al menos una empresa" — de lo contrario se podría crear un contable sin
  ninguna empresa asignada, y quedaría sin poder ver nada.
- `src/lib/queries/users.ts:12` — el tipo `role: "admin" | "empleado"` debe
  ampliarse a los tres valores; si no, TypeScript ya habría marcado error en
  cuanto el rol real viniera de la base como `"contable"`.

**d) Traducciones y visualización.** `side-nav.tsx:129`, `perfil/page.tsx:71` y
`users-table.tsx:144` traducen el rol con un `? :` binario
(`role === "admin" ? administrador : empleado`) — un contable se mostraría
como "Empleado" en toda la interfaz. Cambiar a un mapa `{ admin, empleado,
contable }` indexado por rol, y agregar la clave `contable` en
`messages/{es,en,pt}.json`.

- `rutaInicio()` en `roles.ts` — el contable entra por `/reportes`, igual que
  empleado, consistente con que hereda su comportamiento.

### Verificación

Crear un usuario contable de prueba con una empresa asignada. Iniciar sesión
con él **hasta el final** (no solo comprobar que el formulario lo permite) y
confirmar que no cae en un bucle de redirección — esto es lo que
`session.ts:92` rompería si no se corrige. Confirmar que puede ver y crear
reportes de su empresa igual que un empleado. Confirmar que **no** entra a
`/admin` ni a ninguna de sus rutas escribiendo la URL a mano. Confirmar que en
`/admin/usuarios` su fila muestra "Contable", no "Empleado".

### Lo que viene después (no ahora)

El contable marcará si un proyecto fue pagado. Eso será un campo en `quotes`
(`paid` + fecha + quién), no en los reportes — la cotización es el contenedor del
trabajo, y el cobro es del trabajo, no de cada documento. Ese es también el
momento de separar la rama de `UserConAcceso` mencionada en (b).

---

## Orden sugerido

1. **Rol contable** — pequeño, aislado, sin dependencias
2. **Búsqueda** — casi todo hecho, alto valor inmediato
3. **Numeración** — acotado, ojo con la atomicidad
4. **Cotización como contenedor** — el grande; hacerlo mientras producción está vacía

## Antes de dar por terminado

`npx tsc --noEmit`, `npx eslint`, y recorrido real en el navegador. Después:
commit, push a `main`, `npm run db:migrate -- --prod`, y verificar en
https://reportes-eight.vercel.app antes de avisar.
