#!/bin/bash

# ========================================
# Script para Ejecutar Corrección de BD
# ========================================
# Este script ejecuta la corrección de restricciones de la BD
# Uso: ./ejecutar_correccion.sh
# ========================================

set -e  # Salir si hay algún error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Corrección de Restricciones de BD${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "scripts/corregir_restricciones_bd.sql" ]; then
    echo -e "${RED}Error: No se encuentra el archivo scripts/corregir_restricciones_bd.sql${NC}"
    echo "Asegúrate de estar en el directorio del backend (~/backentradas)"
    exit 1
fi

# Verificar que MySQL está disponible
if ! command -v mysql &> /dev/null; then
    echo -e "${RED}Error: MySQL no está instalado o no está en el PATH${NC}"
    exit 1
fi

# Preguntar si hacer backup
echo -e "${YELLOW}¿Deseas hacer un backup antes de ejecutar la corrección? (s/n)${NC}"
read -r respuesta

if [[ "$respuesta" =~ ^[Ss]$ ]]; then
    BACKUP_FILE="backup_antes_correccion_$(date +%Y%m%d_%H%M%S).sql"
    echo -e "${GREEN}Creando backup: $BACKUP_FILE${NC}"
    mysqldump -u root -p entradas_db > "$BACKUP_FILE"
    echo -e "${GREEN}✓ Backup creado exitosamente${NC}"
    echo ""
fi

# Ejecutar el script SQL
echo -e "${GREEN}Ejecutando corrección de restricciones...${NC}"
echo ""

mysql -u root -p entradas_db < scripts/corregir_restricciones_bd.sql

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ Corrección ejecutada exitosamente${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Recomendación: Reinicia el backend con:${NC}"
    echo "  pm2 restart backend"
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}✗ Error al ejecutar la corrección${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi

