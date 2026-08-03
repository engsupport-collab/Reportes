"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser, setIdiomaCookie } from "@/lib/auth-guard";
import { esIdiomaValido } from "@/lib/idiomas";

/**
 * Cambia el idioma de la interfaz.
 *
 * Escribe en los dos sitios: la cuenta (para que el idioma siga a la persona
 * a cualquier navegador donde inicie sesión) y la cookie (para que el cambio
 * se vea de inmediato, sin esperar a la próxima vez que inicie sesión).
 *
 * `revalidatePath("/", "layout")` y no solo la página actual: el idioma se
 * resuelve en el layout raíz, que envuelve tanto /login como toda la
 * aplicación autenticada — un solo segmento no bastaría para refrescar los
 * dos.
 */
export async function cambiarIdiomaAction(idioma: string) {
  if (!esIdiomaValido(idioma)) return;

  const user = await requireUser();

  await db
    .update(users)
    .set({ locale: idioma })
    .where(eq(users.id, user.id));

  await setIdiomaCookie(idioma);
  revalidatePath("/", "layout");
}
