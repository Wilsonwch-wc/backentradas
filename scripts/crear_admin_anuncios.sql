-- ═══════════════════════════════════════════════════
-- Script: Crear cuenta de administrador de AnunciosYA
-- Correo: reviewiasit@gmail.com
-- ═══════════════════════════════════════════════════
USE entradas_db;

-- Verificar si ya existe la cuenta con ese correo
INSERT INTO usuarios (
  nombre_usuario, nombre_completo, apellidos, correo,
  telefono, ubicacion, auth_provider, activo, id_rol, password
)
SELECT
  'reviewadmin',
  'Administrador',
  'AnunciosYA',
  'reviewiasit@gmail.com',
  NULL,
  'Cochabamba',
  'local',
  1,
  1,  -- id_rol = 1 = admin (ajustar si es diferente)
  'admin2024@anunciosya'
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE LOWER(TRIM(correo)) = 'reviewiasit@gmail.com'
);

-- Si ya existe, asegurarse de que sea admin activo
UPDATE usuarios
SET activo = 1,
    nombre_completo = COALESCE(nombre_completo, 'Administrador'),
    updated_at = NOW()
WHERE LOWER(TRIM(correo)) = 'reviewiasit@gmail.com';

-- Verificar resultado
SELECT id, nombre_usuario, nombre_completo, correo, activo, id_rol
FROM usuarios
WHERE LOWER(TRIM(correo)) = 'reviewiasit@gmail.com';
