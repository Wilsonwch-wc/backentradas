# 🔧 Script para Corregir Restricciones de Base de Datos

Este script corrige problemas comunes de restricciones en la base de datos.

## 📋 Problemas que Corrige

1. **Columna `imagen` en eventos**: Permite NULL para evitar errores cuando no se sube imagen
2. **Foreign keys en asientos**: Verifica que las relaciones estén correctamente configuradas
3. **Datos inconsistentes**: Limpia asientos que referencian mesas inexistentes

## 🚀 Cómo Usar

### Opción 1: Desde el Servidor (Recomendado)

```bash
# 1. Conectarse al servidor
ssh root@159.198.42.80

# 2. Ir al directorio del backend
cd ~/backentradas

# 3. Hacer pull de los cambios (si subiste el script a git)
git pull origin main

# 4. Ejecutar el script SQL
mysql -u root -p entradas_db < scripts/corregir_restricciones_bd.sql
```

### Opción 2: Ejecutar Manualmente

```bash
# En el servidor
cd ~/backentradas
mysql -u root -p entradas_db < scripts/corregir_restricciones_bd.sql
```

### Opción 3: Copiar y Pegar en MySQL

```bash
# Conectarse a MySQL
mysql -u root -p

# Seleccionar la base de datos
USE entradas_db;

# Copiar y pegar el contenido del archivo corregir_restricciones_bd.sql
# O ejecutar:
source scripts/corregir_restricciones_bd.sql
```

## ✅ Verificar que Funcionó

Después de ejecutar el script, verifica:

```bash
# Verificar estructura de la columna imagen
mysql -u root -p -e "USE entradas_db; DESCRIBE eventos;" | grep imagen

# Debe mostrar que imagen permite NULL

# Verificar foreign keys
mysql -u root -p -e "USE entradas_db; SHOW CREATE TABLE asientos\G" | grep -A 5 "FOREIGN KEY"
```

## 📝 Notas Importantes

- ✅ El script es **seguro ejecutarlo múltiples veces** (idempotente)
- ✅ **NO elimina datos**, solo modifica la estructura
- ✅ Verifica antes de modificar, así que es seguro
- ⚠️ Si tienes datos importantes, haz un backup antes:

```bash
# Hacer backup antes de ejecutar
mysqldump -u root -p entradas_db > backup_antes_correccion_$(date +%Y%m%d_%H%M%S).sql
```

## 🔍 Qué Hace el Script

1. **Modifica columna `imagen`**: Permite NULL en lugar de ser obligatoria
2. **Verifica foreign keys**: Asegura que las relaciones estén correctas
3. **Limpia datos inconsistentes**: Establece `mesa_id` a NULL en asientos que referencian mesas inexistentes
4. **Muestra reporte final**: Te indica qué se corrigió y qué datos inconsistentes había

## 🐛 Si Hay Errores

Si el script muestra errores:

1. Verifica que estás usando la base de datos correcta: `entradas_db`
2. Verifica que tienes permisos de administrador en MySQL
3. Revisa los logs del script para ver qué falló

## 📞 Después de Ejecutar

Después de ejecutar el script:

1. Reinicia el backend (si está corriendo):
   ```bash
   pm2 restart backend
   ```

2. Prueba crear un evento sin imagen (debería funcionar ahora)

3. Prueba crear asientos (debería funcionar correctamente)

