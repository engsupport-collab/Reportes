import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import { TIPOS_SERVICIO_IDS } from "@/lib/etiquetas";
import { REPORT_STATUSES, USER_ROLES } from "@/lib/roles";

export { REPORT_STATUSES, USER_ROLES };
export type { ReportStatus, UserRole } from "@/lib/roles";

/**
 * Las dos empresas del grupo.
 *
 * El identificador es la propia sigla ("corp", "saas") en vez de un UUID: se
 * lee en la base sin tener que cruzar tablas, aparece legible en las URLs, y
 * permitió que la migración pudiera asignar las filas que ya existían.
 *
 * Es una tabla y no un campo de texto con dos valores fijos porque el nombre
 * visible tiene que poder cambiarse sin tocar código, y porque agregar una
 * tercera sucursal debe ser insertar una fila, no una migración.
 */
export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
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
 * muchos a muchos: alguien puede trabajar solo en Corp, solo en SaaS, o en las
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

    projectName: text("project_name").notNull(),
    // Opcional: algunos trabajos no tienen orden de compra todavía cuando se
    // registra el reporte. A diferencia de "sin documento" o "sin firma", esto
    // no depende del estado — se marca "Sin orden" apenas falta, esté en
    // proceso o terminado, porque es un dato administrativo, no de avance del
    // trabajo.
    purchaseOrderNo: text("purchase_order_no"),
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
 * Viáticos de un reporte: gastos del trabajo, cada uno con su foto (recibo o
 * evidencia) y un monto opcional — opcional porque el monto casi siempre ya se
 * lee en la propia foto, y no vale la pena obligar a transcribirlo dos veces.
 *
 * Es una tabla aparte de `attachments` y no una variante de esa misma tabla
 * porque tiene un campo propio (`amount`) que no aplica a evidencia genérica, y
 * porque mezclar los dos ahí complicaría el conteo de "sin documento" del
 * reporte, que solo debe mirar la evidencia del trabajo, no los recibos.
 */
export const reportViaticos = sqliteTable(
  "report_viaticos",
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
    // En pesos, sin decimales. Null cuando no se transcribió el monto.
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
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type ReportTag = typeof reportTags.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type Viatico = typeof reportViaticos.$inferSelect;
export type NewViatico = typeof reportViaticos.$inferInsert;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
