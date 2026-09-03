/**
 * Copia los datos de Turso a Cloud SQL (PostgreSQL), una sola vez.
 *
 *   npm run migrar:datos            -> Turso dev  -> Postgres dev
 *   npm run migrar:datos -- --prod  -> Turso prod -> Postgres prod
 *
 * Se ejecuta después de aplicar el esquema nuevo (`npm run db:migrate`) contra
 * la base de Postgres vacía. Respeta el orden de las claves foráneas: cada
 * tabla se inserta después de las que referencia.
 *
 * `login_attempts` NO se copia a propósito: es estado transitorio de
 * bloqueo por fuerza bruta, sin valor histórico — empezar en blanco es lo
 * correcto, no un descuido.
 */
import { createClient } from "@libsql/client";
import type { Row } from "@libsql/client";

import { crearClienteScript } from "./db-cliente";
import { anunciar, cargarCredenciales } from "./entorno";
import * as schema from "../src/db/schema";

/** epoch-ms (o null) -> Date (o null). Así guardaba la hora SQLite. */
function aFecha(v: unknown): Date | null {
  return v === null || v === undefined ? null : new Date(Number(v));
}

/** 0/1 (entero de SQLite) -> boolean real. */
function aBooleano(v: unknown): boolean {
  return Number(v) === 1;
}

async function leerTabla(
  turso: ReturnType<typeof createClient>,
  nombre: string,
): Promise<Row[]> {
  const res = await turso.execute(`SELECT * FROM ${nombre}`);
  return res.rows;
}

