export const getUserData = () => {
  const token = localStorage.getItem('vulntrack_token');
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
};

export const getUserRole = () => {
  const data = getUserData();
  return data ? data.rol : null;
};

// Autorizacion por PERMISOS (RBAC) replicando la logica del backend
// (backend/src/middlewares/roleMiddleware.js -> autorizarRoles):
//  - Concede si el rol es ADMINISTRADOR, o si los permisos incluyen 'ALL'.
//  - Si no, concede cuando para alguno de los requeridos: rol === p
//    o permisos.includes(p).
//
// Solo controla la UX (mostrar/ocultar controles). La seguridad real la
// impone SIEMPRE el backend; aqui usamos los MISMOS strings que el backend
// pasa a autorizarRoles. Mapeo accion -> permiso requerido:
//   activos crear/editar/eliminar      -> 'GESTOR_ACTIVOS'
//   vulnerabilidades crear/eliminar     -> 'AUDITOR'
//   riesgos registrar/auto-evaluar      -> 'ANALISTA_SEGURIDAD'
//   remediacion crear plan              -> 'ANALISTA_SEGURIDAD', 'AUDITOR'
//   importacion excel                   -> 'ADMINISTRADOR' (solo admin en backend)
//   usuarios crear/editar/eliminar      -> 'ADMINISTRADOR'
//   roles crear/editar/eliminar         -> 'EDITAR_ROLES'
export const tienePermiso = (...requeridos) => {
  const data = getUserData();
  if (!data) return false;
  const { rol, permisos } = data;
  if (rol === 'ADMINISTRADOR' || (Array.isArray(permisos) && permisos.includes('ALL'))) {
    return true;
  }
  return requeridos.some(p => rol === p || (Array.isArray(permisos) && permisos.includes(p)));
};
