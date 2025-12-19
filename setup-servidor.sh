#!/bin/bash

# Script de configuración rápida del servidor
# Ejecutar en el servidor VPS después de clonar el repositorio

echo "🚀 Configurando servidor para Sistema de Entradas..."
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Verificar MySQL
echo -e "${YELLOW}1️⃣ Verificando MySQL...${NC}"
if systemctl is-active --quiet mysqld; then
    echo -e "${GREEN}✅ MySQL está corriendo${NC}"
else
    echo -e "${RED}❌ MySQL no está corriendo. Iniciando...${NC}"
    sudo systemctl start mysqld
    sudo systemctl enable mysqld
fi

# 2. Crear base de datos (si no existe)
echo -e "${YELLOW}2️⃣ Creando base de datos...${NC}"
mysql -u root -p${MYSQL_ROOT_PASSWORD:-69O3cH8IFpO3Qtp1Yw} <<EOF
CREATE DATABASE IF NOT EXISTS entradas_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Base de datos creada o ya existe${NC}"
else
    echo -e "${RED}❌ Error al crear base de datos${NC}"
    echo "Por favor crea la base de datos manualmente:"
    echo "mysql -u root -p"
    echo "CREATE DATABASE entradas_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    exit 1
fi

# 3. Importar SQL (si existe el archivo)
if [ -f "entradas_db.sql" ]; then
    echo -e "${YELLOW}3️⃣ Importando estructura de base de datos...${NC}"
    mysql -u root -p${MYSQL_ROOT_PASSWORD:-69O3cH8IFpO3Qtp1Yw} entradas_db < entradas_db.sql
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Base de datos importada correctamente${NC}"
    else
        echo -e "${RED}❌ Error al importar base de datos${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Archivo entradas_db.sql no encontrado${NC}"
    echo "   Puedes importarlo manualmente más tarde:"
    echo "   mysql -u root -p entradas_db < entradas_db.sql"
fi

# 4. Verificar archivo .env
echo -e "${YELLOW}4️⃣ Verificando archivo .env...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Archivo .env no existe. Creándolo...${NC}"
    cat > .env <<EOF
# Base de Datos
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=69O3cH8IFpO3Qtp1Yw
DB_NAME=entradas_db

# Servidor
PORT=5000
HOST=0.0.0.0

# JWT Secret (CAMBIA ESTO POR UNO SEGURO)
JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n')
EOF
    echo -e "${GREEN}✅ Archivo .env creado${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANTE: Revisa y ajusta las credenciales en .env${NC}"
else
    echo -e "${GREEN}✅ Archivo .env ya existe${NC}"
fi

# 5. Instalar dependencias
echo -e "${YELLOW}5️⃣ Instalando dependencias de Node.js...${NC}"
if [ -f "package.json" ]; then
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Dependencias instaladas${NC}"
    else
        echo -e "${RED}❌ Error al instalar dependencias${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ package.json no encontrado${NC}"
    exit 1
fi

# 6. Verificar instalación
echo ""
echo -e "${GREEN}✅ Configuración completada!${NC}"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Revisa el archivo .env y ajusta las credenciales si es necesario"
echo "   2. Inicia el servidor: npm start"
echo "   3. O usa PM2 para producción: pm2 start index.js --name entradas-backend"
echo ""
echo "🔍 Para verificar:"
echo "   curl http://localhost:5000/api/health"
echo ""

