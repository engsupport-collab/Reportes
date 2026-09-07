-- Las dos empresas del sistema.
--
-- No son datos de usuario sino parte del esquema en la práctica: sus ids
-- ("corp" y "saas") están escritos como literales por todo el código, y cada
-- usuario, reporte y cotización los referencia por clave foránea. Una base sin
-- estas dos filas no es una base vacía, es una base rota.
--
-- Estaban en las migraciones de SQLite (0002_ancient_randall) y se perdieron al
-- regenerar el esquema para PostgreSQL: desde entonces existían solo porque el
-- script de migración de datos las copió desde Turso. Cualquiera que
-- reconstruyera la base desde cero -CI, o una recuperación ante desastre- se
-- quedaba sin ellas.
--
-- ON CONFLICT DO NOTHING para que aplicarla sobre las bases que ya existen
-- (desarrollo y producción) no toque nada: los nombres y monedas actuales
-- mandan sobre lo que diga este archivo.
INSERT INTO "companies" ("id", "name", "currency") VALUES ('corp', 'LLC', 'USD')
	ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "companies" ("id", "name", "currency") VALUES ('saas', 'SAS', 'COP')
	ON CONFLICT ("id") DO NOTHING;
