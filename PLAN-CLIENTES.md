# Plan: módulo de Clientes

## Contexto

Hoy `quotes.clientName` es texto libre — cada admin lo escribe a mano al crear
una cotización, y el técnico también lo escribe a mano en la creación mínima
desde campo (`CrearCotizacionCampo`, dentro de `quote-selector.tsx`). Es
exactamente el mismo problema que resolvió el módulo de cotizaciones con
`projectName`: el mismo cliente termina escrito de formas distintas.

**Los reportes NO necesitan tocarse.** Un reporte ya no tiene un campo de
cliente independiente — se crea eligiendo una cotización (`QuoteSelector`) y
hereda `clientName` como copia inmutable en el momento de crearse
(`src/actions/reports.ts`), igual que hereda `projectName` y `purchaseOrderNo`.
Cuando el enunciado dice "el técnico podrá seleccionar un cliente al crear un
reporte", el punto real donde eso ocurre es la creación mínima de cotización
desde campo — el único lugar donde hoy un técnico escribe un nombre de cliente
a mano.

**Decisión de alcance, confirmada con el usuario:** el catálogo de clientes es
**por empresa**, no global. Un cliente pertenece a LLC o a SAS, igual que ya
pertenecen las cotizaciones — son dos entidades legales en países distintos, y
todo lo demás en el sistema ya está separado así.

## Estado real de los datos (verificado, no supuesto)

Producción tiene hoy **1 sola cotización** (`"test 1"`, cliente `"01"`, un
registro de prueba) y **0 reportes**. Esto simplifica mucho la migración: no
hay que diseñar para un volumen real de datos históricos, solo para no perder
esa fila suelta.

## Modelo de datos

### Tabla nueva `clients`

```
id          text PK (uuid)
company_id  text NOT NULL FK -> companies.id ON DELETE restrict
name        text NOT NULL
is_active   integer NOT NULL DEFAULT true
created_by  text NOT NULL FK -> users.id
created_at / updated_at

índice: (company_id, is_active)
```

Sin restricción de unicidad en `(company_id, name)`. La razón de este módulo
es evitar duplicados accidentales por texto libre — una vez que crear una
cotización obliga a *elegir* de una lista en vez de escribir, ese problema ya
está resuelto en el punto de origen. Forzar unicidad en la base además
castigaría variantes legítimas del mismo nombre legal (con/sin sufijo
societario, mayúsculas). Si en el futuro hace falta advertir de un nombre
parecido al crear, es una comprobación en la interfaz, no una restricción de
la base — igual que ya se decidió para `quotes.quoteNumber`.

