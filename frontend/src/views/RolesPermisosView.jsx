import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, X, CheckCircle2 } from 'lucide-react';
import { tienePermiso } from '../utils/auth';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/apiClient';

export default function RolesPermisosView() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({ id_rol: null, nombre: '', descripcion: '', permisos: [] });

  const todosLosPermisos = [
    { key: "VER_USUARIOS", label: "Ver Usuarios" },
    { key: "CREAR_USUARIOS", label: "Gestionar Usuarios (Crear/Editar)" },
    { key: "VER_ACTIVOS", label: "Ver Activos" },
    { key: "CREAR_ACTIVOS", label: "Gestionar Activos" },
    { key: "VER_VULN", label: "Ver Vulnerabilidades" },
    { key: "CREAR_VULN", label: "Gestionar Vulnerabilidades" },
    { key: "VER_RIESGOS", label: "Ver Riesgos" },
    { key: "GESTIONAR_RIESGOS", label: "Gestionar Riesgos" },
    { key: "VER_REMEDIACION", label: "Ver Planes de Acción" },
    { key: "GESTIONAR_REMEDIACION", label: "Gestionar Planes de Acción" },
    { key: "VER_AUDITORIA", label: "Ver Registros de Auditoría" },
    { key: "EDITAR_ROLES", label: "Administrar Roles y Permisos" }
  ];

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/roles');
      setRoles(data);
    } catch (error) {
      console.error("Error fetching roles:", error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (role = null) => {
    if (role) {
      setFormData({ 
        id_rol: role.id_rol, 
        nombre: role.nombre, 
        descripcion: role.descripcion, 
        permisos: typeof role.permisos === 'string' ? JSON.parse(role.permisos) : role.permisos 
      });
    } else {
      setFormData({ id_rol: null, nombre: '', descripcion: '', permisos: [] });
    }
    setIsModalOpen(true);
  };

  const togglePermiso = (permisoKey) => {
    setFormData(prev => {
      const tiene = prev.permisos.includes(permisoKey);
      if (tiene) return { ...prev, permisos: prev.permisos.filter(p => p !== permisoKey) };
      else return { ...prev, permisos: [...prev.permisos, permisoKey] };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (formData.id_rol) {
        await apiPut(`/api/roles/${formData.id_rol}`, formData);
      } else {
        await apiPost('/api/roles', formData);
      }
      setIsModalOpen(false);
      fetchRoles();
    } catch (error) {
      console.error(error);
      alert(error.message || "Error al guardar el rol");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este rol? Los usuarios con este rol perderán sus accesos.")) return;
    try {
      await apiDelete(`/api/roles/${id}`);
      fetchRoles();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <Shield className="w-8 h-8 text-brand-primary" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Roles Dinámicos y Permisos</h1>
          </div>
          <p className="text-gray-500">
            Administra los roles de acceso adaptados a las necesidades de tu empresa.
          </p>
        </div>
        {tienePermiso('EDITAR_ROLES') && (
          <button 
            onClick={() => openModal()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-secondary font-medium"
          >
            <Plus className="w-4 h-4" /> Crear Nuevo Rol
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando roles...</div>
        ) : roles.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No hay roles configurados.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {roles.map(rol => (
              <div key={rol.id_rol} className="border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{rol.nombre}</h3>
                  {rol.nombre !== 'ADMINISTRADOR' && tienePermiso('EDITAR_ROLES') && (
                    <div className="flex gap-2">
                      <button onClick={() => openModal(rol)} className="text-gray-400 hover:text-brand-primary"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(rol.id_rol)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 h-10 line-clamp-2">{rol.descripcion}</p>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Permisos asignados:</p>
                  <div className="flex flex-wrap gap-1">
                    {(typeof rol.permisos === 'string' ? JSON.parse(rol.permisos) : rol.permisos).slice(0, 5).map((p, idx) => (
                      <span key={idx} className="text-[10px] bg-brand-accent/30 text-brand-primary px-2 py-1 rounded border border-brand-accent/40">
                        {p.replace('_', ' ')}
                      </span>
                    ))}
                    {(typeof rol.permisos === 'string' ? JSON.parse(rol.permisos) : rol.permisos).length > 5 && (
                      <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">+{rol.permisos.length - 5} más</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{formData.id_rol ? 'Editar Rol' : 'Crear Rol'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:text-gray-400 p-2"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <form id="roleForm" onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del Rol</label>
                    <input 
                      required 
                      type="text" 
                      className="w-full border rounded-lg p-2 focus:ring-brand-primary outline-none uppercase" 
                      value={formData.nombre} 
                      onChange={e => setFormData({...formData, nombre: e.target.value.toUpperCase()})}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                    <input 
                      type="text" 
                      className="w-full border rounded-lg p-2 focus:ring-brand-primary outline-none" 
                      value={formData.descripcion} 
                      onChange={e => setFormData({...formData, descripcion: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 border-b pb-2">Asignación de Permisos Específicos</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {todosLosPermisos.map(perm => (
                      <label key={perm.key} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-brand-light dark:hover:bg-gray-900 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-brand-primary rounded" 
                          checked={formData.permisos.includes(perm.key)}
                          onChange={() => togglePermiso(perm.key)}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-3 bg-brand-light dark:bg-gray-900 rounded-b-xl">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-brand-light dark:hover:bg-gray-900 font-medium">Cancelar</button>
              <button type="submit" form="roleForm" className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-secondary font-medium">Guardar Rol</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
