# 🔍 Script para Verificar y Corregir Estructura de Base de Datos

Este script Node.js verifica y corrige automáticamente la estructura de la base de datos.

## 📋 Qué Hace

1. **Verifica columna `imagen`**: Comprueba si permite NULL y la corrige si es necesario
2. **Verifica foreign keys**: Revisa que las relaciones estén correctas
3. **Limpia datos inconsistentes**: Corrige asientos con mesa_id inexistente
4. **Establece imagen por defecto**: Para eventos sin imagen
5. **Muestra reporte detallado**: Te indica qué se corrigió

## 🚀 Cómo Usar

### Opción 1: Desde el Servidor (Recomendado)

```bash
# 1. Conectarse al servidor
ssh root@159.198.42.80

# 2. Ir al directorio del backend
cd ~/backentradas

# 3. Hacer pull de los cambios (si subiste el script a git)
git pull origin main

# 4. Ejecutar el script
node scripts/verificar-y-corregir-estructura-bd.js
```

### Opción 2: Ejecutar Directamente

```bash
cd ~/backentradas
node scripts/verificar-y-corregir-estructura-bd.js
```

## ✅ Resultado Esperado

El script mostrará:

```
========================================
VERIFICACIÓN Y CORRECCIÓN DE BASE DE DATOS
========================================

✅ Conexión a la base de datos establecida

1. Verificando columna "imagen" en tabla "eventos"...
   Columna encontrada: imagen
   Permite NULL: YES  ← Debe ser YES
   ✅ La columna ya permite NULL

2. Verificando foreign keys...
   ✅ Foreign key de mesa_id encontrada

3. Verificando datos inconsistentes...
   ✅ No hay datos inconsistentes

4. Verificación final...
   ✅ La estructura está correcta. El error no debería aparecer.
```

## 🔧 Si el Script Muestra Errores

Si el script muestra que la columna aún NO permite NULL:

1. Verifica permisos de MySQL:
   ```bash
   mysql -u root -p -e "SHOW GRANTS FOR 'root'@'localhost';"
   ```

2. Intenta ejecutar manualmente:
   ```bash
   mysql -u root -p entradas_db
   ```
   Luego:
   ```sql
   ALTER TABLE eventos MODIFY imagen VARCHAR(255) NULL DEFAULT NULL;
   ```

3. Verifica que la tabla existe:
   ```sql
   DESCRIBE eventos;
   ```

## 📝 Después de Ejecutar

Después de ejecutar el script:

1. Reinicia el backend:
   ```bash
   pm2 restart backend
   ```

2. Prueba crear un evento desde el frontend

3. Verifica los logs:
   ```bash
   pm2 logs backend --lines 20
   ```

El error "Column 'imagen' cannot be null" NO debería aparecer.

## 🐛 Troubleshooting

### Error: "Cannot find module 'mysql2'"

```bash
cd ~/backentradas
npm install
```

### Error: "Access denied for user"

Verifica el archivo `.env`:
```bash
cat .env | grep DB_
```

### Error: "Table doesn't exist"

Verifica que la base de datos existe:
```bash
mysql -u root -p -e "SHOW DATABASES;"
```

