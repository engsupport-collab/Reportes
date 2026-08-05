<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Antes de tocar nada, lee PRACTICAS.md

[`PRACTICAS.md`](./PRACTICAS.md) recoge las reglas que salieron de problemas
reales de este proyecto: dónde va un `loading.tsx` y por qué, por qué el marco
vive en un layout pero los permisos no, por qué un número de documento nunca se
deduce de la tabla, el ritual de migración y el de entrega, y la lista de
trampas de medición que ya costaron tiempo una vez.

Dos que ahorran horas si se leen antes:

- **Mide, no supongas.** Si algo "se volvió lento", construye el commit
  anterior y compara con el mismo script. Una estimación no es una medición.
- **Una comprobación que solo puede salir bien no comprueba nada.** Busca el
  contraste que descartaría un falso positivo.
