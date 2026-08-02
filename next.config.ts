import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `sharp` trae un binario nativo. Si el empaquetador intenta analizarlo
   * como código normal, el worker de compilación de Next se cae (visto en
   * dev como "Jest worker encountered N child process exceptions"). Esto le
   * dice que lo deje tal cual y lo cargue en tiempo de ejecución.
   */
  serverExternalPackages: ["sharp"],

  experimental: {
    /**
     * Las subidas viajan dentro de una Server Action. El límite por defecto es
     * de 1 MB, insuficiente para un PDF escaneado. Se sube a 5 MB, que es lo
     * máximo aprovechable: en Vercel el cuerpo de una petición a una función no
     * puede pasar de 4,5 MB. Por eso el tope por archivo son 4 MB
     * (src/lib/archivos.ts).
     */
    serverActions: { bodySizeLimit: "5mb" },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // El navegador no debe adivinar el tipo de un recurso: evita que un
          // archivo subido termine interpretándose como HTML y ejecutándose.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nadie puede meter el sistema dentro de un iframe: cierra el
          // clickjacking, donde se superpone una página falsa sobre la real.
          { key: "X-Frame-Options", value: "DENY" },
          // Al salir hacia otro sitio no se filtra la ruta completa, que puede
          // contener el identificador de un reporte.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Esta aplicación no usa cámara, micrófono ni ubicación.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Obliga a HTTPS durante un año. Solo tiene efecto en producción; en
          // localhost el navegador lo ignora.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
