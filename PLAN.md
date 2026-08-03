# Gestor de Reportes — Plan de implementación

## Contexto

Una empresa necesita un sistema web interno donde sus empleados registren un reporte cada vez que terminan un trabajo. Hoy esa información no vive en ningún lado centralizado. El sistema debe guardar los datos del trabajo, permitir adjuntar evidencia (fotos, PDFs), capturar una firma, y permitir que un administrador consulte todo el histórico.

Requisito explícito del cliente: **el sistema no debe poder ser manipulado por cualquiera**. Eso define varias decisiones de este plan (sin registro público, autorización verificada en el servidor en cada acción, archivos servidos solo a usuarios autenticados y autorizados).

Se despliega en **Vercel**, y se reutiliza **Turso** como base de datos por consistencia con el proyecto anterior (Prestamos-cris).

## Dos empresas en un mismo sistema

El grupo son **dos empresas**, `Corp` y `SaaS`, que funcionan como sucursales separadas.

Esta sección describe la versión final, tras un cambio de rumbo del cliente a mitad de la construcción. La primera versión hacía que el admin también eligiera empresa al iniciar sesión, igual que un empleado. El cliente pidió lo contrario: el admin es "como Dios" — ve todo en todo momento, en las dos empresas a la vez, sin elegir nada, y puede editar o corregir cualquier reporte de cualquiera. Esa distinción de rol es la que ordena todo lo que sigue.

**Empleado** — elige empresa al iniciar sesión (o se le asigna sola si solo tiene acceso a una), y desde ese momento todo lo que ve pertenece solo a esa empresa. Puede cambiar desde la barra superior sin cerrar sesión. El acceso lo decide el admin, por usuario.

**Admin** — no elige empresa nunca. Ve reportes de las dos mezclados por defecto, en el panel y en la lista global, con un filtro para acotar a una si lo necesita. Al crear un reporte, un interruptor le pide explícitamente para cuál empresa es — es la única acción donde el admin sí tiene que decidir una empresa, porque crear un reporte exige guardarlo en una de las dos.

- **Los mismos campos en ambas**, pero conjuntos de datos completamente separados. Un empleado puede tener 2 reportes en Corp y 5 en SaaS.
- **Los nombres `Corp` y `SaaS` son provisionales**, confirmado con el cliente al desplegar producción — de momento se quedan así. El nombre visible vive en `companies.name`, una columna de texto sin relación con el identificador interno (`corp`/`saas`, usado en URLs, filtros y la clave foránea de cada reporte). Cambiarlo el día que definan los nombres comerciales reales es un `UPDATE companies SET name = 'Nombre real' WHERE id = 'corp'` — una sola sentencia, sin migración, sin tocar código ni afectar ningún reporte ya guardado.

Cómo se garantiza que los datos no se mezclen sin querer, y que el admin sí pueda tocar todo a propósito:

| Capa | Qué hace |
|---|---|
| `puedeAccederAReporte()` | El admin siempre pasa, de cualquier empresa — es la esencia del rol. Un empleado, solo si el reporte es suyo y de su empresa activa; si no, responde 404, igual que uno inexistente |
| Tipo `FiltrosReportes.companyId` | Opcional — `undefined` es "las dos", uso legítimo solo desde código del admin. Para el empleado existe `listarReportesDeEmpleado()`, que sí lo exige como parámetro obligatorio: ahí es donde de verdad importa que no se pueda olvidar |
| Empresa en la sesión | Va dentro del token firmado, no en una cookie aparte: editarla lo invalida. Para un admin, ese campo simplemente no existe — nunca se escribe |
| Verificación en cada petición | La pertenencia de un empleado a una empresa se consulta contra la base, no se cree lo que dice el token. Si el admin le quita a alguien el acceso, deja de entrar de inmediato |
| Creación de reportes | Para un empleado, la empresa sale de la sesión, nunca del formulario. Para el admin, sale del interruptor del formulario — y se valida contra las empresas reales antes de confiar en ella |

## Alcance confirmado

**Campos del reporte:** Nombre del proyecto, No. de orden de compra, Cliente, Fecha del trabajo, Detalles, Estado, Tipo de servicio, Etiquetas.

### Clasificación del trabajo

Al crear un reporte se piden dos cosas más:

1. **Tipo de servicio — eléctrico o mecánico.** Una sola opción, excluyente. Por eso es una columna del propio reporte y no una etiqueta suelta: la base impide que quede marcado como las dos cosas a la vez. En el formulario son botones de opción, no casillas: la forma del control ya comunica que solo se elige uno.
2. **Etiquetas — mantenimiento preventivo, urgencia, trabajo online, proyecto.** Se pueden marcar varias. Viven en su propia tabla (`report_tags`) con índice, porque el requisito es poder **filtrar los mantenimientos ya hechos por su etiqueta**. Guardadas como lista dentro de un campo de texto, filtrar obligaría a recorrer todos los reportes y mirar dentro de cada uno.

La urgencia se muestra en rojo y las demás etiquetas en gris. Si todas se vieran igual, marcar "urgencia" no serviría de nada al mirar una lista larga.

Los filtros son enlaces, no un formulario con JavaScript: cada combinación es una URL propia, así que se puede compartir, guardar en favoritos y usar con el botón "atrás". El filtrado ocurre en SQL.
**Adjuntos:** múltiples archivos por reporte.
**Firma:** pad de firma con mouse/dedo, guardada como imagen ligada al reporte.
**Estado:** `En proceso` → `Terminado`. Lo marca el empleado que hizo el trabajo.
**Roles:** Admin y Empleado, con dos vistas distintas del sistema (ver sección 3).
**Sin flujo de aprobación** — el admin no aprueba ni rechaza; revisa, edita y detecta faltantes.

### Las dos vistas

| | **Vista Master** (Admin) | **Vista General** (Empleado) |
|---|---|---|
| Qué reportes ve | Todos, de todos los empleados | Solo los suyos |
| Puede editar | Cualquier reporte | Solo los suyos |
| Puede eliminar | Sí | Solo los suyos y solo si están `En proceso` |
| Alertas de faltantes | Sí — panel dedicado | Solo sobre sus propios reportes |
| Gestión de usuarios | Sí | No |
| Búsqueda y filtros | Por empleado, cliente, orden de compra, fecha, estado | Solo sobre los suyos |

### Alerta de reportes incompletos

Un reporte marcado como **Terminado** que no tenga ningún archivo adjunto se considera **incompleto**. El sistema no bloquea al empleado al marcarlo terminado (a veces el PDF llega después), pero sí lo señala de forma visible:

- **Al empleado**, en el momento de marcar Terminado: aviso de que falta subir el documento, y una marca permanente en su lista hasta que lo suba.
- **Al admin**, en la Vista Master: un panel al inicio con el conteo de reportes incompletos y acceso directo a ellos, más una marca en cada fila de la lista y un filtro "Solo incompletos".

La misma lógica aplica a la firma: un reporte terminado y sin firmar también se marca como pendiente, con una etiqueta distinta para que el admin sepa qué falta exactamente (documento, firma, o ambos).

---

## 1. Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 16 (App Router) + React 19 + TypeScript** | Despliegue directo en Vercel, Server Actions evitan escribir una capa de API separada |
| Base de datos | **Turso (libSQL)** vía `@libsql/client` en modo HTTP | Ya usado por el equipo; SQLite distribuido, sin servidor que mantener. HTTP en vez de WebSocket por arranque en frío (sección 7.1) |
| ORM | **Drizzle ORM** (`drizzle-orm/libsql` + `drizzle-kit`) | Tipado end-to-end, migraciones versionadas en archivos SQL, sin runtime pesado |
| Auth | **Sesión JWT propia con `jose` + `bcryptjs`** | Ver nota abajo |
| Archivos | **Vercel Blob** (`@vercel/blob`), detrás de un servicio interno de almacenamiento | Turso es SQL puro, no sirve para binarios. Blob se integra nativo con Vercel. Ningún otro módulo lo importa directamente, así que cambiar de proveedor no toca el resto del sistema (ver 5.1) |
| Validación | **Zod** en cada entrada del servidor | Una sola fuente de verdad para forms y validación server-side |
| UI | **Tailwind CSS + shadcn/ui** | Rápido de construir, accesible, sin diseñar desde cero |
| Firma | **`react-signature-canvas`** | Canvas simple → exporta PNG en base64 |

**Nota sobre auth — por qué no NextAuth:** el middleware de Next.js corre en Edge Runtime, donde `bcryptjs` y el cliente de Turso por WebSocket dan problemas. La solución limpia es separar responsabilidades: el **login** corre en Node runtime (ahí sí se consulta Turso y se compara el hash con bcrypt), y el **middleware** solo verifica la firma del JWT con `jose` (compatible con Edge, sin tocar la base de datos). NextAuth añadiría configuración y dependencias para lograr exactamente lo mismo. Son ~120 líneas de código propio, completamente auditables.

---

## 2. Esquema de base de datos

Archivo: `src/db/schema.ts`

