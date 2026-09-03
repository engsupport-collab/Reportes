-- El estado por defecto de una cotización pasa de "pendiente por autorización"
-- a "en curso".
--
-- Ese estado nunca significó un permiso interno: se refiere a la autorización
-- del cliente. Que la haya creado un técnico en campo se marca con `revisada`,
-- no con el estado — así el trabajo puede seguir mientras un admin la valida.
--
-- drizzle-kit generaba además un DROP/CREATE de todos los índices de la base
-- para este cambio; se quitaron a propósito, porque no hacen falta para
-- redefinir un DEFAULT en Turso y tocarlos todos es riesgo sin ganancia.
ALTER TABLE `quotes` ALTER COLUMN "status" TO "status" text NOT NULL DEFAULT 'en_curso';--> statement-breakpoint
-- Las que ya existen quedaron en "pendiente por autorización" únicamente por
-- el default viejo: hasta ahora no había forma de elegir otro estado al
-- crearlas. Se pasan al que les corresponde bajo la regla nueva.
UPDATE `quotes` SET `status` = 'en_curso' WHERE `status` = 'pendiente_autorizacion';
