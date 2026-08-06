import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { ESTADOS_COTIZACION } from "@/lib/cotizaciones";
import { TIPOS_SERVICIO_IDS } from "@/lib/etiquetas";
import { IDIOMAS } from "@/lib/idiomas";
import { MONEDAS } from "@/lib/moneda";
import { REPORT_EVENT_TYPES, REPORT_STATUSES, USER_ROLES } from "@/lib/roles";

export { REPORT_STATUSES, USER_ROLES };
export type { ReportStatus, UserRole } from "@/lib/roles";

/**
 * Las dos empresas del grupo.
 *
 * El identificador es una cadena corta ("corp", "saas") en vez de un UUID: se
 * lee en la base sin tener que cruzar tablas, aparece legible en las URLs, y
 * permitió que la migración pudiera asignar las filas que ya existían.
 *
 * Ya no coincide con el nombre visible —hoy son "LLC" y "SAS", las siglas
 * reales de cada sociedad— y no se renombró a propósito: el id es la llave
 * foránea de cada reporte y de cada acceso de usuario, así que cambiarlo
 * obligaría a reescribir todas esas filas para que nadie note la diferencia.
 *
 * Es una tabla y no un campo de texto con dos valores fijos porque el nombre
 * visible tiene que poder cambiarse sin tocar código, y porque agregar una
 * tercera sucursal debe ser insertar una fila, no una migración.
 */
export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  /**
   * Moneda en la que esta empresa cotiza y cobra — determina cómo se
   * formatea cada monto de sus cotizaciones y viáticos (agrupamiento de
   * miles, decimales). LLC ("corp") factura en dólares; SAS, en pesos
   * colombianos, que por eso queda como valor por defecto.
   */
  currency: text("currency", { enum: MONEDAS }).notNull().default("COP"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * Usuarios del sistema. No hay registro público: las cuentas las crea un admin.
 * `failed_attempts` y `locked_until` implementan el bloqueo por fuerza bruta
 * sin depender de Redis ni de ningún servicio externo.
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull().default("empleado"),
    /**
     * Idioma de la interfaz, elegido por la propia persona.
     *
     * Va en la cuenta y no en la URL: es una herramienta interna con sesión, y
     * nadie comparte enlaces por idioma. Metido en la ruta obligaría a mover
     * todas las páginas bajo `[lang]` y rompería las direcciones existentes,
     * a cambio de nada.
     */
    locale: text("locale", { enum: IDIOMAS }).notNull().default("es"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("users_role_idx").on(table.role)],
);

/**
 * A qué empresas puede entrar cada usuario.
 *
 * Es una tabla aparte y no una columna en `users` porque la relación es de
 * muchos a muchos: alguien puede trabajar solo en LLC, solo en SAS, o en las
 * dos. Con una columna habría que inventar valores como "ambas", y agregar una
 * tercera empresa obligaría a rehacerlo.
 */
export const userCompanies = sqliteTable(
  "user_companies",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.companyId] }),
    index("user_companies_company_idx").on(table.companyId),
  ],
);

/**
 * Catálogo de clientes, por empresa.
 *
 * Antes `quotes.clientName` era texto libre, y el mismo cliente terminaba
 * escrito de formas distintas — el mismo problema que ya resolvió el catálogo
 * de cotizaciones para `projectName`. Un cliente pertenece a una sola empresa
 * (LLC o SAS): son dos entidades legales en países distintos, y es muy poco
 * probable que compartan cliente — igual que ya están separadas las
 * cotizaciones, los reportes y los accesos de usuario.
 *
 * Sin restricción de unicidad en `name`: el selector ya evita los duplicados
 * accidentales por escritura libre (que era el problema real), y forzar
 * unicidad en la base castigaría variantes legítimas del mismo nombre legal
 * (con o sin sufijo societario, mayúsculas). Mismo criterio que
 * `quotes.quoteNumber`.
 *
 * `isActive` y no borrado real: un cliente desactivado sale del selector de
 * cotizaciones nuevas, pero las cotizaciones que ya lo usan lo siguen
 * mostrando — igual que `companies.isActive`.
 */
export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("clients_company_active_idx").on(table.companyId, table.isActive),
  ],
);