```
users
  id              text PK (uuid)
  username        text UNIQUE NOT NULL
  password_hash   text NOT NULL          -- bcrypt, cost 12
  full_name       text NOT NULL
  role            text NOT NULL          -- 'admin' | 'empleado'
  is_active       integer NOT NULL DEF 1 -- desactivar sin borrar historial
  failed_attempts integer NOT NULL DEF 0 -- anti fuerza bruta
  locked_until    integer                -- timestamp; null = no bloqueado
  created_at      integer NOT NULL
  updated_at      integer NOT NULL

reports
  id                 text PK (uuid)
  author_id          text NOT NULL FK -> users.id
  project_name       text NOT NULL
  purchase_order_no  text NOT NULL
  client_name        text NOT NULL
  work_date          integer NOT NULL   -- fecha del trabajo
  details            text NOT NULL
  status             text NOT NULL DEF 'en_proceso'  -- 'en_proceso' | 'terminado'
  completed_at       integer            -- cuándo se marcó terminado
  signature_url      text               -- referencia de la firma; null si no firmado
                                        -- PENDIENTE renombrar a signature_key (ver 5.1)
  signature_name     text               -- quién firmó (nombre escrito)
  signed_at          integer
  created_at         integer NOT NULL
  updated_at         integer NOT NULL
  updated_by         text FK -> users.id  -- quién editó por última vez
  índices: (author_id), (created_at), (purchase_order_no), (status)

attachments
  id            text PK (uuid)
  report_id     text NOT NULL FK -> reports.id ON DELETE CASCADE
  blob_url      text NOT NULL      -- referencia opaca que resuelve el servicio de
                                   -- almacenamiento. PENDIENTE renombrar a
                                   -- storage_key (ver 5.1)
  thumbnail_url text               -- miniatura ~300px; null en PDF y documentos
                                   -- PENDIENTE renombrar a thumbnail_key
  file_name     text NOT NULL      -- nombre original, sanitizado
  mime_type     text NOT NULL
  size_bytes    integer NOT NULL
  uploaded_at   integer NOT NULL
  índice: (report_id)
```

**Decisión sobre la firma:** va como campos propios en `reports`, no como un `attachment` genérico. Es una relación 1-a-1 con semántica distinta (tiene firmante y fecha de firma), y así se puede consultar "reportes sin firmar" con un simple `WHERE signature_url IS NULL`.

**Decisión sobre el estado "incompleto":** no se guarda en la base de datos, se **calcula** al consultar. Un campo `is_incomplete` almacenado se desincronizaría en cuanto alguien suba o borre un adjunto; habría que recordar actualizarlo en cada operación y tarde o temprano mostraría datos falsos. La consulta que lo deriva es directa:

```sql
-- reportes incompletos: terminados sin ningún adjunto
SELECT r.*, COUNT(a.id) AS attachment_count
FROM reports r
LEFT JOIN attachments a ON a.report_id = r.id
GROUP BY r.id
HAVING r.status = 'terminado' AND attachment_count = 0
```

Vive en `src/lib/queries/reports.ts` como una función reutilizable (`findIncompleteReports`, `countIncompleteReports`) para que la Vista Master y la lista del empleado usen exactamente la misma definición de "incompleto".

---

## 3. Estructura de archivos y las dos vistas

```
src/
  app/
    login/page.tsx                      -- único punto de entrada público
    (app)/
      layout.tsx                        -- shell autenticado + nav según rol
      reportes/                         -- VISTA GENERAL (empleado)
        page.tsx                        -- sus reportes + aviso de sus incompletos
        nuevo/page.tsx                  -- formulario de creación
        [id]/page.tsx                   -- detalle: datos, adjuntos, firma, estado
      admin/                            -- VISTA MASTER (solo admin)
        page.tsx                        -- panel: alertas de incompletos + resumen
        reportes/page.tsx               -- todos los reportes, búsqueda y filtros
        reportes/[id]/page.tsx          -- detalle editable de cualquier reporte
        usuarios/page.tsx               -- crear/desactivar/resetear empleados
    api/
      archivos/[id]/route.ts            -- descarga proxy autorizada de adjuntos
  components/
    reports/report-form.tsx             -- formulario compartido (crear/editar)
    reports/report-table.tsx            -- tabla compartida, columnas según rol
    reports/incomplete-badge.tsx        -- etiqueta "Falta documento" / "Falta firma"
    reports/signature-pad.tsx           -- canvas de firma
    reports/status-toggle.tsx           -- marcar En proceso / Terminado
  actions/
    auth.ts                             -- login, logout
    reports.ts                          -- crear, editar, eliminar, cambiar estado, firmar
    attachments.ts                      -- subir, eliminar
    users.ts                            -- solo admin
  lib/
    session.ts                          -- crear/leer/verificar JWT (jose)
    auth-guard.ts                       -- requireUser(), requireAdmin(), canAccessReport()
    queries/reports.ts                  -- consultas + definición única de "incompleto"
    validation.ts                       -- esquemas Zod
    rate-limit.ts                       -- lógica de bloqueo por intentos fallidos
    storage/                            -- ÚNICO punto de contacto con el proveedor
      storage.ts                        -- la interfaz: upload/read/delete/getDownloadUrl
      vercel-blob.ts                    -- implementación actual (@vercel/blob)
      local-disk.ts                     -- implementación de desarrollo (carpeta .uploads/)
      index.ts                          -- elige implementación y exporta el servicio
  db/
    schema.ts
    index.ts                            -- cliente Drizzle + Turso
  proxy.ts                              -- protege todo salvo /login; /admin solo admin
                                           (en Next 16 el antiguo middleware.ts se llama así)
scripts/
  seed-admin.ts                         -- crea el primer administrador
drizzle/                                -- migraciones generadas
```

**Por qué rutas separadas en vez de una sola lista que cambia según el rol:** `/admin/*` se puede bloquear entero desde el middleware con una sola regla, en lugar de repartir condicionales por dentro de cada página. Menos superficie donde equivocarse. Los componentes de formulario y tabla sí se comparten entre ambas vistas — cambia qué datos reciben, no cómo se ven.

### Vista Master — panel de inicio (`/admin`)

Lo primero que ve el admin al entrar:

1. **Alertas de faltantes** — tarjeta destacada: *"N reportes terminados sin documento adjunto"*, con enlace directo a la lista ya filtrada. Debajo, en tono secundario, *"N reportes terminados sin firmar"*.
2. **Resumen** — totales de reportes por estado y actividad reciente.
3. **Últimos reportes** — los más recientes de todo el equipo.

En la lista completa (`/admin/reportes`): búsqueda por proyecto, cliente u orden de compra; filtros por empleado, estado y rango de fechas; y un filtro rápido **"Solo incompletos"**. Cada fila incompleta lleva una etiqueta ámbar que dice exactamente qué falta.

### Diseño visual de la Vista Master

Referencia aprobada por el cliente: dashboard tipo panel analítico — barra lateral estrecha de iconos, saludo personalizado arriba, y una rejilla de tarjetas con un número grande, una minigráfica de tendencia y un pie con la variación respecto al periodo anterior.

Cómo se traduce a este sistema:

| Zona de la referencia | Aquí |
|---|---|
| Saludo ("Good Afternoon, Steve") | "Buenas tardes, {nombre}" + fecha |
| Rejilla de tarjetas KPI | Reportes del mes · Terminados · **Sin documento** · **Sin firmar** · Total histórico · Empleados activos |
| Minigráfica dentro de cada tarjeta | Tendencia de los últimos 30 días |
| Pie con variación (verde/rojo) | Comparación contra el mes anterior |
| Fila "Recently viewed" | "Últimos reportes" — tarjetas con proyecto, cliente, empleado y estado |
| Barra lateral de iconos | Panel · Reportes · Usuarios · Salir |

Dos ajustes deliberados respecto a la referencia:

1. **Las tarjetas de faltantes no son un KPI más.** "Sin documento" y "Sin firmar" son accionables, no informativas: van en ámbar, con un enlace directo a la lista ya filtrada. En la referencia todas las tarjetas pesan visualmente lo mismo; aquí las alertas tienen que resaltar o pierden su función.
2. **El color no puede ser el único indicador.** Verde y rojo se confunden con daltonismo, y son justo los colores del dashboard de referencia. Cada variación lleva también flecha y signo, y cada alerta lleva texto explícito ("Falta documento"), no solo el color.

Al construir esta pantalla (fase 7) se usará la guía `dataviz` para la paleta y las minigráficas, de modo que todo el panel se vea como un solo sistema y funcione en modo claro y oscuro.

### Cómo quedó construida

- **Tarjetas de alerta primero, resumen después.** Un panel que abre con "347 reportes" informa; uno que abre con "3 sin documento" señala qué hacer hoy. Si no hay pendientes, esa sección dice "Todo al día" en vez de mostrar tarjetas en cero.
- **Minigráfica escrita a mano** (SVG puro, sin librería de gráficas): son doce puntos semanales y una línea. Sigue las especificaciones de la guía de visualización — línea de 2px, punto final con anillo del color de la superficie, sin ejes que añadan ruido en un espacio de 40px de alto.
- **Cada variación lleva flecha, signo y color** — nunca solo color, que se confunde con daltonismo. Y el color depende de si subir es bueno para *ese* dato: más reportes es positivo, más reportes sin documento no lo es. Es la misma tarjeta con la lógica de color invertida, no dos componentes distintos.
- **Lista global (`/admin/reportes`)**: los mismos filtros del empleado (búsqueda, tipo de servicio, etiqueta) más filtro por empleado y por "sin firmar" — que solo tiene sentido en la vista del admin, porque el empleado ya ve únicamente sus propios pendientes de firma en su propia lista.
- **El detalle de un reporte es una sola página para los dos roles**, no dos rutas separadas. Duplicarla habría significado dos sitios donde mantener la misma lógica de permisos sincronizada — y dos sitios donde un día se desincroniza.
- **Gestión de usuarios**: alta con contraseña temporal generada (se muestra una única vez, nunca se guarda en texto plano), activar/desactivar, reseteo de contraseña. Ninguna de estas acciones es alcanzable sin pasar por `requireAdmin()`.
- **Salvaguarda contra quedarse fuera:** un admin no puede desactivar su propia cuenta. Sin esto, un clic de más dejaría a alguien sin ningún panel desde el cual revertirlo.

