"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { hashPassword, verifyPassword } from "@/lib/password";
import { cambiarContrasenaSchema } from "@/lib/validation";

export type PerfilState = { error?: string; ok?: string };

/**
 * Cambio de contraseña del propio usuario.
 *
 * Hasta ahora la única forma de cambiar una contraseña era que un admin la
 * reseteara, lo que obliga a que la temporal viaje por WhatsApp o de viva voz
 * y quede escrita en algún lado. Con esto cada quien pone la suya sin que nadie
 * más la conozca.
 *
 * El usuario sale de la sesión, nunca de un campo del formulario: si viniera
 * del navegador, bastaría con cambiarlo para reescribir la contraseña de otra
 * persona.
 */
export async function cambiarMiContrasenaAction(
  _prevState: PerfilState,
  formData: FormData,
): Promise<PerfilState> {
  const user = await requireUser();

  const parsed = cambiarContrasenaSchema.safeParse({
    actual: String(formData.get("actual") ?? ""),
    nueva: String(formData.get("nueva") ?? ""),
    repetir: String(formData.get("repetir") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const [fila] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!fila) return { error: "No se encontró la cuenta." };

  const actualCorrecta = await verifyPassword(
    parsed.data.actual,
    fila.passwordHash,
  );
  if (!actualCorrecta) {
    return { error: "La contraseña actual no es correcta." };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.nueva),
      // Un cambio de contraseña exitoso limpia cualquier bloqueo pendiente:
      // quien demuestra saber la actual no es a quien el bloqueo apunta.
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  revalidatePath("/perfil");

  return { ok: "Contraseña actualizada." };
}