/**
 * Contador de números de cotización, uno por año.
 *
 * SQLite no tiene secuencias, así que esta tabla es la secuencia: guarda el
 * último valor entregado de cada año y se incrementa con un `INSERT ... ON
 * CONFLICT DO UPDATE ... RETURNING`, una sola sentencia que reserva el número
 * y lo devuelve. Dos peticiones simultáneas se serializan en el bloqueo de
 * escritura de SQLite, así que es imposible que reciban el mismo valor.
 *
 * Es lo que sustituye a mirar la propia tabla `quotes` para decidir el
 * siguiente número. Cualquier variante de eso —`MAX + 1`, `COUNT + 1`, buscar
 * el primer hueco— tiene el mismo defecto de fondo: la respuesta depende de
 * qué filas existan en ese instante, así que borrar una cotización libera su
 * número y dos documentos distintos pueden acabar llamándose igual. El
 * contador solo avanza; un número entregado no vuelve nunca, exista o no la
 * cotización que lo usó.
 *
 * Que queden huecos (por una cotización borrada, o por un guardado que falló)
 * es el comportamiento correcto, no un defecto: es lo mismo que hace una
 * secuencia de Postgres.
 */
export const quoteSequences = sqliteTable("quote_sequences", {
  /** El año del prefijo, p. ej. 2026 en "Q2026_001". */
  year: integer("year").primaryKey(),
  /** Último consecutivo entregado para ese año. Nunca retrocede. */
  lastValue: integer("last_value").notNull(),
});

/**
 * Cotizaciones: la fuente oficial de qué trabajos existen.
 *
 * Antes esta información vivía en un Excel y el técnico copiaba a mano el
 * proyecto y el cliente en cada reporte, con el resultado de que el mismo
 * proyecto aparecía escrito de tres formas. Ahora el reporte se crea eligiendo
 * una cotización de esta tabla.
 *
 * `quoteNumber` es ÚNICO en la base, no solo en el código: la unicidad de un
 * número de cotización es una regla del negocio, y el único sitio donde se
 * puede garantizar de verdad es aquí. Dos administradores escribiendo el mismo
 * número a la vez pasan las dos validaciones de la aplicación —cada una mira
 * un instante en el que el otro todavía no ha guardado— y solo el índice los
 * separa.
 *
 * Sigue admitiendo null, y eso convive con el índice: en SQLite un índice
 * único deja pasar tantos nulos como haga falta. Es lo que necesitan las
 * cotizaciones antiguas que se crearon antes de que existiera la numeración
 * automática.
 *
 * Nota para una carga masiva desde el Excel del cliente: ese control lleva
 * números repetidos a propósito (una cotización con varias entregas mensuales
 * comparte número), así que una importación tal cual chocaría contra este
 * índice. Si llega ese momento, esas entregas son filas de otra tabla que
 * cuelga de la cotización, no cotizaciones distintas con el mismo nombre.
 */
export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),

    quoteNumber: text("quote_number"),
    projectName: text("project_name").notNull(),
    /**
     * Referencia al catálogo, NO una copia del nombre — a diferencia de como
     * un reporte copia sus datos de la cotización. Una cotización es un
     * documento de trabajo interno, no una constancia firmada por el
     * cliente: si el admin corrige el nombre en el catálogo, tiene sentido
     * que se vea reflejado aquí. Mismo criterio que ya rige `companyId` en
     * esta misma tabla, que tampoco copia el nombre de la empresa.
     *
     */
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),

    /**
     * En qué fase está el trabajo — y solo eso. NO codifica quién creó la
     * cotización ni si está validada: de eso se encarga `revisada`.
     *
     * Nace "en curso" venga de donde venga. Si la registró un admin, es la
     * autoridad y no hay a quién pedirle permiso; si la creó un técnico en
     * campo, el trabajo ya está ocurriendo y bloquearlo sería devolverlo al
     * problema que este módulo vino a resolver — queda marcada `revisada:
     * false` y sigue su curso mientras el admin la valida.
     *
     * "Pendiente por autorización" sigue disponible para elegirlo a mano,
     * para el caso real de estar esperando el visto bueno del cliente.
     */
    status: text("status", { enum: ESTADOS_COTIZACION })
      .notNull()
      .default("en_curso"),

    // Llega después de que el cliente autoriza. Null mientras tanto — que es
    // justo el caso de la autorización verbal, donde el trabajo ya arrancó.
    purchaseOrderNo: text("purchase_order_no"),
    /** Fecha comprometida de entrega. */
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    description: text("description"),
    /** Valor cotizado, en pesos y sin decimales. Opcional. */
    amount: integer("amount"),

    /**
     * Falsa solo en las cotizaciones creadas por un técnico desde campo, que
     * nacen con lo mínimo (proyecto y cliente) y necesitan que un admin las
     * complete. Es lo que alimenta el filtro "sin revisar" del panel.
     */
    revisada: integer("revisada", { mode: "boolean" }).notNull().default(true),

    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    // El selector del técnico filtra siempre por empresa y estado; el panel del
    // admin agrega el filtro de "sin revisar".
    uniqueIndex("quotes_quote_number_unique").on(table.quoteNumber),
    index("quotes_company_status_idx").on(table.companyId, table.status),
    index("quotes_company_revisada_idx").on(table.companyId, table.revisada),
    index("quotes_project_idx").on(table.projectName),
    index("quotes_client_idx").on(table.clientId),
  ],
);