### Ajuste posterior: el admin deja de elegir empresa

Ya con la Vista Master construida, el cliente pidió el cambio descrito al inicio de este documento ("Dos empresas en un mismo sistema"): el admin no elige empresa, ve las dos siempre. Esto tocó lo ya construido:

- **Accesos por empresa como interruptores** pasaron a aplicar solo a empleados. Un admin no depende de `user_companies` para nada —ve todo por definición del rol— así que en su fila de la tabla de usuarios esos interruptores se reemplazan por una nota ("ve las dos empresas siempre"); mostrarle interruptores habría sugerido que algo cambia al tocarlos, y no es así.
- **Panel y lista global ganaron un filtro de empresa** (`Todas · Corp · SaaS`, por URL con `?empresa=`), con "Todas" como estado por defecto — antes no hacía falta, porque el admin ya estaba "dentro" de una empresa elegida.
- **La creación de reportes ganó un interruptor de empresa**, exclusivo del admin: es la única acción del sistema donde el admin sí decide una empresa, porque un reporte tiene que guardarse en una de las dos. El interruptor va primero en el formulario, antes que cualquier otro campo — es la decisión que condiciona todo lo demás.
- Un bug real salió de este cambio y se corrigió: las rutas de descarga de adjuntos y firmas (`/api/archivos/[id]`, `/api/firmas/[id]`) exigían `empresaActiva` no nula antes de dejar pasar a nadie. Como la del admin es siempre nula, esas rutas bloqueaban al admin para descargar **cualquier** archivo del sistema, no solo los de la otra empresa. Se corrigió pasando el usuario completo a `puedeAccederAReporte()`, que ya sabía resolver el caso del admin — el error estaba en no confiar en esa función y repetir a mano una condición que ya no aplicaba.

---

## 4. Autenticación y control de acceso

**Login:** el usuario envía credenciales a la Server Action `login` (Node runtime). Se busca el usuario, se verifica `locked_until`, se compara con `bcrypt.compare`. Si falla, se incrementa `failed_attempts`; si acierta, se resetea a 0 y se emite un JWT firmado (HS256, expiración 8 horas) con payload `{ sub: userId, role, name }`, guardado en una cookie `httpOnly` + `secure` + `sameSite: 'lax'`.

**Middleware:** intercepta toda ruta que no sea `/login`. Verifica la firma del JWT con `jose` — sin tocar la base de datos, así funciona en Edge. Sin cookie válida → redirige a `/login`. Además, si la ruta empieza con `/admin` y el `role` del token no es `admin`, redirige a `/reportes`. Esa comprobación en el middleware es solo la primera barrera; cada página y acción de `/admin` vuelve a llamar a `requireAdmin()` en el servidor.

**Autorización en el servidor (lo importante):** el middleware solo comprueba *que hay sesión*. La autorización real vive en `src/lib/auth-guard.ts` y **se invoca al inicio de cada Server Action y cada página**:

- `requireUser()` → devuelve el usuario de la sesión o lanza error.
- `requireAdmin()` → además verifica `role === 'admin'`.
- `canAccessReport(reportId, user)` → consulta el reporte y verifica `report.author_id === user.id || user.role === 'admin'`. El admin edita cualquier reporte; el empleado solo los propios.

Ninguna consulta confía en un `authorId` que venga del cliente: siempre se toma de la sesión del servidor. Esto es lo que impide que un empleado edite el reporte de otro cambiando un ID en la URL.

**Rastro de ediciones del admin:** cuando el admin edita el reporte de otra persona, el reporte guarda quién fue el último en modificarlo (`updated_by` → `users.id`) y se muestra en el detalle. Sin esto, un empleado podría ver su reporte cambiado sin saber por quién.

**Primer administrador:** script `npm run seed:admin` que lee `SEED_ADMIN_USER` y `SEED_ADMIN_PASSWORD` de variables de entorno, crea la cuenta y termina. Se ejecuta una sola vez. No hay registro público en ninguna parte de la aplicación — los empleados los crea el admin desde el panel.

---

## 5. Seguridad de archivos

- Validación **en el servidor** (no solo en el navegador) de tipo MIME y extensión, contra una lista blanca: `pdf, jpg, jpeg, png, webp, heic, doc, docx, xls, xlsx`.
- **Verificación del contenido real por los primeros bytes del archivo.** El tipo que llega en la subida lo declara el navegador y se puede escribir a mano: comprobar solo ese valor y la extensión no detiene a nadie que lo haga a propósito. Se comparan las cabeceras reales (`%PDF`, `‰PNG`, …) contra lo declarado. Sin esto, la prueba de "subir un .exe renombrado a .pdf" no se podría superar.
- Límite de tamaño: **4 MB por archivo**, máximo 10 archivos por reporte. No es un número elegido al azar: en Vercel el cuerpo de una petición a una función no puede pasar de 4,5 MB, y la subida viaja por ahí. Como las fotos se reducen en el navegador antes de enviarse, en la práctica pesan unos cientos de kilobytes y el tope solo lo tocan los PDF grandes. Si más adelante hicieran falta archivos mayores, hay que pasar a subida directa del navegador a Blob, que evita ese límite.
- El nombre original se guarda en la base de datos solo para mostrarlo; el nombre real en Blob es un UUID generado en el servidor. Esto elimina de raíz cualquier riesgo de path traversal o de sobrescribir archivos ajenos.
- Las descargas pasan por `/api/archivos/[id]`, que verifica sesión y permiso sobre el reporte antes de devolver nada. **La URL del almacenamiento nunca se entrega al navegador.** Sin esto, ese enlace funcionaría para cualquiera que lo tuviera, sin sesión y para siempre.
  - Nota honesta sobre Vercel Blob: los archivos se guardan con sufijo aleatorio, lo que hace la URL imposible de adivinar, pero el almacenamiento en sí es de lectura pública. La protección real es que esa URL no sale nunca del servidor. Si se confirma que el plan contratado ofrece blobs privados, conviene activarlo como segunda capa.
- **En desarrollo, si no hay token de Blob configurado, los archivos se guardan en una carpeta local** (`.uploads/`, ignorada por git). El resto de la aplicación no sabe cuál de los dos almacenamientos está activo. Así se puede construir y probar toda la subida, la validación y la descarga sin depender de una cuenta ni de conexión. Esa indiferencia no es casual: es la abstracción de la sección 5.1 funcionando.
- **La firma sigue exactamente el mismo camino que un adjunto**: llega como PNG, se comprueba por sus primeros bytes que realmente lo sea (un SVG disfrazado se rechaza — se puede abrir en un navegador y ejecutar scripts), se guarda con nombre generado en el servidor, y se sirve por `/api/firmas/[id]` previa comprobación de permisos. Es lo más sensible del reporte, porque es lo que le da valor como constancia del trabajo.
- El pad de firma está escrito a mano, sin librería. Resuelve las dos cosas que las genéricas suelen hacer mal: el trazo borroso en pantallas de alta densidad (el canvas se dimensiona en píxeles reales del dispositivo) y el desplazamiento de la página al firmar con el dedo (`touch-none` y captura del puntero).

---

## 5.1 Abstracción del almacenamiento de archivos

**Horizonte: recomendación a considerar en unos 3 meses, no una tarea del orden de construcción actual.** No bloquea nada de lo que sigue ni cambia el stack de hoy. Queda documentada ahora para que, cuando llegue el momento de evaluarla, la decisión y su razonamiento estén completos en vez de tener que reconstruirlos de memoria.

**El sistema usa Vercel Blob hoy, y va a seguir usándolo.** Esta sección no cambia el proveedor: fija la regla que permitiría cambiarlo más adelante sin tocar el resto de la aplicación, si alguna vez hiciera falta.

### La regla

> Ningún componente, Server Action, route handler o página importa `@vercel/blob`. Todo pasa por un único servicio interno, en `src/lib/storage/`.

Es una sola regla y es fácil de verificar: si `@vercel/blob` aparece importado fuera de `src/lib/storage/vercel-blob.ts`, la abstracción está rota. Ese `grep` es toda la auditoría que hace falta.

El valor no es hipotético. Cuando la dependencia del proveedor se filtra por el código, migrar deja de ser un problema técnico y pasa a ser una excavación: hay que encontrar cada llamada, entender qué esperaba de vuelta, y rezar para no haber olvidado ninguna. Concentrada en una carpeta, la migración es escribir una implementación nueva.

### La interfaz

```ts
// src/lib/storage/storage.ts
export interface StorageService {
  upload(datos: ArrayBuffer, opts: { contentType: string; extension: string }): Promise<string>;
  read(ref: string): Promise<ArrayBuffer | null>;
  delete(ref: string): Promise<void>;
  getDownloadUrl(ref: string, opts?: { expiraEnSegundos?: number }): Promise<string | null>;
}
```