async function main() {
  const credencialesPg = cargarCredenciales(process.argv);
  anunciar(credencialesPg);

  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  if (!tursoUrl || !tursoToken) {
    throw new Error(
      "Faltan TURSO_DATABASE_URL / TURSO_AUTH_TOKEN — hacen falta para leer " +
        "de la base vieja, aunque la app ya no los use para funcionar.",
    );
  }

  const turso = createClient({ url: tursoUrl, authToken: tursoToken });
  const { db, pool, cerrar } = await crearClienteScript(credencialesPg);

  // Todo en una transacción: si algo falla a mitad de camino, no queda una
  // migración a medias en la base de destino.
  await pool.query("BEGIN");
  try {
    const companies = await leerTabla(turso, "companies");
    if (companies.length > 0) {
      await db.insert(schema.companies).values(
        companies.map((r) => ({
          id: String(r.id),
          name: String(r.name),
          isActive: aBooleano(r.is_active),
          currency: r.currency as "USD" | "COP",
          createdAt: aFecha(r.created_at)!,
        })),
      );
    }
    console.log(`companies: ${companies.length}`);

    const users = await leerTabla(turso, "users");
    if (users.length > 0) {
      await db.insert(schema.users).values(
        users.map((r) => ({
          id: String(r.id),
          username: String(r.username),
          passwordHash: String(r.password_hash),
          fullName: String(r.full_name),
          role: r.role as "admin" | "empleado" | "contable",
          locale: r.locale as "es" | "en" | "pt",
          isActive: aBooleano(r.is_active),
          failedAttempts: Number(r.failed_attempts),
          lockedUntil: aFecha(r.locked_until),
          createdAt: aFecha(r.created_at)!,
          updatedAt: aFecha(r.updated_at)!,
        })),
      );
    }
    console.log(`users: ${users.length}`);

    const userCompanies = await leerTabla(turso, "user_companies");
    if (userCompanies.length > 0) {
      await db.insert(schema.userCompanies).values(
        userCompanies.map((r) => ({
          userId: String(r.user_id),
          companyId: String(r.company_id),
          createdAt: aFecha(r.created_at)!,
        })),
      );
    }
    console.log(`user_companies: ${userCompanies.length}`);

    const clients = await leerTabla(turso, "clients");
    if (clients.length > 0) {
      await db.insert(schema.clients).values(
        clients.map((r) => ({
          id: String(r.id),
          companyId: String(r.company_id),
          name: String(r.name),
          isActive: aBooleano(r.is_active),
          createdBy: String(r.created_by),
          createdAt: aFecha(r.created_at)!,
          updatedAt: aFecha(r.updated_at)!,
        })),
      );
    }
    console.log(`clients: ${clients.length}`);

    const quoteSequences = await leerTabla(turso, "quote_sequences");
    if (quoteSequences.length > 0) {
      await db.insert(schema.quoteSequences).values(
        quoteSequences.map((r) => ({
          year: Number(r.year),
          lastValue: Number(r.last_value),
        })),
      );
    }
    console.log(`quote_sequences: ${quoteSequences.length}`);

    const quotes = await leerTabla(turso, "quotes");
    if (quotes.length > 0) {
      await db.insert(schema.quotes).values(
        quotes.map((r) => ({
          id: String(r.id),
          companyId: String(r.company_id),
          quoteNumber: r.quote_number as string | null,
          projectName: String(r.project_name),
          clientId: String(r.client_id),
          status: r.status as (typeof schema.quotes.$inferSelect)["status"],
          purchaseOrderNo: r.purchase_order_no as string | null,
          dueDate: aFecha(r.due_date),
          description: r.description as string | null,
          amount: r.amount === null ? null : Number(r.amount),
          revisada: aBooleano(r.revisada),
          createdBy: String(r.created_by),
          createdAt: aFecha(r.created_at)!,
          updatedAt: aFecha(r.updated_at)!,
          updatedBy: r.updated_by as string | null,
        })),
      );
    }
    console.log(`quotes: ${quotes.length}`);

    const reports = await leerTabla(turso, "reports");
    if (reports.length > 0) {
      await db.insert(schema.reports).values(
        reports.map((r) => ({
          id: String(r.id),
          companyId: String(r.company_id),
          authorId: String(r.author_id),
          type: r.type as "servicio" | "viaticos",
          linkedReportId: r.linked_report_id as string | null,
          quoteId: r.quote_id as string | null,
          projectName: String(r.project_name),
          purchaseOrderNo: r.purchase_order_no as string | null,
          quoteNumber: r.quote_number as string | null,
          clientName: String(r.client_name),
          workDate: aFecha(r.work_date)!,
          details: r.details as string | null,
          serviceType: r.service_type as
            | (typeof schema.reports.$inferSelect)["serviceType"]
            | null,
          status: r.status as "en_proceso" | "terminado",
          completedAt: aFecha(r.completed_at),
          signatureUrl: r.signature_url as string | null,
          signatureName: r.signature_name as string | null,
          signatureEmail: r.signature_email as string | null,
          signedAt: aFecha(r.signed_at),
          createdAt: aFecha(r.created_at)!,
          updatedAt: aFecha(r.updated_at)!,
          updatedBy: r.updated_by as string | null,
        })),
      );
    }
    console.log(`reports: ${reports.length}`);

    const reportEvents = await leerTabla(turso, "report_events");
    if (reportEvents.length > 0) {
      await db.insert(schema.reportEvents).values(
        reportEvents.map((r) => ({
          id: String(r.id),
          reportId: String(r.report_id),
          tipo: r.tipo as "finalizado" | "reabierto",
          userId: r.user_id as string | null,
          motivo: r.motivo as string | null,
          metadata: r.metadata as string | null,
          createdAt: aFecha(r.created_at)!,
        })),
      );
    }
    console.log(`report_events: ${reportEvents.length}`);

    const reportTags = await leerTabla(turso, "report_tags");
    if (reportTags.length > 0) {
      await db.insert(schema.reportTags).values(
        reportTags.map((r) => ({
          reportId: String(r.report_id),
          tag: String(r.tag),
        })),
      );
    }
    console.log(`report_tags: ${reportTags.length}`);

    const attachments = await leerTabla(turso, "attachments");
    if (attachments.length > 0) {
      await db.insert(schema.attachments).values(
        attachments.map((r) => ({
          id: String(r.id),
          reportId: String(r.report_id),
          blobUrl: String(r.blob_url),
          thumbnailUrl: r.thumbnail_url as string | null,
          fileName: String(r.file_name),
          mimeType: String(r.mime_type),
          sizeBytes: Number(r.size_bytes),
          uploadedAt: aFecha(r.uploaded_at)!,
        })),
      );
    }
    console.log(`attachments: ${attachments.length}`);

    const reportViaticos = await leerTabla(turso, "report_viaticos");
    if (reportViaticos.length > 0) {
      await db.insert(schema.reportViaticos).values(
        reportViaticos.map((r) => ({
          id: String(r.id),
          reportId: String(r.report_id),
          concepto: r.concepto as string | null,
          fechaGasto: aFecha(r.fecha_gasto),
          blobUrl: String(r.blob_url),
          thumbnailUrl: r.thumbnail_url as string | null,
          fileName: String(r.file_name),
          mimeType: String(r.mime_type),
          sizeBytes: Number(r.size_bytes),
          amount: r.amount === null ? null : Number(r.amount),
          uploadedAt: aFecha(r.uploaded_at)!,
        })),
      );
    }
    console.log(`report_viaticos: ${reportViaticos.length}`);

    await pool.query("COMMIT");
    console.log("\nMigración de datos completada.");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    turso.close();
    await cerrar();
  }
}

main().catch((error) => {
  console.error("Error al migrar los datos:", error);
  process.exit(1);
});
