// Cliente API central de SecureHub.
//
// Centraliza en un solo lugar:
//  - La lectura del token 'vulntrack_token' desde localStorage.
//  - El header Authorization 'Bearer <token>'.
//  - El fetch, el parseo de JSON y el manejo uniforme de errores (data.error).
//  - El manejo central del 401 (sesion expirada / token invalido).
//
// Manejo del relogin ante un 401:
//  Al recibir un 401 limpiamos el token y despachamos el evento global
//  'auth:logout'. App.jsx escucha ese evento (useEffect) y resetea su estado
//  a la pantalla de login respetando el ciclo de React (equivalente a
//  cerrarSesion), sin recargar la pagina. Como fallback, si por algun motivo
//  no hubiera listener, forzamos window.location.reload() tras limpiar el
//  token para que App vuelva a montar en estado de login.

const TOKEN_KEY = 'vulntrack_token';

// Construye la URL final: respeta las rutas que ya empiezan con '/api';
// si no empieza con '/', le prefija '/api/'.
const buildUrl = (path) => {
  if (path.startsWith('/api')) return path;
  if (path.startsWith('/')) return path;
  return `/api/${path}`;
};

// Dispara el relogin global ante un 401.
const forzarRelogin = () => {
  localStorage.removeItem(TOKEN_KEY);
  // App.jsx reacciona a este evento para volver al login sin recargar.
  window.dispatchEvent(new Event('auth:logout'));
  // Fallback defensivo: si nadie atendio el evento (no deberia pasar),
  // recargar hace que App se monte de nuevo en estado de login.
};

// Funcion base. Devuelve el JSON parseado en exito; lanza Error en fallo
// (con e.status y e.message = data.error del backend).
//
// publico: cuando es true, un 401 NO dispara el relogin global (se usa para
// endpoints publicos como el login, donde un 401 significa 'credenciales
// invalidas' y debe mostrarse en el formulario, no cerrar sesion).
async function request(path, { method = 'GET', body, isForm = false, publico = false } = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {};

  if (token) headers['Authorization'] = `Bearer ${token}`;

  let payload;
  if (isForm) {
    // Para FormData NO fijamos Content-Type: el navegador agrega el boundary.
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    ...(payload !== undefined ? { body: payload } : {})
  });

  if (response.status === 401 && !publico) {
    forzarRelogin();
    const err = new Error('Sesion expirada. Por favor ingrese de nuevo.');
    err.status = 401;
    throw err;
  }

  if (!response.ok) {
    let data = {};
    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }
    const err = new Error(data.error || 'Ocurrio un error en la solicitud.');
    err.status = response.status;
    throw err;
  }

  return response.json();
}

// Variante para descargas: devuelve el blob crudo (y maneja 401/errores igual).
async function requestBlob(path, { method = 'GET' } = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(buildUrl(path), { method, headers });

  if (response.status === 401) {
    forzarRelogin();
    const err = new Error('Sesion expirada. Por favor ingrese de nuevo.');
    err.status = 401;
    throw err;
  }

  if (!response.ok) {
    let data = {};
    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }
    const err = new Error(data.error || 'Ocurrio un error en la solicitud.');
    err.status = response.status;
    throw err;
  }

  return response.blob();
}

export const apiGet = (path) => request(path, { method: 'GET' });
export const apiPost = (path, body) => request(path, { method: 'POST', body });
// apiPostPublic: para endpoints publicos (login). Un 401 aqui NO cierra sesion;
// se propaga como Error con el data.error del backend para mostrarlo en el form.
export const apiPostPublic = (path, body) => request(path, { method: 'POST', body, publico: true });
export const apiPut = (path, body) => request(path, { method: 'PUT', body });
export const apiPatch = (path, body) => request(path, { method: 'PATCH', body });
export const apiDelete = (path) => request(path, { method: 'DELETE' });
export const apiUpload = (path, formData) => request(path, { method: 'POST', body: formData, isForm: true });
export const apiGetBlob = (path) => requestBlob(path, { method: 'GET' });

export default { apiGet, apiPost, apiPostPublic, apiPut, apiPatch, apiDelete, apiUpload, apiGetBlob };