Cuatro operaciones, y cada una está por una razón:

| Método | Por qué existe |
|---|---|
| `upload()` | Devuelve una **referencia opaca**, no una URL. Quien la recibe no debe interpretarla: solo guardarla y devolvérsela al servicio. El nombre real del archivo lo genera el servicio, nunca el usuario |
| `read()` | Es lo que usa la ruta de descarga hoy. El sistema **no entrega URLs de almacenamiento al navegador** (ver sección 5): lee los bytes en el servidor y los sirve tras comprobar permisos |
| `delete()` | Borrado del archivo. Tolera que el archivo ya no exista: dejar una fila apuntando a la nada es peor que un huérfano en el bucket |
| `getDownloadUrl()` | **No se usa hoy** y devuelve `null` en la implementación actual. Existe porque S3 y R2 sí saben firmar URLs temporales, y ese es el camino natural para dejar de proxear archivos grandes cuando el volumen lo justifique. Declararlo ahora evita que el día de la migración haya que cambiar la firma de la interfaz y con ella a todos los que la usan |

Sobre `getDownloadUrl()` conviene ser explícito: **añadirlo no debilita nada**. El modelo de seguridad sigue siendo el proxy autorizado de la sección 5, y mientras devuelva `null` no hay ninguna ruta alternativa hacia los archivos. Es un espacio reservado, no una puerta.

### Las implementaciones

| Implementación | Cuándo se usa |
|---|---|
| `VercelBlobStorage` | Producción. Es la actual |
| `LocalDiskStorage` | Desarrollo sin token de Blob configurado. Guarda en `.uploads/` |
| `S3Storage` *(futura)* | Amazon S3, Cloudflare R2 o DigitalOcean Spaces — los tres hablan el mismo protocolo, así que **una sola implementación cubre los tres** |

`index.ts` elige según la configuración y exporta el servicio ya construido. El resto de la aplicación importa de ahí y no sabe cuál está activo.

**Esto ya está demostrado, no es una promesa.** Hoy conviven dos implementaciones —Blob y disco local— y ninguna página, acción ni ruta sabe cuál está corriendo. Una tercera es más de lo mismo.

**Estado del código:** la abstracción existe y la regla se cumple — `@vercel/blob` aparece importado en un único archivo de todo el proyecto. Lo que falta es cosmético: hoy es un solo archivo `src/lib/storage.ts` con las dos implementaciones dentro, y conviene abrirlo a la carpeta `src/lib/storage/` de arriba antes de sumar una tercera. Separarlo ahora es mover código; hacerlo con tres implementaciones apretadas en un archivo es refactorizar.

### Qué se guarda en la base: `storage_key`, no `blob_url`

**Decisión: renombrar `blob_url` → `storage_key`, `thumbnail_url` → `thumbnail_key` y `signature_url` → `signature_key`.**

El razonamiento, en orden:

1. **`blob_url` nombra al proveedor.** Un campo llamado así en un sistema que corra sobre S3 obliga a explicar, cada vez que alguien lo lee, que "blob" ya no significa nada. El acoplamiento de la base a un proveedor empieza por el nombre de la columna.

2. **`file_url` sería más genérico pero igual de inexacto.** El valor almacenado **ya no siempre es una URL**: en desarrollo es `local:<uuid>.pdf`, y una futura implementación de S3 guardaría la clave del objeto (`reportes/<uuid>.pdf`), no una URL — porque el bucket y la región viven en la configuración, no en cada fila. Llamarlo "url" sería falso en dos de los tres casos.

3. **`storage_key` describe lo que la columna realmente contiene:** el identificador con el que el servicio de almacenamiento recupera ese archivo. Es cierto para los tres proveedores y no promete un formato concreto — que es justo lo que se quiere, porque **el formato es asunto exclusivo del servicio**.

**Estado:** el código usa todavía `blob_url`, `thumbnail_url` y `signature_url` — no se ha tocado, porque esta es la recomendación a 3 meses, no una tarea de ahora. El renombre es una migración de una sola sentencia por columna; conviene hacerlo mientras la base tenga solo datos de prueba, así que si se retoma esta sección conviene hacerlo **antes** de que haya datos reales de producción, no después. Es la única parte de esta sección con fecha límite implícita — el resto (la interfaz, separar `storage.ts` en carpeta) no la tiene.

### Cómo sería la migración a otro proveedor

Con esta separación, cambiar de Vercel Blob a S3, R2 o Spaces se reduce a:

1. Escribir `S3Storage` cumpliendo la interfaz — la única pieza de código nueva.
2. Cambiar la línea de `index.ts` que elige la implementación.
3. Copiar los archivos existentes al bucket nuevo.
4. Actualizar las referencias guardadas: un `UPDATE` sobre `storage_key`, `thumbnail_key` y `signature_key` que reescriba el prefijo.

**Nada más.** Ni páginas, ni Server Actions, ni rutas de descarga, ni componentes. Los pasos 3 y 4 son de datos y no de código, y se pueden ensayar contra una copia de la base antes de tocar producción.

---

## 6. Endurecimiento (sin infraestructura extra)

- **Fuerza bruta:** contador `failed_attempts` en la tabla `users`. A los 5 intentos fallidos, `locked_until = ahora + 15 minutos`. Sin Redis ni servicios externos.
- **Enumeración de usuarios:** el login responde el mismo mensaje genérico si el usuario no existe o si la contraseña es incorrecta.
- **CSRF:** las Server Actions de Next.js ya validan el origen de la petición; la cookie `sameSite: 'lax'` refuerza la protección.
- **Validación:** esquema Zod en la entrada de toda Server Action, antes de tocar la base de datos.
- **Inyección SQL:** Drizzle parametriza todas las consultas.
- **Secretos:** `.env.local` en `.gitignore` desde el primer commit; en producción todo va en variables de entorno de Vercel (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `BLOB_READ_WRITE_TOKEN`).
- **Cabeceras de seguridad** en `next.config.ts`: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, Referrer-Policy.
- HTTPS es automático en Vercel.

### Repaso de la fase 8: qué se auditó y qué se encontró

Se revisó, uno por uno, que cada Server Action y cada ruta de `/api` llame al guard que le corresponde antes de tocar cualquier dato — la tarea que la fase 8 pide explícitamente. El repaso cubrió los seis archivos de `src/actions/`, las dos rutas de `src/app/api/` y las ocho páginas protegidas.

**Confirmado en orden:** todas las Server Actions de reportes, adjuntos y firma llaman a `requireAccesoReportes()`; todas las de usuarios, a `requireAdmin()`; las dos rutas de descarga verifican sesión y permiso antes de leer cualquier archivo; todas las páginas bajo `(app)` llaman al guard correcto para su rol. Las cinco cabeceras de seguridad se comprobaron en una respuesta real del servidor, no solo leídas del código.

**Un cabo suelto real, corregido:** `elegirEmpresaAction` (la que un empleado usa para elegir con qué empresa trabaja) no distinguía el rol admin. Si alguien la invocara para un admin —nunca ocurre desde la interfaz, porque el cambiador de empresa no se le muestra— y ese admin todavía tuviera filas antiguas en `user_companies` de antes del rediseño, la acción le escribiría una empresa en la sesión. `getCurrentUser()` ya ignora ese campo para el rol admin, así que era inofensivo en la práctica, pero quedaba como una inconsistencia conceptual: una acción que no sabía que el rol para el que se estaba llamando ya no participa en este mecanismo. Se agregó una salida temprana explícita.

**Pendiente de esta fase, con la misma limitación que la de rendimiento:** rotar el token de Turso pegado en el chat durante la configuración inicial. Sigue siendo válido y no hay indicio de que se haya filtrado más allá de esta conversación, pero es buena práctica no dejarlo como el token de producción — es un cambio de un minuto en el panel de Turso cuando se vaya a desplegar.

---

## 7. Rendimiento: arranque en frío y volumen de datos

Son dos problemas separados. El arranque en frío es de infraestructura; la fluidez con miles de reportes es de cómo se consultan y se envían los datos.

### 7.1 Arranque en frío

| Medida | Qué resuelve |
|---|---|
| **Colocar la región de Vercel junto a la de Turso** | El impacto más grande de todos. Si las funciones corren en Washington y la base de datos en Frankfurt, *cada consulta* paga el viaje de ida y vuelta. Es configuración, no código, y cuesta cero. **La base ya está creada en `aws-us-east-1`, así que en Vercel hay que fijar la región `iad1`** en `vercel.json` |
| **Activar Fluid Compute en el proyecto de Vercel** | Reutiliza instancias ya calientes entre peticiones en lugar de levantar una nueva por invocación. Es la respuesta directa al arranque en frío en Vercel hoy. Viene activo por defecto en proyectos nuevos — hay que confirmarlo en el panel, no darlo por hecho |
| **Cliente Turso sobre HTTP, no WebSocket** | Con `libsql://` el cliente abre un WebSocket en cada invocación nueva. Usando la URL `https://` cada consulta es una petición suelta, sin handshake previo. En serverless, donde el proceso muere seguido, esto conviene |
| **Login y páginas públicas estáticas** | La primera pantalla que ve alguien es `/login`. Renderizada de forma estática se sirve desde el CDN al instante, sin tocar función ni base de datos. La percepción de "la página está lenta" casi siempre nace ahí |
| **Middleware liviano** | Solo verifica la firma del JWT con `jose`. No consulta la base de datos ni importa nada pesado. Corre en cada petición, así que cualquier cosa que se le agregue se paga siempre |
| **Costo de bcrypt controlado** | `bcryptjs` con costo 12 puede tomar varios cientos de milisegundos de CPU. Se baja a **costo 11** y solo se ejecuta en el login, no en cada petición |