/**
 * Un reporte por trabajo terminado.
 *
 * El estado "incompleto" (terminado pero sin adjuntos) NO se guarda aquí:
 * se calcula al consultar, en src/lib/queries/reports.ts. Un campo almacenado
 * se desincronizaría en cuanto alguien subiera o borrara un adjunto.
 */
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    /**
     * Empresa a la que pertenece el reporte.
     *
     * El valor por defecto "corp" existe únicamente porque la migración tuvo
     * que asignar una empresa a los reportes que ya estaban creados. El código
     * siempre lo escribe de forma explícita, tomándolo de la empresa activa en
     * la sesión — nunca de un dato enviado por el navegador.
     */
    companyId: text("company_id")
      .notNull()
      .default("corp")
      .references(() => companies.id, { onDelete: "restrict" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    /**
     * Servicio o viáticos. Se elige antes de crear el reporte y no cambia
     * después: son dos formularios distintos, con campos que no tienen
     * equivalente en el otro (un reporte de viáticos no tiene orden de compra
     * ni firma; uno de servicio no tiene gastos). Por defecto "servicio"
     * porque así eran todos los reportes antes de que existiera esta columna.
     */
    type: text("type", { enum: ["servicio", "viaticos"] })
      .notNull()
      .default("servicio"),
    /**
     * @deprecated Legado de cuando un reporte de viáticos colgaba del reporte
     * de servicio que justificaba, en vez de colgar directamente de la
     * cotización. Ahora los dos son hermanos independientes bajo el mismo
     * `quoteId` — la información interna de viáticos no debe depender de (ni
     * viajar junto con) el reporte que sí llega al cliente. Se deja la
     * columna sin usar en vez de reconstruir la tabla para quitarla: no
     * estorba, y todas las filas existentes ya se migraron a `quoteId`.
     */
    linkedReportId: text("linked_report_id").references(
      (): AnySQLiteColumn => reports.id,
      { onDelete: "set null" },
    ),

    /**
     * A qué cotización pertenece este reporte. `onDelete: "set null"` y no
     * `cascade`: borrar la cotización no debe borrar el registro de un
     * trabajo que sí se hizo. Null en los reportes de viáticos y en los de
     * servicio creados antes de que existiera el módulo de cotizaciones.
     */
    quoteId: text("quote_id").references(() => quotes.id, {
      onDelete: "set null",
    }),

    /**
     * `projectName`, `purchaseOrderNo`, `quoteNumber` y `clientName` son la
     * COPIA de esos mismos datos en la cotización, tomada al crear el
     * reporte — no una referencia en vivo. Es deliberado: un reporte que el
     * cliente ya firmó es una constancia, y no debe cambiar si después se
     * corrige la cotización. La única excepción es la revisión de una
     * cotización creada en campo (ver `revisarCotizacionAction`), y solo
     * alcanza a los reportes de ese origen que todavía no estén firmados.
     */
    projectName: text("project_name").notNull(),
    // Opcional: algunos trabajos no tienen orden de compra todavía cuando se
    // registra el reporte. A diferencia de "sin documento" o "sin firma", esto
    // no depende del estado — se marca "Sin orden" apenas falta, esté en
    // proceso o terminado, porque es un dato administrativo, no de avance del
    // trabajo.
    purchaseOrderNo: text("purchase_order_no"),
    // Número de cotización. Obligatorio por formulario para un reporte de
    // servicio; admite null solo por los reportes creados antes de existir
    // este campo. No aplica a un reporte de viáticos.
    quoteNumber: text("quote_number"),
    clientName: text("client_name").notNull(),
    workDate: integer("work_date", { mode: "timestamp_ms" }).notNull(),
    // Opcional a propósito: el detalle es una ayuda para quien lee el reporte
    // después, no un requisito. A diferencia de la orden de compra, su
    // ausencia no se marca con ninguna alerta.
    details: text("details"),

    /**
     * Eléctrico o mecánico. Excluyente: un reporte es de uno o del otro.
     * Admite null solo por los reportes creados antes de existir este campo;
     * el formulario lo exige.
     */
    serviceType: text("service_type", { enum: TIPOS_SERVICIO_IDS }),

    status: text("status", { enum: REPORT_STATUSES })
      .notNull()
      .default("en_proceso"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),

    signatureUrl: text("signature_url"),
    signatureName: text("signature_name"),
    // Correo de quien firma: recibe una copia del reporte (con sus fotos)
    // por un enlace seguro con caducidad al momento de firmar. Obligatorio
    // por formulario desde que existe este campo; admite null solo por los
    // reportes firmados antes.
    signatureEmail: text("signature_email"),
    signedAt: integer("signed_at", { mode: "timestamp_ms" }),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // Rastro de quién editó por última vez: el admin puede editar reportes ajenos.
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    // Todas las consultas filtran por empresa, así que los índices que más
    // importan la llevan como primera columna.
    index("reports_company_created_idx").on(table.companyId, table.createdAt),
    index("reports_company_author_idx").on(table.companyId, table.authorId),
    index("reports_company_status_idx").on(table.companyId, table.status),
    index("reports_company_service_idx").on(table.companyId, table.serviceType),
    index("reports_work_date_idx").on(table.workDate),
    index("reports_purchase_order_idx").on(table.purchaseOrderNo),
    index("reports_type_idx").on(table.companyId, table.type),
    index("reports_linked_report_idx").on(table.linkedReportId),
    index("reports_quote_idx").on(table.quoteId),
  ],
);