**Sin borrado real**, tal como pide el enunciado ("desactivar sin eliminar su
historial") — solo `is_active`, exactamente el mismo patrón que ya tiene
`companies.isActive` y `users.isActive`. Un cliente desactivado sigue
existiendo para las cotizaciones que ya lo usan (no se puede seleccionar en
cotizaciones nuevas, pero las viejas lo siguen mostrando via join — ver
"Cotizaciones existentes con un cliente desactivado" más abajo).

### Cambio en `quotes`

`clientName` (texto libre) se reemplaza por `clientId` (referencia):

```
client_id  text NOT NULL FK -> clients.id ON DELETE restrict
```

`ON DELETE restrict` porque no hay borrado real de clientes — es solo
defensivo. Se referencia por FK y **no** se copia el nombre en `quotes`: a
diferencia de un reporte (que es una constancia que puede acabar firmada por
el cliente y por eso nunca cambia), una cotización es un documento de trabajo
interno, y si el admin corrige el nombre del cliente en el catálogo, tiene
sentido que esa corrección se vea en todas las cotizaciones que lo usan — es
el mismo criterio que ya rige `companyId` en esta misma tabla, que tampoco
copia el nombre de la empresa.

**Cotizaciones existentes con un cliente desactivado**: si se desactiva un
cliente que ya tiene cotizaciones, esas cotizaciones lo siguen mostrando sin
problema (el join no distingue activo/inactivo) — desactivar solo lo saca de
la lista de selección para cotizaciones *nuevas*.

### `reports` no cambia

`reports.clientName` sigue siendo texto — su propia copia, tomada de
`clients.name` (vía el join en `quotes`) en el momento de crear el reporte,
exactamente como ya se copian hoy `projectName` y `purchaseOrderNo` desde la
cotización. Ningún archivo de reportes necesita saber que `clients` existe.

## Migración

Con solo 1 fila real de por medio, el camino más simple y más seguro es:

1. `CREATE TABLE clients` (declarativa, vía `db:generate`).
2. `ALTER TABLE quotes ADD COLUMN client_id` — **nullable** al principio, a
   propósito: SQLite no deja añadir una columna `NOT NULL` sin `DEFAULT` sobre
   una tabla con filas existentes, y aquí sí hay una fila existente.
3. **Backfill con un script uno-a-uno** (`scripts/_migrar-clientes.ts`, patrón
   ya usado en esta sesión para sembrar el admin de producción — vive fuera
   del historial de migraciones de Drizzle, se corre una vez y se borra):
   para cada combinación distinta de `(company_id, client_name)` en `quotes`,
   inserta una fila en `clients` y actualiza `quotes.client_id` de las filas
   que compartían ese nombre. Con 1 fila en producción esto es casi trivial,
   pero el script debe escribirse para manejar más (por si en dev hay más
   cotizaciones sueltas, o si producción gana filas reales entre que se
   escribe este plan y se ejecuta).
4. **Verificar antes de continuar**: `SELECT COUNT(*) FROM quotes WHERE
   client_id IS NULL` debe dar 0.
5. Recién ahí, una segunda migración pone `client_id NOT NULL` y elimina
   `client_name`. **Verificar con `db:generate` qué SQL produce Drizzle-kit
   antes de confiar en que funciona sin reconstruir la tabla entera** — esta
   sesión ya se topó dos veces con límites reales de SQLite en este mismo
   repo (agregar una constraint FK vía `ADD COLUMN` no la aplica de verdad;
   cambiar un `DEFAULT` sí lo soporta Turso sin reconstruir). No asumir cuál
   de los dos casos es este sin comprobarlo primero.

Backup del estado de `quotes` a un JSON en el scratchpad antes de tocar
producción, mismo ritual que ya se siguió para las migraciones anteriores de
esta semana.

## Permisos

- **Admin**: crear, editar, activar/desactivar, listar clientes de cualquier
  empresa. Sin este módulo no hay otra forma de dar de alta un cliente.
- **Empleado y contable**: sin acceso a `/admin/clientes` (mismo
  `requireAdmin()` que protege `/admin/usuarios`). Su única interacción con el
  catálogo es el selector de cliente dentro del formulario de creación de
  cotización mínima en campo — pueden **elegir**, nunca crear ni editar.

No hay nada nuevo que decidir en permisos: es el mismo guard que ya usa
`/admin/usuarios`, y el técnico ya no podía crear ni editar cotizaciones
completas — solo se le agrega un selector donde antes había un campo de texto.

## Módulo de administración

Calca la estructura de `/admin/usuarios` (mismo patrón de dos secciones en una
sola página: alta arriba, listado abajo — no hace falta una ruta `/nueva`
aparte, dado lo simple del formulario: solo empresa y nombre).

- **`src/lib/queries/clients.ts`** (nuevo)
  - `listarClientes(companyId?: string)` — para el panel del admin, con
    nombre de empresa si no se filtra.
  - `listarClientesActivos(companyId)` — para el selector del formulario de
    cotización, igual en espíritu a `listarCotizacionesActivas`.
- **`src/actions/clients.ts`** (nuevo)
  - `crearClienteAction` — requiere admin, valida empresa + nombre.
  - `actualizarClienteAction` — requiere admin. Editar el nombre no toca
    cotizaciones existentes (no hay copia que actualizar — ver arriba).
  - `alternarActivoClienteAction` — mismo patrón que
    `alternarActivoAction` en `src/actions/users.ts:136`.
- **`src/app/(app)/admin/clientes/page.tsx`** (nuevo) — calca
  `admin/usuarios/page.tsx`: `requireAdmin()`, `listarClientes()`,
  `listarEmpresas()` (para el selector de empresa del formulario de alta),
  y renderiza `CrearClienteForm` + `ClientsTable`.
- **`src/components/admin/crear-cliente-form.tsx`** (nuevo) — dos campos:
  radio de empresa (mismo patrón que `QuoteForm`, líneas 86-110) y nombre.
- **`src/components/admin/clients-table.tsx`** (nuevo) — calca
  `users-table.tsx`: nombre, empresa, badge activo/inactivo, botón
  activar/desactivar.

## Selector de cliente

### En el alta de cotización del admin (`quote-form.tsx`)

El campo de texto libre `clientName` (líneas 163-179 hoy) se reemplaza por un
`<select>` poblado con `listarClientesActivos(companyId)`. Como el formulario
ya sube `companyId` a estado para resolver la moneda (línea 79,
`setCompanyId`), la lista de clientes puede refrescarse con el mismo cambio de
empresa — sin esa lista, cambiar de empresa dejaría clientes de la otra
empresa seleccionables por error.

Si la empresa elegida no tiene clientes activos todavía, mostrar un aviso con
enlace a `/admin/clientes` en vez de un selector vacío — el admin no debería
tener que adivinar que primero tiene que ir a otra pantalla.

**Al editar una cotización** (`actualizarCotizacionAction`), el selector
también reemplaza el texto, filtrado por la empresa ya fija de esa cotización.

### En la creación mínima desde campo (`quote-selector.tsx`, `CrearCotizacionCampo`)

El input de texto `clientName` (líneas 93-104) se reemplaza por un `<select>`
con los clientes activos de `companyId` (la prop que el componente ya recibe).
El técnico **solo elige** — no hay opción de "crear cliente" aquí, a
diferencia de cómo sí puede crear una cotización mínima. Si no hay clientes
activos para esa empresa, el técnico queda bloqueado en ese paso con un aviso
de que necesita que un admin registre al cliente primero — es la consecuencia
directa de que "el técnico no podrá crear ni modificar clientes".

`crearCotizacionCampoAction` cambia de recibir `clientName` a recibir
`clientId`, y debe **revalidar que el cliente pertenece a la empresa
correcta** antes de insertar — mismo patrón que ya usa
`obtenerCotizacionActivaDeEmpresa` para cotizaciones: un id de cliente
manipulado en el formulario no debe poder colar una cotización con el cliente
de otra empresa.

## Validación

`src/lib/validation.ts`:
- `cotizacionSchema`: `clientName: z.string()...` → `clientId: z.string().uuid(...)`.
- `cotizacionCampoSchema`: mismo cambio.
- Esquemas nuevos `clienteSchema(t)` para alta/edición, siguiendo el patrón de
  fábrica ya establecido (recibe el traductor).

## Navegación

`src/components/app-shell.tsx`, función `navPara()` — la entrada nueva va
**justo después de `/admin/usuarios`** (línea 48, es hoy el último ítem del
nav del admin), tal como pide el enunciado ("debajo del módulo Users"):

```ts
{ href: "/admin/usuarios", label: t("usuarios"), icono: "usuarios" },
{ href: "/admin/clientes", label: t("clientes"), icono: "clientes" },
```

Ícono nuevo `IconClientes` en `src/components/nav-icons.tsx` (mismo patrón que
los demás `Icon*`), registrado en el mapa `ICONOS` de `side-nav.tsx:28`.

## Traducciones

Namespace nuevo `clientes` (o reutilizar la forma de `usuarios`) en
`messages/{es,en,pt}.json`: título, formulario de alta, tabla, estados
activo/inactivo, mensajes de validación (`eligeCliente`, `clienteInvalido`).
Clave nueva `nav.clientes`.

## Archivos

**Nuevos**
- `src/lib/queries/clients.ts`
- `src/actions/clients.ts`
- `src/app/(app)/admin/clientes/page.tsx`
- `src/components/admin/crear-cliente-form.tsx`
- `src/components/admin/clients-table.tsx`
- `scripts/_migrar-clientes.ts` (temporal, se borra tras usarlo en dev y prod)

**Modificados**
- `src/db/schema.ts` — tabla `clients`, `quotes.clientId` reemplaza `clientName`
- `src/lib/validation.ts` — `cotizacionSchema`, `cotizacionCampoSchema`, `clienteSchema`
- `src/actions/quotes.ts` — `crearCotizacionAction`, `actualizarCotizacionAction`,
  `crearCotizacionCampoAction` reciben `clientId` en vez de `clientName`
- `src/lib/queries/quotes.ts` — todo lo que hoy selecciona `quotes.clientName`
  pasa a hacer join con `clients` y seleccionar `clients.name`
- `src/components/admin/quote-form.tsx` — selector en vez de input de texto
- `src/components/reports/quote-selector.tsx` — `CrearCotizacionCampo` con
  selector en vez de input de texto
- `src/components/app-shell.tsx`, `src/components/nav-icons.tsx`, `side-nav.tsx`
- `messages/{es,en,pt}.json`

**Sin cambios, a propósito** (confirmar en verificación que efectivamente no
hace falta tocarlos): `src/actions/reports.ts`, `src/lib/pdf.ts`,
`src/lib/queries/analytics.ts`, `src/components/reports/report-list.tsx` — todos
leen `reports.clientName`, que sigue siendo texto copiado, no una referencia.

## Verificación

1. Como admin: crear un cliente en LLC, otro en SAS. Confirmar que el listado
   los separa correctamente.
2. Crear una cotización en LLC: el selector debe mostrar solo clientes de LLC.
   Cambiar la empresa elegida en el mismo formulario a SAS y confirmar que la
   lista de clientes cambia también (no se queda pegada a la de LLC) — el
   mismo bug que ya se probó explícitamente para el selector de cotizaciones
   en la sesión donde se construyó ese módulo.
3. Desactivar un cliente con una cotización existente: la cotización vieja
   sigue mostrando su nombre; no aparece más en el selector de cotizaciones
   nuevas.
4. Como técnico: usar "No encuentro la cotización" y confirmar que el selector
   de cliente ahí solo ofrece clientes activos de su empresa, sin ninguna
   opción de crear uno.
5. Empresa sin clientes activos: confirmar el aviso (no un selector vacío) en
   los dos formularios.
6. Aislamiento: intentar enviar el id de un cliente de otra empresa
   manipulando el formulario de creación en campo; el servidor debe
   rechazarlo.
7. Permisos: como empleado o contable, entrar a mano a `/admin/clientes` — debe
   rechazarse en el servidor.
8. Reportes: crear un reporte desde una cotización y confirmar que su
   `clientName` copiado sigue funcionando en pantalla y en el PDF, sin haber
   tocado ningún archivo de reportes.
9. Migración: contar cotizaciones con `client_id NULL` antes y después del
   backfill (debe llegar a 0), y confirmar que la única cotización real de
   producción ("test 1" / cliente "01") terminó con un cliente válido.

## Fuera de alcance (confirmado en el enunciado)

- Permisos del rol contable sobre este módulo — ninguno todavía.
- Cualquier vínculo entre `clients` y facturación/cobro.