**Lo que no vamos a hacer:** las *embedded replicas* de Turso (réplica local del archivo SQLite) darían latencia casi nula, pero necesitan un disco que sobreviva entre peticiones y en serverless no existe. No aplica aquí. Tampoco un cron que "despierte" la app: con Fluid Compute es innecesario y sería gasto puro.

### 7.2 Fluidez con 1.000–2.000 reportes

Conviene decirlo claro: **2.000 filas no son un problema para SQLite.** Una consulta con índice sobre ese volumen se resuelve en menos de un milisegundo. El riesgo real no es la base de datos, son estas tres cosas:

**a) Mandar todo al navegador.** Es el error que sí se siente, sobre todo en celular. Se evita con paginación **en el servidor** desde el primer día: `LIMIT 50 OFFSET n`, nunca traer todo y filtrar en el cliente. La lista del admin usa scroll infinito o paginado numerado; el filtro y la búsqueda se aplican en SQL, no en JavaScript.

**b) Consultas N+1.** Pintar 50 filas y pedir los adjuntos de cada una son 51 consultas. Se resuelve con un solo `LEFT JOIN ... GROUP BY` que ya trae el `attachment_count` — la misma consulta de la sección 2. Igual para el nombre del empleado: viene en el JOIN, no en una consulta aparte.

**c) Fotos de celular en la lista.** Este es el cuello de botella real en móvil. Una foto de teléfono pesa 3–5 MB; diez adjuntos son 40 MB. La solución es **reducir la imagen en el navegador antes de subirla** (canvas, a 1600 px de lado mayor) y generar además una miniatura de ~300 px. Se sube el archivo optimizado más la miniatura; la lista y las galerías muestran miniaturas, y el original se descarga solo si alguien lo pide. Hacerlo en el cliente evita meter `sharp` en el servidor, que es pesado y empeoraría justamente el arranque en frío. Los PDF se suben tal cual.

**Otras medidas:**
- Índices sobre las columnas por las que se filtra: `status`, `author_id`, `work_date`, `purchase_order_no` (ya en el esquema).
- El conteo de incompletos del panel es un `COUNT(*)`, no traer las filas para contarlas en memoria.
- `revalidatePath()` después de cada mutación, para que Next.js sirva las listas desde caché entre cambios en vez de reconsultar en cada visita.
- Suspense con esqueletos de carga: la estructura de la página aparece de inmediato y los datos entran al llegar. No hace la consulta más rápida, pero elimina la sensación de pantalla congelada.
- Búsqueda con `debounce` de 300 ms, para no disparar una consulta por cada tecla.

**Sobre la búsqueda por texto:** con 2.000 filas, un `LIKE '%término%'` recorre la tabla entera y aun así responde al instante. No vale la pena montar FTS5 ahora. Si el volumen llegara a decenas de miles, libSQL soporta FTS5 y se agrega sin rehacer el esquema.

### Medido contra datos reales (fase 9, parte local)

Se sembraron 2.000 reportes (`npm run seed:demo -- 2000`, quedaron 2.011 en total) y se midió cada consulta clave contra la base real de Turso (`npm run medir:rendimiento`). Dos hallazgos, uno de ellos con corrección aplicada:

**1. Las cifras absolutas medidas desde este equipo no sirven como referencia de producción, y hay que decirlo así de claro.** Una consulta trivial (`SELECT 1`, sin lógica alguna) tarda entre 85 y 160 ms de ida y vuelta desde aquí hasta Turso (`npm run medir:latencia`) — eso es geografía, no la base de datos. Es exactamente el problema que la sección 7.1 ya nombraba: la función tiene que vivir en la misma región que la base. Una vez desplegado en Vercel con la región `iad1` (junto a Turso en `aws-us-east-1`), ese mismo viaje baja a un par de milisegundos. Las cifras de esta sección sirven para comparar el **diseño** de las consultas entre sí, no para predecir la latencia real en producción — eso solo se mide desplegado.

**2. Encontrado y corregido: `listarReportes()` hacía dos viajes de red secuenciales por cada carga, no uno.** Traía la página de reportes y por separado, después, sus etiquetas — porque esa segunda consulta necesitaba los ids que la primera devolvía, así que no podían pedirse en paralelo. Con la latencia de esta máquina hacia Turso, ese segundo viaje era el costo dominante de toda la función: `listarReportes` bajó de 417–3.362 ms a 95–235 ms al eliminarlo. Se resolvió agregando las etiquetas dentro de la misma consulta SQL, con `group_concat` sobre una subconsulta correlacionada (igual patrón que ya se usaba para el conteo de adjuntos). Sigue sin haber problema N+1 — sigue siendo una sola consulta para toda la página — pero ahora es también un solo viaje de red, no dos. Se aplicó tanto en `listarReportes()` como en `obtenerReporte()`.

**3. `Promise.all` sí paraleliza de verdad, pero no de forma perfecta.** El panel del admin lanza 9 consultas concurrentes (`obtenerResumen()`). Medido: 9 consultas triguales seguidas tardan ~1000 ms; las mismas 9 en paralelo, ~313 ms — 3,2× más rápido, no 9×, lo que sugiere un límite de conexiones concurrentes hacia Turso (`npm run medir:concurrencia`). Con la latencia de producción (de milisegundos, no de cientos), esa diferencia entre 3× y 9× es imperceptible para quien mira la pantalla, así que no se tocó — perseguir ese último margen aquí no vale el riesgo de complicar el código antes de tener una medición real desplegada.

**Pendiente real de esta fase**, que no se puede hacer sin la cuenta de Vercel del cliente: desplegar, confirmar que la región de la función coincide con la de Turso, y repetir estas mismas mediciones desde ahí — esas sí serán representativas. También quedan pendientes las pruebas de Lighthouse en móvil y la simulación de 4G, que necesitan la app ya desplegada.

---

## 8. Orden de construcción

1. **Base** — proyecto Next.js + Tailwind + shadcn, conexión a Turso (HTTP, región junto a la de Vercel), esquema Drizzle, primera migración, script de seed del admin.
2. **Autenticación** — login, sesión JWT, middleware, guards, logout. Verificar que las rutas protegidas realmente rechazan sin sesión.
3. **Vista General (empleado)** — CRUD de reportes con los guards aplicados, estado En proceso/Terminado, lista de sus propios reportes.
4. **Adjuntos** — subida validada a Blob, reducción de imagen y miniatura en el navegador, ruta de descarga autorizada, borrado.
5. **Alertas de incompletos** — consulta compartida en `lib/queries/reports.ts`, aviso al marcar Terminado sin adjunto, etiquetas en la lista.
6. **Firma** — canvas, guardado, visualización en el detalle, marca de "falta firma".
7. **Vista Master (admin)** — panel con alertas, lista global con búsqueda y filtros **paginada en el servidor**, edición de cualquier reporte, gestión de empleados.
8. **Repaso de seguridad** — bloqueo por intentos, cabeceras, revisión manual de que cada Server Action llama a su guard.
9. **Repaso de rendimiento** — sembrar 2.000 reportes de prueba, medir, ajustar índices y paginación, confirmar Fluid Compute y regiones.
10. **Despliegue** — variables de entorno en Vercel, migración en producción, seed del admin, prueba end-to-end.

### Fase 10, hecho: desplegado en producción

**URL:** `https://reportes-eight.vercel.app`
**Repositorio:** `github.com/engsupport-collab/Reportes` (privado), conectado a Vercel para despliegue automático en cada push a `main`.
**Base de datos:** Turso `reportes-engsupport`, región `aws-us-east-1`, limpia — sin los 2.000 reportes de prueba de la fase 9.
**Blob Store:** `reportes-archivos`, acceso público (igual que en desarrollo), región `iad1`.
**Cuenta dueña de todo:** Gmail nuevo, propiedad de la empresa — GitHub, Vercel y Turso vinculados a esa identidad, no a la del desarrollador.

Verificado en el sitio real, no solo localmente:

- Login como admin contra la base de producción → funciona, sin errores de consola.
- Las cinco cabeceras de seguridad llegan en la respuesta real.
- **La región de las funciones quedó en `iad1` sin configurar nada** — es el default de Vercel para proyectos nuevos, y coincide exactamente con `aws-us-east-1` de Turso. No hizo falta tocar `vercel.json`.
- El middleware y las páginas estáticas responden en ~400 ms desde donde se probó — ese número es la latencia de red hasta el borde de Vercel, no algo que la app controle.

**Un hallazgo real, sin resolver todavía:** las páginas que sí consultan Turso (login, `/admin/reportes`) responden de forma estable en ~1.9–2.3 segundos, **incluso repitiendo la misma petición varias veces seguidas** — eso descarta que sea un arranque en frío puntual, porque un arranque en frío se nota una vez y después baja. Con la región ya coincidiendo, esta cifra es más alta de lo que la sección 7.1 hacía esperar.