/**
 * Bitácora de auditoría de un reporte — servicio o viáticos por igual, no hay
 * una tabla distinta por tipo.
 *
 * Es una tabla de EVENTOS y no columnas en `reports` a propósito: una columna
 * como "finalizado por / cuándo" solo guardaría el último evento de esa
 * clase, y un reporte reabierto y cerrado varias veces perdería el rastro de
 * las veces anteriores. Aquí cada evento es una fila nueva que nunca se
 * sobrescribe ni se borra.
 *
 * Diseñada como bitácora genérica, no acoplada a "cambios de estado": hoy
 * solo se usa para `REPORT_EVENT_TYPES` (finalizado/reabierto), pero la forma
 * —tipo, quién, cuándo, motivo, y `metadata` para lo que no quepa en las
 * columnas anteriores— sirve para cualquier evento de auditoría que este
 * reporte necesite en el futuro, sin tocar el modelo otra vez.
 *
 * `motivo` hoy solo tiene contenido en los eventos "reabierto" —se pide al
 * administrador al reabrir, pero no es obligatorio—; un evento "finalizado"
 * no lo pide. `metadata` no se usa todavía: queda reservada para el día que
 * un evento necesite datos propios que no encajen en `motivo`.
 */
export const reportEvents = sqliteTable(
  "report_events",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: REPORT_EVENT_TYPES }).notNull(),
    // `set null` y no `restrict`: si la cuenta de quien hizo el evento se
    // borra algún día, el hecho de que ocurrió no debe desaparecer con ella
    // — el evento sobrevive, solo pierde a quién apuntaba.
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    motivo: text("motivo"),
    /** JSON sin usar todavía. Ver el comentario de la tabla. */
    metadata: text("metadata"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("report_events_report_idx").on(table.reportId, table.createdAt),
  ],
);

