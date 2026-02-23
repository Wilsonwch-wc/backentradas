import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  obtenerUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  obtenerRoles,
  crearRol,
  actualizarRol,
  eliminarRol,
  borrarTodosLosDatos
} from '../controllers/usuariosController.js';

const router = express.Router();

// Todas las rutas requieren autenticación y ser admin
router.use(verifyToken);
router.use(requireAdmin);

// Obtener todos los usuarios
router.get('/', obtenerUsuarios);

// Obtener todos los roles
router.get('/roles', obtenerRoles);
// Crear rol
router.post('/roles', crearRol);
// Actualizar rol
router.put('/roles/:id', actualizarRol);
// Eliminar rol
router.delete('/roles/:id', eliminarRol);

// Obtener un usuario por ID
router.get('/:id', obtenerUsuarioPorId);

// Crear un nuevo usuario
router.post('/', crearUsuario);

// Actualizar un usuario
router.put('/:id', actualizarUsuario);

// Eliminar un usuario
router.delete('/:id', eliminarUsuario);

// Borrar todos los datos (excepto usuarios y roles)
router.delete('/datos/todos', borrarTodosLosDatos);

export default router;