**Fluid Compute: confirmado activo** en el dashboard (`Settings → Functions`) — descarta la primera causa. Queda en pie la segunda:

**Tráfico real bajo.** Un proyecto recién desplegado, sin visitas reales todavía, es exactamente el escenario donde Vercel mantiene menos instancias calientes incluso con Fluid Compute activo. Es posible que este número baje solo, una vez que la empresa empiece a usar el sistema con regularidad durante el día.

**Pendiente:** volver a medir después de unos días de uso real antes de decidir si hace falta investigar más.

### Fase 10.1: orden de compra y detalles opcionales

Pedido del cliente después del lanzamiento: algunos trabajos se registran antes de que exista número de orden de compra, y no todos los reportes necesitan un detalle escrito.

- `purchase_order_no` y `details` dejaron de ser `NOT NULL` en el esquema (`drizzle/0005_many_kingpin.sql`). Migración aplicada con `ALTER COLUMN` nativo de libSQL, sin recrear tablas — sin pérdida de datos, verificado primero en desarrollo.
- El formulario ya no exige ninguno de los dos campos; ambos muestran "(opcional)" en su etiqueta.
- **Falta de orden es una alerta, falta de detalle no.** El cliente fue explícito: la orden de compra es un dato administrativo que puede faltar el primer día y completarse después al editar, así que un reporte sin orden muestra el tag "Sin orden" **sin importar su estado** (a diferencia de "Falta documento"/"Falta firma", que solo aplican a reportes terminados). Los detalles, en cambio, no disparan ninguna alerta si faltan — el reporte simplemente muestra "Sin detalles." en su vista.
- "Sin orden" es también un filtro, replicado en la Vista General del empleado y en la Vista Master del admin, con conteo (`contarSinOrden`) igual que los filtros de faltantes existentes.
- Para completar la orden más tarde: el mismo flujo de edición que ya existía (admin o el autor del reporte).

### Fase 10.2: Viáticos

Pedido del cliente: cada reporte necesita una sección de viáticos (gastos del trabajo), donde se suba una foto o archivo por gasto junto con su monto — el monto es opcional a propósito, porque casi siempre ya se lee en la propia foto del recibo.

- Tabla nueva `report_viaticos` (`drizzle/0006_normal_sway.sql`), independiente de `attachments`: mismo patrón (blob privado + miniatura opcional para imágenes), más un campo `amount` (pesos, sin decimales, nullable) que no tiene sentido en la evidencia genérica de un trabajo.
- Deliberadamente **no** se mezcló con `attachments`: el conteo de "sin documento" del reporte solo debe mirar evidencia del trabajo, no recibos de gastos.
- Un viático se agrega de a uno (foto + monto opcional), no por lotes como los adjuntos — el monto solo tiene sentido pegado a su propia foto.
- Descarga autenticada por `/api/viaticos/[id]`, mismo esquema de permisos que `/api/archivos/[id]`.
- Verificado en navegador con Playwright: agregar con monto, agregar sin monto (muestra "Sin monto", sin alerta), eliminar, y confirmar que la descarga rechaza peticiones sin sesión (401).

### Fase 10.3: descargar el reporte en PDF

Resuelve el "Pendiente A" de más abajo, por la vía recomendada ahí: **generar al descargar**, no congelar al firmar. El PDF se arma en el momento con los datos actuales, así que siempre coincide con lo que muestra el sistema y no hay dos versiones de la verdad.

Contenido, en este orden: ficha del reporte (a dos columnas) → firma con su firmante y fecha → cada viático con su monto → cada adjunto. Las fotos se insertan como página propia y los PDF se fusionan página a página conservando su tamaño original.

- **Word y Excel no se fusionan**: requeriría convertirlos primero, una dependencia mucho más pesada para un caso que casi no ocurre — el cliente confirmó que los documentos "normalmente son foto o PDF". Esos archivos se listan por nombre en una página final, aclarando que hay que descargarlos aparte. Lo mismo con cualquier archivo que no se pueda leer o fusionar: se degrada a un listado en vez de romper la descarga completa.
- `sharp` se usa **solo aquí**, para convertir a PNG las fotos guardadas en WebP (PDF no admite WebP). Es un costo que paga únicamente quien pide el PDF, no cada petición — por eso aquí sí se justifica, a diferencia de la subida (ver `imagen-cliente.ts`, donde se evitó a propósito).
- `serverExternalPackages: ["sharp"]` en `next.config.ts` es **obligatorio**: sin eso el empaquetador intenta analizar su binario nativo y tumba el worker de compilación ("Jest worker encountered N child process exceptions").
- Verificado en navegador: PDF de 6 páginas con portada, firma, viático con monto y adjuntos fusionados, incluido un PDF externo que conserva su tamaño Carta.

### Fase 10.4: rail lateral y filtros detrás de un botón

Pedido del cliente sobre la navegación, a partir de un dashboard de referencia:

- **Rail lateral** (`side-nav.tsx`) en lugar de la barra horizontal. En escritorio queda pegado arriba con `sticky` y alto de pantalla — con `static` la navegación se iba desplazando y desaparecía al bajar en una lista larga. En el celular esa columna no cabe, así que se convierte en un cajón que se abre desde una barra superior; se cierra al elegir un enlace, porque si no tapa la página recién abierta.
- **Menú de cuenta abajo a la izquierda**: avatar con la inicial, nombre y rol; al pulsarlo se despliega hacia arriba (pegado al borde inferior, hacia abajo quedaría fuera de pantalla) con "Cerrar sesión". Salir dejó de ser un botón suelto en la barra: es la acción que más molesta pulsar por error.
- **Filtros detrás de un botón** (`filter-panel.tsx`), con contador de filtros activos. Antes todas las opciones estaban desplegadas y la lista de empleados empujaba los reportes fuera de la primera pantalla. El filtro de empleado es ahora una lista desplegable, no una fila de nombres.
- Se mantiene el filtrado por URL: aplicar navega a `?empresa=…&empleado=…`, así la dirección se puede compartir, el botón "atrás" funciona y el filtrado real sigue ocurriendo en SQL. Debajo del botón quedan fichas de lo aplicado, con "×" para quitar cada una — sin eso habría que abrir el panel para saber por qué la lista muestra tres reportes y no cuarenta.
- El panel de `/admin` conserva sus chips de empresa: son tres opciones y es el selector de contexto de esa pantalla, esconderlo tras un botón sería peor.
- Verificado en navegador (escritorio y 390px): rail fijo al desplazar, cajón móvil, panel de filtros aplicando y quitando filtros, menú de cuenta con cierre de sesión. Sin errores de consola.

### Fase 10.5: barra superior y perfil

- **Barra superior** (`top-bar.tsx`) con el buscador a la izquierda y la cuenta a la derecha. El buscador es uno solo para todo el sistema y se quitaron los de cada lista: dos cajas de búsqueda en la misma pantalla confunden. Si ya se está en la lista, buscar conserva los filtros puestos y solo reinicia la página.
- **`/perfil`**: ficha de la propia cuenta (nombre, usuario, empresas, fecha de alta) y **cambio de la propia contraseña**, que hasta ahora no existía — la única forma era que un admin la reseteara, lo que obliga a que la temporal viaje por WhatsApp y quede escrita en algún lado. Pide la actual además de la nueva: sin eso, cualquiera que encuentre una sesión abierta se queda con la cuenta.
- El perfil es siempre el del usuario de la sesión, nunca un id por URL — un perfil direccionable por parámetro sería una puerta para leer la cuenta de otro. Para cuentas ajenas está `/admin/usuarios`, detrás de `requireAdmin()`.
- El estado del cajón móvil se movió a `shell-chrome.tsx` porque ahora el botón que lo abre (barra superior) y el cajón (rail) son componentes distintos.
- **No se agregaron** correo, teléfono, ubicación ni foto: esos campos no existen en la base y mostrarlos vacíos no aporta. Requerirían una migración.
- Corregido de paso un desbordamiento horizontal preexistente: las tarjetas de `report-list` se salían 28px de la pantalla a 390px porque las celdas del grid no llevaban `min-w-0` y no encogían por debajo de su contenido mínimo.
- **Sugerencias de navegación en el buscador**: escribir "pan" ofrece "Panel", "nue" ofrece "Nuevo reporte". La comparación ignora mayúsculas y tildes. El mismo campo hace dos cosas porque las secciones son cinco y se sabe su nombre, mientras que los reportes son miles y no: por eso la sugerencia hay que elegirla (clic, o flechas y Enter) y **Enter a secas sigue buscando reportes**, que es lo que se hace la mayoría de las veces. Se cierra con un clic fuera, no con `onBlur` — ese se dispara antes del clic en la sugerencia y se la lleva por delante.
- En `/perfil`, el avatar se posiciona en absoluto a caballo sobre el borde del banner. Antes el nombre iba alineado al fondo del avatar dentro del mismo flex y, como el avatar sube 40px, terminaba escrito encima del color.

### Fase 10.6: firma escrita y datos de prueba

**Firma escrita.** El bloque de firma pasa a tener dos pestañas: *Escribir* y *Dibujar*. Escribir va primera y es la que se ofrece por defecto, porque funciona en cualquier dispositivo y dibujar con el dedo falla en algunos celulares (ver el problema abierto de abajo).

