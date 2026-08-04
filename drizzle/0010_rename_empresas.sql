-- Nombres visibles de las dos empresas: pasan a las siglas reales de cada
-- sociedad. "SAS" es la colombiana y "LLC" la de Estados Unidos — es como el
-- cliente las nombra en su propia hoja de control (la columna COL/USA).
--
-- Solo cambia el nombre que se muestra. Los identificadores siguen siendo
-- 'corp' y 'saas': están en la llave foránea de cada reporte y de cada acceso
-- de usuario, y renombrarlos obligaría a reescribir todas esas filas sin que
-- nadie note la diferencia en pantalla.
UPDATE `companies` SET `name` = 'LLC' WHERE `id` = 'corp';--> statement-breakpoint
UPDATE `companies` SET `name` = 'SAS' WHERE `id` = 'saas';
