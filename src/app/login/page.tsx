import type { Metadata } from "next";

import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Ingresar · Gestor de Reportes",
};

/**
 * Pantalla de ingreso.
 *
 * Es la única ruta pública del sistema y no consulta la base de datos, así que
 * Next.js la puede pre-renderizar y servir desde el CDN. Eso importa: es la
 * primera pantalla que ve cualquiera, y si tarda, la aplicación entera se
 * percibe lenta. Ver PLAN.md, sección 7.1.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">
            GR
          </div>
          <h1 className="text-xl font-semibold text-text">
            Gestor de Reportes
          </h1>
          <p className="mt-1 text-sm text-muted">
            Ingresa con las credenciales que te dio el administrador
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Sistema interno. El acceso queda registrado.
        </p>
      </div>
    </main>
  );
}