- Se teclea el nombre, se elige entre tres tipografías (`Dancing Script`, `Caveat`, `Great Vibes`, servidas desde el propio dominio por `next/font`), y lo que se ve en la vista previa es exactamente lo que se guarda: la imagen se genera leyendo la fuente aplicada a ese mismo recuadro, no nombrándola por separado.
- El resultado es un **PNG idéntico en forma al del pad**, generado en `firma-escrita.ts`. Se guarda una imagen y no "el nombre y la fuente" porque todo lo que hay aguas abajo —la vista del reporte, `/api/firmas`, el PDF— ya trabaja con un PNG; convertirlo ahí deja intacto el resto del sistema.
- Antes de medir el texto se espera a `document.fonts.load`: sin eso el navegador mide con la fuente suplente y la firma sale con otro tamaño, o directamente con otra letra, que es peor porque no da error.
- El tamaño baja hasta que el nombre quepa, para que uno largo no se salga por los lados en el PDF.
- Verificado en navegador: firmado escribiendo (PNG de 26 KB con 6.444 píxeles dibujados — no en blanco), tildes y eñe correctas, el PDF lo incluye, y **el modo dibujar sigue funcionando** tras el refactor (856 píxeles de trazo guardados).

**Datos de prueba (`scripts/seed-prueba.ts`).** 10 reportes en Corp y 8 en SaaS para poder mirar el sistema con contenido dentro. A diferencia de `seed-demo`, este sí puede correrse contra producción: no crea usuarios ni toca nada existente, reutiliza una cuenta admin ya presente y solo inserta reportes. Los casos están escritos a mano —con y sin orden, con y sin detalles, terminados y en proceso, de los dos servicios— porque el objetivo es ver la interfaz, y un bucle daría dieciocho variantes de lo mismo. Cada reporte lleva el id con prefijo `prueba-`: es el único rastro que los distingue, y con él `npm run seed:prueba -- --limpiar` los borra de forma exacta sin depender de reconocerlos por el nombre.

### Fase 10.7: panel a dos columnas y analíticas por empresa

**Panel.** Distribución en tres bandas, siguiendo el tablero de referencia que pasó el cliente:

1. Alertas ("Requiere atención") a todo el ancho.
2. Las cuatro cifras del resumen a todo el ancho.
3. Debajo, dos columnas: la gráfica de reportes por mes (2/3) y "Últimos reportes" al lado (1/3).

"Últimos reportes" es una **tarjeta acotada**, no una columna de alto completo: se ven tres y el resto se alcanza con el scroll de dentro, que no arrastra la página. Antes ocupaba una columna entera y marcaba la altura de todo el panel, que era al revés de su importancia — los totales quedaban apretados en media pantalla mientras la lista se estiraba. Carga 20 en vez de 6, porque ya no empuja nada.

Debajo de la gráfica mensual, en la misma columna, va **"Estado de los reportes terminados"**: cuatro barras **verticales** con Completado, Sin documento, Sin firma y Sin orden.

La disposición final es: las dos gráficas apiladas a la izquierda y los últimos reportes al lado, ocupando el alto de las dos. **Sin `items-start`**, para que las dos columnas midan lo mismo, y la tarjeta de estado se estira (`flex-1`) hasta rellenar lo que le sobre a la izquierda. Puesta a todo el ancho debajo de las dos columnas —como estuvo un momento— arrancaba por debajo de la columna más alta y dejaba un hueco muerto de varios cientos de píxeles junto a la gráfica mensual.

Para que ese estirado funcione, `BarrasVerticales` ocupa el alto que le den (`h-full`, área de dibujo con `flex-1` y un `min-h` para que no se aplaste) en vez de tener una altura fija.

- Los cuatro números **no suman el total y se dice en pantalla**: un reporte al que le falten el documento y la firma sale en las dos barras. Sin la aclaración, cualquiera intentaría cuadrarlos contra el total y creería que hay un error.
- "Completado" es el terminado al que no le falta nada: adjunto, firma y número de orden.
- Aquí sí se usan colores de estado —verde lo que está bien, ámbar lo que falta— porque las categorías tienen valencias distintas, a diferencia de los repartos de la página de analíticas, donde todas las barras miden lo mismo y van de un solo color. Comprobados con el validador contra las dos superficies.
- El mínimo del 2% de ancho que hace visibles los valores pequeños **se excluye para el cero**: pintaba una astilla de color que se leía como "hay poquito" cuando lo correcto es que no haya nada.
- **El ancho de cada columna está limitado a 80px.** Repartido el espacio entre cuatro, cada barra salía de 256px de ancho por 192 de alto: más ancha que alta, que deja de leerse como una columna y pasa a ser un bloque de color — justo el "thick saturated block" que la guía marca como error.
- Las barras llegan como mucho al 86% del alto para dejar sitio a la cifra que va encima. Recortar así la escala no induce a error porque el valor va escrito en cada barra: no hay que medirlo contra un eje.

`items-start` en esa rejilla para que cada tarjeta mida lo suyo: estiradas a la misma altura, la de la gráfica quedaba con un hueco vacío debajo del dibujo. `ReportList` gana `unaColumna` porque su rejilla de dos columnas dejaba las tarjetas ilegibles en el hueco lateral.

**Analíticas** (`/admin/analiticas/[empresa]`). Nueva sección con submenú desplegable en el rail. La empresa va en la ruta y no en un parámetro de consulta porque es una pantalla distinta por empresa, no un filtro sobre la misma. Las opciones del submenú salen de las empresas reales, así que una tercera aparecería sola.

Contenido: cifras (total, terminados, en proceso, sin orden), reportes por mes de los últimos 12, reparto por tipo de servicio y por etiqueta, clientes con más reportes, y pendientes. Todo agregado en SQL — traer las filas para contarlas en memoria funcionaría hoy y dejaría de funcionar sin avisar con miles de reportes.

Decisiones de la gráfica, siguiendo la guía de visualización:

- **Los meses sin reportes se rellenan a cero.** SQL solo devuelve los meses con filas; pintar eso tal cual haría desaparecer del eje un mes sin trabajo en vez de mostrarlo como un valle.
- **El último tramo va punteado.** El mes en curso siempre vale menos que los cerrados, así que la línea terminaba en una caída que se lee como un derrumbe. El trazo discontinuo es la convención para "esto no está cerrado", y el tooltip lo dice: "(en curso)".
- **Una sola serie, sin leyenda** — el título ya dice qué se mira.
- **Las barras van todas del mismo color.** Lo que distingue una de otra es su nombre, escrito al lado; un color por barra añadiría un código que no significa nada. El valor va escrito, así que no hace falta pasar el puntero para leerlo.
- Colores comprobados con el validador de la guía contra las dos superficies de tarjeta (`#ffffff` y `#151518`).

### Fase 10.8: identidad de Eng-Support y modo único

**La aplicación es solo oscura.** No hay modo claro, ni conmutador, ni variante según la preferencia del sistema. Antes convivían los dos y cada color necesitaba su pareja; ahora hay un único juego de variables y lo que se define en `globals.css` es lo que se ve. `color-scheme: dark` en `:root` para que el navegador pinte en oscuro también lo que no controlamos con CSS —barras de desplazamiento, desplegables nativos—; sin eso, quien tenga el sistema en claro vería barras blancas alrededor de una aplicación negra.

**Logotipo.** El cliente entregó la versión blanca sobre transparente. La azul se **genera** desde ella (`scripts/generar-logos.ts`) tiñendo el canal alfa: el dibujo es de un solo color plano —94% blanco puro, el resto grises del antialiasing—, así que la forma vive entera en la transparencia. Las dos salen del mismo archivo y no pueden desincronizarse. El azul de marca, `#2256AA`, se midió contando los píxeles del logotipo original de su web, no a ojo sobre una captura.

El recorte del monograma no usa un porcentaje fijo: busca la primera franja de columnas transparentes, que es el hueco entre la S y la palabra, y sigue siendo correcto si cambian el logotipo por otro de distinta proporción.

En la interfaz se usa la versión clara, por el modo único. La azul se conserva para el membrete del PDF y el favicon, que van sobre blanco.

**Pantalla de ingreso** partida en dos: formulario a la izquierda y panel de marca a la derecha, oculto por debajo de `lg` —en el celular no caben las dos mitades y lo que no puede faltar es el formulario—.

- El titular escala por **consultas de contenedor** y no por ancho de ventana: al aparecer el panel, la columna pasa a ser media pantalla, así que una ventana ancha puede tener una columna estrecha. Cada umbral es el ancho que ese tamaño necesita, medido.
- En celular el titular se queda grande y parte en dos líneas, a propósito: ahí sobra alto y lo que hace falta es presencia. El encogido solo entra a partir de `lg`.
- Los campos encienden el borde al pasar el puntero. El campo de texto es el único elemento de la página sin forma de pulsable, y esa respuesta es la que dice que sí lo es.
- **Autorrelleno del navegador**: Chrome repinta esos campos con su propio fondo y su propia tipografía. En modo oscuro quedaba un recuadro claro en medio de la pantalla negra. El fondo no se puede sobrescribir con `background-color` —el navegador lo aplica por encima—; la sombra interior gigante sí lo tapa.

### Fase 11: idioma de la interfaz (español, inglés, portugués)