/**
 * Etiquetas del trabajo: preventivo, urgencia, online, proyecto.
 *
 * Se guardan como filas y no como una lista dentro del reporte porque hay que
 * poder filtrar los mantenimientos ya hechos por su etiqueta. Con una lista
 * dentro de un campo de texto, filtrar obligaría a recorrer todos los reportes
 * y mirar dentro de cada uno; así basta un índice.
 *
 * El tipo de servicio (eléctrico / mecánico) NO está aquí: es excluyente, así
 * que va como columna del reporte, donde la base impide marcar los dos a la vez.
 * El catálogo de valores vive en src/lib/etiquetas.ts.
 */
export const reportTags = sqliteTable(
  "report_tags",
  {
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.tag] }),
    index("report_tags_tag_idx").on(table.tag),
  ],
);

/**
 * Archivos adjuntos de un reporte (evidencia del trabajo).
 *
 * `blobUrl` apunta a Vercel Blob con acceso privado; nunca se expone al cliente.
 * Las descargas pasan por /api/archivos/[id], que verifica permisos primero.
 * `thumbnailUrl` es la miniatura generada en el navegador antes de subir, para
 * que las listas no tengan que cargar fotos de 5 MB. Null en PDF y documentos.
 */
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("attachments_report_idx").on(table.reportId)],
);

/**
 * Cada fila es un gasto dentro de un reporte de tipo "viaticos": qué se gastó
 * (`concepto`), cuánto (`amount`) y cuándo (`fechaGasto`), con su foto (recibo
 * o evidencia) como respaldo. `reportId` apunta al reporte contenedor —el de
 * tipo "viaticos"—, no al reporte de servicio que justifica: ese enlace vive
 * en `reports.linkedReportId`, un nivel más arriba.
 *
 * `concepto`, `fechaGasto` y `amount` admiten null solo por los viáticos
 * creados antes de existir estos campos (cuando el monto era opcional y no
 * había concepto ni fecha propios); el formulario los exige desde ahora.
 *
 * Es una tabla aparte de `attachments` y no una variante de esa misma tabla
 * porque tiene campos propios que no aplican a evidencia genérica, y porque
 * mezclar los dos ahí complicaría el conteo de "sin documento" del reporte de
 * servicio, que solo debe mirar la evidencia del trabajo, no los recibos.
 */
export const reportViaticos = sqliteTable(
  "report_viaticos",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    concepto: text("concepto"),
    fechaGasto: integer("fecha_gasto", { mode: "timestamp_ms" }),
    blobUrl: text("blob_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // En pesos, sin decimales. Null solo en filas creadas antes de que el
    // monto fuera obligatorio.
    amount: integer("amount"),
    uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("report_viaticos_report_idx").on(table.reportId)],
);

/**
 * Intentos de ingreso fallidos por dispositivo (IP).
 *
 * El contador de la tabla `users` bloquea una cuenta concreta, pero no detiene
 * a quien prueba muchos usuarios distintos desde el mismo equipo: cada fallo
 * cae en una fila diferente y ninguno llega al límite. Esta tabla cierra ese
 * hueco contando por origen, sin importar qué usuario se haya escrito.
 *
 * Las dos protecciones son complementarias y se conservan ambas: esta frena el
 * rociado desde un equipo; la de `users` frena el ataque distribuido contra una
 * cuenta concreta desde muchas IPs.
 */
export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    ip: text("ip").primaryKey(),
    failedCount: integer("failed_count").notNull().default(0),
    firstAttemptAt: integer("first_attempt_at", {
      mode: "timestamp_ms",
    }).notNull(),
    lastAttemptAt: integer("last_attempt_at", {
      mode: "timestamp_ms",
    }).notNull(),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  },
  (table) => [index("login_attempts_last_idx").on(table.lastAttemptAt)],
);

export type Company = typeof companies.$inferSelect;
export type UserCompany = typeof userCompanies.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type ReportTag = typeof reportTags.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type Viatico = typeof reportViaticos.$inferSelect;
export type NewViatico = typeof reportViaticos.$inferInsert;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
