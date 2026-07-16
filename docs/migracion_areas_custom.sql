ALTER TABLE areas_layout ADD COLUMN celdas_excluidas JSON NULL DEFAULT NULL COMMENT 'Arreglo JSON con celdas borradas manualmente [{"r": 1, "c": 2}, ...]';