Traduce **la aplicación**, no el contenido: los reportes que escriben los operarios (proyecto, cliente, detalles) se guardan y se muestran tal cual, en el idioma en que se escribieron. Traducirlos automáticamente reescribiría un registro de trabajo con valor probatorio. El PDF tampoco se traduce — sale siempre en español, sea cual sea el idioma de quien lo descarga, porque es una constancia, no parte de la interfaz.

**`next-intl`**, elegido porque el sistema tiene bastantes cadenas con conteo ("1 adjunto" / "3 adjuntos") y las reglas de plural cambian entre idiomas — escribirlo a mano son condicionales repartidos por todas partes; next-intl lo resuelve con formato ICU (`{count, plural, =0 {...} one {...} other {...}}`). Sin enrutado por idioma (`/en/reportes`): es una herramienta interna con sesión, nadie comparte enlaces por idioma, y meterlo en la ruta habría obligado a mover todas las páginas bajo `[locale]` para nada.

**El idioma vive en la cuenta** (`users.locale`), no en la sesión JWT. La cuenta es la fuente de verdad — sigue a la persona a cualquier navegador donde inicie sesión —, y una cookie de solo lectura (`IDIOMA_COOKIE`, un año de vida, no atada a la sesión) es la copia rápida que `i18n/request.ts` lee en cada petición sin tocar la base. Se descartó llevarlo en el JWT: `getCurrentUser()` ya consulta la base en cada petición (para poder desactivar una cuenta al instante), así que duplicar el dato en el token solo habría reintroducido el problema de datos obsoletos que ese diseño evita.

Al cambiar de idioma (`actions/idioma.ts`) se escribe en los dos sitios y se llama a `revalidatePath("/", "layout")`: un solo segmento no bastaría porque el idioma se resuelve en el layout raíz, que envuelve tanto `/login` como toda la aplicación autenticada.

**Costo real, no oculto**: `/login` y `/_not-found` pasan de estáticas a dinámicas. Leer la cookie del idioma en `i18n/request.ts` obliga a Next a renderizar esas páginas en cada petición — rompe la optimización que el propio código de `/login` documentaba ("se puede pre-renderizar y servir desde el CDN"). Es el precio de que el login recuerde el último idioma elegido antes de que exista sesión.

Verificado en navegador con Playwright en los tres idiomas: cambio de idioma, persistencia tras recargar, fechas con `Intl` según la región (`es-CO` / `en-US` / `pt-BR`), plural cero ("Sem anexos"), catálogo de etiquetas por id (Eléctrico/Electrical/Elétrico), y que el cambio tarda ~2s en aplicarse del todo porque revalida una página con varias consultas — aceptable para una acción infrecuente.

**Alcance de esta fase — traducido:** rail, barra superior (con el selector de idioma junto a la cuenta), menú de cuenta, ingreso, perfil y cambio de contraseña, panel del administrador completo (alertas, cifras, gráficas, tarjetas de estadística), lista y tarjetas de reportes, insignias de estado y clasificación, paginación.

**Deliberadamente fuera, para una fase siguiente:** el detalle de un reporte, el formulario de crear/editar, el panel de filtros (`filter-panel.tsx`), `/admin/usuarios`, viáticos y adjuntos, el detalle de analíticas por empresa, y los mensajes de validación que vienen incrustados en los esquemas Zod (`lib/validation.ts`) — traducirlos exige reconstruir cada esquema por idioma, un trabajo aparte del de las pantallas. `lib/moneda.ts` tampoco cambia: la cifra de los viáticos sigue en formato `es-CO` en las tres versiones, porque ese componente no se tocó en esta fase.

## Problema abierto: firmar con el dedo en celular

**Estado: sin resolver.** Con mouse en PC funciona correctamente; con el dedo en celular no se dibuja.

Causas ya descartadas (las correcciones se dejaron aplicadas, porque todas eran fallos reales aunque no fueran *el* fallo):

1. El evento `resize` de la ventana borraba el canvas. En un móvil se dispara al ocultarse la barra de direcciones, es decir al tocar la pantalla. Se cambió por `ResizeObserver` sobre el canvas, y solo se redimensiona si el tamaño cambió de verdad.
2. El navegador interpretaba el trazo como desplazamiento. Se añadió `touch-action: none` en línea y `preventDefault()`.
3. Los listeners de React se registran en la raíz del documento, demasiado tarde para cancelar el gesto. Se pasaron a `addEventListener` sobre el canvas con `{ passive: false }`.
4. `pointerleave` se disparaba al capturar el puntero, cerrando el trazo al instante. Se dejó de escuchar.

**Siguiente paso cuando se retome:** hace falta el modelo de teléfono y el navegador, y depurar con el dispositivo conectado (inspector remoto de Safari o `chrome://inspect`). Sin poder reproducirlo, seguir corrigiendo causas plausibles no es eficiente.

**Mientras tanto no bloquea nada:** el flujo alternativo que el cliente ya había planteado funciona — firmar en papel y subir el documento como adjunto. La alerta de "falta firma" sigue señalando los reportes terminados sin firmar.

## Pendientes por decidir (al final del proyecto)

Dos temas planteados por el cliente que se dejan aparcados a propósito, para no interrumpir el orden de construcción. Ninguno bloquea lo que falta.

### A. PDF del reporte firmado — RESUELTO (ver Fase 10.3)

El cliente quiere poder extraer el reporte firmado como PDF. Hay dos formas y la elección depende del uso real:

| | Cómo funciona | Cuándo conviene |
|---|---|---|
| **Generar al descargar** *(recomendado)* | Un botón "Descargar PDF" arma el documento en el momento, con los datos actuales | Uso normal: siempre coincide con lo que muestra el sistema, no ocupa almacenamiento y no hay copias que se desincronicen |
| **Congelar al firmar** | Se genera y guarda el PDF en el instante de firmar, y queda inmutable | Uso legal o contractual: sirve como constancia de **qué se firmó exactamente**, aunque el reporte se edite después |

El riesgo de guardarlo al firmar es que alguien edite el reporte más tarde —corrija el cliente, cambie los detalles— y el PDF guardado deje de coincidir con el sistema: dos versiones de la verdad. Si el uso es contractual, ese "congelado" es justamente lo que se busca, y entonces conviene guardar ambos.

**Falta confirmar con el cliente para qué usan el PDF.**

### B. Enlace para que un tercero firme

Enviar a un cliente externo un enlace donde vea el reporte completo y solo pueda firmarlo. Es viable: un enlace con token firmado que autoriza **una sola acción sobre un solo reporte**, sin crear una cuenta ni dar acceso al resto del sistema.

Puntos a resolver cuando se aborde:

- **Vencimiento** (7 días es lo habitual): sin caducidad, un enlace filtrado sirve para siempre.
- **Un solo uso**: se invalida al firmar.
- **Página aislada**: sin barra de navegación ni acceso a la lista, al panel ni a otros reportes.
- **Envío**: por correo hace falta sumar un servicio (Resend). Alternativa sin dependencias: el sistema genera el enlace y lo envía la persona por su cuenta.
- **Alcance legal**: sigue siendo firma simple (nombre + fecha), no firma digital certificada.

Tamaño estimado: similar a la fase de adjuntos.

## Verificación

- `npm run dev` y recorrer el flujo completo: login como empleado → crear reporte → subir 2 archivos → firmar → marcar Terminado → cerrar sesión → login como admin → ver ese reporte en la lista global.
- **Prueba del flujo de alertas** (el requisito nuevo):
  - Empleado crea un reporte, lo marca Terminado **sin adjuntar nada** → debe ver el aviso al marcarlo, y la etiqueta "Falta documento" en su lista.
  - El admin entra a `/admin` → el contador de incompletos incluye ese reporte, y el filtro "Solo incompletos" lo muestra.
  - El empleado sube el PDF → el reporte desaparece del contador de incompletos sin necesidad de ninguna acción manual del admin.
  - Borrar el único adjunto de un reporte terminado → vuelve a aparecer como incompleto.
- **Pruebas negativas explícitas** (esto es lo que realmente valida el requisito de seguridad):
  - Empleado A intenta abrir `/reportes/<id-de-empleado-B>` → debe recibir 403/404, no el reporte.
  - Empleado intenta entrar a `/admin` escribiendo la URL → redirigido, sin ver nada.
  - Petición a una Server Action sin cookie de sesión → rechazada.
  - Copiar la URL de descarga de un adjunto y abrirla en una ventana sin sesión → rechazada.
  - 6 intentos de login fallidos → cuenta bloqueada temporalmente.
  - Subir un `.exe` renombrado a `.pdf` → rechazado por validación de MIME en el servidor.
- **Pruebas de rendimiento con datos reales.** Script `npm run seed:demo` que genera 2.000 reportes repartidos entre varios empleados, con adjuntos. Sobre esos datos, ya desplegado en Vercel:
  - Abrir `/admin/reportes` desde el celular con 4G simulado → la lista debe pintarse rápido y el scroll no debe trabarse.
  - Buscar y filtrar → respuesta inmediata, sin congelar la interfaz.
  - Lighthouse en móvil sobre la lista y el detalle; revisar sobre todo el peso transferido.
  - Medir la primera petición después de varios minutos sin uso (el arranque en frío real) y compararla con las siguientes.
  - Confirmar en el panel de Vercel que Fluid Compute está activo y que la región de las funciones coincide con la de Turso.
- Build de producción (`npm run build`) sin errores de TypeScript antes de desplegar.
