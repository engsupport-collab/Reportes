CREATE TABLE `quote_sequences` (
	`year` integer PRIMARY KEY NOT NULL,
	`last_value` integer NOT NULL
);
--> statement-breakpoint
-- Siembra: el contador arranca donde llegó la numeración que ya existe.
--
-- Sin esto la secuencia empezaría en 1 y volvería a entregar números que ya
-- están en uso, que es justo lo que viene a impedir. Se toma el MÁXIMO de cada
-- año una sola vez, aquí, y a partir de ahora nadie vuelve a mirar la tabla
-- `quotes` para decidir el siguiente número.
--
-- GLOB y no LIKE: distingue mayúsculas y permite clases de caracteres, así que
-- solo entran los números con el formato de la casa ("Q" + 4 dígitos + "_" +
-- dígitos). Cualquier número escrito a mano con otra forma queda fuera y no
-- descuadra el contador.
INSERT INTO `quote_sequences` (`year`, `last_value`)
SELECT
	CAST(substr(`quote_number`, 2, 4) AS INTEGER),
	MAX(CAST(substr(`quote_number`, 7) AS INTEGER))
FROM `quotes`
WHERE `quote_number` GLOB 'Q[0-9][0-9][0-9][0-9]_[0-9]*'
GROUP BY CAST(substr(`quote_number`, 2, 4) AS INTEGER);
