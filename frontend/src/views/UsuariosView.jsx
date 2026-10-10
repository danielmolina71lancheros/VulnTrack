import React, { useState, useEffect } from 'react';
import { Users, Edit, Trash2, X, Plus } from 'lucide-react';
import { getUserRole } from '../utils/auth';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/apiClient';

export default function UsuariosView() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newRole, setNewRole] = useState('');
  
  const [newUser, setNewUser] = useState({
    nombre_completo: '',
    correo: '',
    password: '',
    rol: 'AUDITOR'
  });

  const [rolesList, setRolesList] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([
        apiGet('/api/usuarios'),
        apiGet('/api/roles')
      ]);

      setUsuarios(usersData);
      setRolesList(rolesData.map(r => r.nombre));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditRole = async (e) => {
    e.preventDefault();
    try {
      await apiPut(`/api/usuarios/${editingUser.id_usuario}/rol`, { rol: newRole });
      setIsEditModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error updating role:', error);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      // POST /api/usuarios endpoint needed
      await apiPost('/api/usuarios', newUser);
      setIsCreateModalOpen(false);
      setNewUser({ nombre_completo: '', correo: '', password: '', rol: 'AUDITOR' });
      fetchData();
    } catch (error) {
      console.error('Error creating user:', error);
      alert(`Error al crear usuario: ${error.message || 'Desconocido'}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro que desea eliminar este usuario?')) return;
    try {
      await apiDelete(`/api/usuarios/${id}`);
      fetchData();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const getRoleBadgeColor = (rol) => {
    switch (rol) {
      case 'ADMINISTRADOR': return 'bg-purple-100 text-purple-800';
      case 'ANALISTA_SEGURIDAD': return 'bg-blue-100 text-blue-800';
      case 'GESTOR_ACTIVOS': return 'bg-green-100 text-green-800';
      case 'REMEDIADOR': return 'bg-orange-100 text-orange-800';
      case 'AUDITOR': return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-3">
          <Users className="w-8 h-8 text-brand-primary" />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Gestión de Usuarios</h1>
        </div>
        {getUserRole() === 'ADMINISTRADOR' && (
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center space-x-2 bg-brand-primary hover:bg-brand-secondary text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Usuario</span>
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="text-center py-10">Cargando usuarios...</div>
        ) : usuarios.length === 0 ? (
          <div className="text-center py-10 text-gray-500">No se encontraron usuarios.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-light dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-sm border-b">
                  <th className="px-6 py-4 font-medium">Nombre</th>
                  <th className="px-6 py-4 font-medium">Correo</th>
                  <th className="px-6 py-4 font-medium">Rol</th>
                  <th className="px-6 py-4 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usuarios.map((user) => (
                  <tr key={user.id_usuario} className="hover:bg-brand-light dark:hover:bg-gray-900 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{user.nombre_completo}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{user.correo}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-xs rounded-full font-medium ${getRoleBadgeColor(user.rol)}`}>
                        {user.rol?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center space-x-2">
                      {getUserRole() === 'ADMINISTRADOR' ? (
                        <>
                          <button 
                            onClick={() => {
                              setEditingUser(user);
                              setNewRole(user.rol);
                              setIsEditModalOpen(true);
                            }}
                            className="p-2 text-brand-primary hover:bg-brand-accent/20 rounded-lg transition-colors"
                            title="Editar rol"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(user.id_usuario)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs">Sin permisos</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">Crear Nuevo Usuario</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre Completo</label>
                <input required type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-brand-primary outline-none" value={newUser.nombre_completo} onChange={e => setNewUser({...newUser, nombre_completo: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correo Electrónico</label>
                <input required type="email" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-brand-primary outline-none" value={newUser.correo} onChange={e => setNewUser({...newUser, correo: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña</label>
                <input required type="password" minLength="6" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-brand-primary outline-none" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol Inicial</label>
                <select required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-brand-primary outline-none" value={newUser.rol} onChange={e => setNewUser({...newUser, rol: e.target.value})}>
                  {rolesList.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="flex justify-end pt-4">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="mr-3 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-brand-primary hover:bg-brand-secondary text-white rounded-lg">Crear Usuario</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">Editar Rol</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">Usuario: <span className="font-semibold">{editingUser.nombre_completo}</span></div>
            <form onSubmit={handleEditRole} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nuevo Rol</label>
                <select required className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-brand-primary outline-none" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {rolesList.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="flex justify-end pt-4">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="mr-3 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-brand-primary hover:bg-brand-primary text-white rounded-lg">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
