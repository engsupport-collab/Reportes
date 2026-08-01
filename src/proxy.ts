import { NextResponse, type NextRequest } from "next/server";

import { rutaInicio } from "@/lib/roles";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Primera barrera de acceso.
 *
 * Solo verifica la firma del token: no consulta la base de datos, para poder
 * correr en Edge Runtime y no encarecer todas las peticiones. La autorización
 * de verdad (¿este usuario puede ver este reporte?) vive en src/lib/auth-guard.ts
 * y se aplica dentro de cada página y cada Server Action.
 *
 * Dicho de otro modo: esto decide si alguien pasa la puerta. Lo que puede tocar
 * una vez adentro se decide en el servidor, no aquí.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  // Ya autenticado y entrando a /login: se lo manda a su vista.
  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(
        new URL(rutaInicio(session.role), request.url),
      );
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    // Se recuerda a dónde iba, para llevarlo ahí después de iniciar sesión.
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Sesión de empleado sin empresa elegida: no hay forma de saber qué datos
  // mostrar. Se manda al selector, que es la única página accesible en ese
  // estado. La comprobación de que el usuario realmente pertenece a esa empresa
  // se hace en el servidor, contra la base — aquí solo se mira si eligió.
  //
  // El admin queda fuera de esta regla a propósito: no elige empresa, nunca
  // pasa por /empresas, y `session.empresa` va a estar vacío siempre para su
  // rol — eso no significa que le falte elegir nada.
  if (session.role !== "admin" && !session.empresa && pathname !== "/empresas") {
    return NextResponse.redirect(new URL("/empresas", request.url));
  }

  // Zona de administración: un empleado que escriba la URL a mano no entra.
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/reportes", request.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Se excluyen los recursos estáticos y /api.
   *
   * Las rutas de /api no quedan desprotegidas: cada route handler llama a su
   * propio guard. Se dejan fuera del middleware porque necesitan responder con
   * 401/403 en JSON, no con una redirección a una página de login.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
