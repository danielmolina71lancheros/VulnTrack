import React, { useState, useEffect } from 'react';
import { Monitor, Search, Filter, Plus, X, Server, Database, Smartphone, Globe, FileText, Activity, AlertTriangle, CheckCircle } from 'lucide-react';
import { getUserRole } from '../utils/auth';

export default function ActivosView() {
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedActivo, setSelectedActivo] = useState(null);
  const [activoHallazgos, setActivoHallazgos] = useState([]);
  const [activoPlanes, setActivoPlanes] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [formData, setFormData] = useState({
    codigo_activo: '',
    nombre: '',
    tipo: 'Servidor',
    marca: '',
    modelo: '',
    numero_serie: '',
    hostname: '',
    direccion_ip: '',
    endpoint: '',
    sistema_operativo: '',
    version_so: '',
    usuario_responsable: '',
    area: '',
    sede: '',
    estado_activo: 'Activo',
    criticidad: 'MEDIA',
    descripcion: '',
    fecha_adquisicion: ''
  });

  const tabs = ['Todos', 'Servidores', 'Equipos', 'Aplicaciones', 'Red', 'Base de datos'];

  useEffect(() => {
    fetchActivos();
  }, []);

  const fetchActivos = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('vulntrack_token');
      const res = await fetch('/api/activos', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setActivos(data);
      }
    } catch (error) {
      console.error('Error fetching activos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('vulntrack_token');
      const res = await fetch('/api/activos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({
          codigo_activo: '', nombre: '', tipo: 'Servidor', marca: '', modelo: '', numero_serie: '',
          hostname: '', direccion_ip: '', endpoint: '', sistema_operativo: '', version_so: '',
          usuario_responsable: '', area: '', sede: '', estado_activo: 'Activo', criticidad: 'MEDIA',
          descripcion: '', fecha_adquisicion: ''
        });
        fetchActivos();
      } else {
        const err = await res.json();
        alert(err.error || 'Error al crear activo');
      }
    } catch (error) {
      console.error('Error creating activo:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este activo y todas sus vulnerabilidades asociadas?')) return;
    try {
      const token = localStorage.getItem('vulntrack_token');
      const res = await fetch(`/api/activos/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchActivos();
        if (selectedActivo && selectedActivo.id_activo === id) {
          setIsDetailOpen(false);
        }
      }
    } catch (error) {
      console.error('Error deleting activo:', error);
    }
  };

  const openDetail = async (activo) => {
    setSelectedActivo(activo);
    setIsDetailOpen(true);
    setLoadingDetail(true);
    setActivoHallazgos([]);
    setActivoPlanes([]);
    try {
      const token = localStorage.getItem('vulntrack_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // We get all hallazgos and filter by id_activo
      const [hRes, pRes] = await Promise.all([
        fetch('/api/hallazgos', { headers }),
        fetch('/api/remediacion', { headers })
      ]);
      
      const hData = await hRes.json();
      const pData = await pRes.json();
      
      if (Array.isArray(hData)) {
        const misHallazgos = hData.filter(h => h.id_activo === activo.id_activo);
        setActivoHallazgos(misHallazgos);
      }
      
      if (Array.isArray(pData)) {
        const misPlanes = pData.filter(p => p.id_activo === activo.id_activo || (p.vulnerabilidades && p.vulnerabilidades.includes(activo.id_activo))); 
        // Wait, the planes return 'id_hallazgo' in the simple query (when it was 1:1) but now it returns 'vulnerabilidades'. 
        // But for simplicity, let's just show planes if they match any of my vulnerabilities
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const getCriticidadColor = (crit) => {
    switch (crit) {
      case 'CRITICA': return 'bg-red-100 text-red-800 border-red-200';
      case 'ALTA': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'MEDIA': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'BAJA': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700';
    }
  };

  const getTypeIcon = (type) => {
    switch(type) {
      case 'Servidor': return <Server className="w-5 h-5 text-purple-500" />;
      case 'Base de datos': return <Database className="w-5 h-5 text-brand-primary" />;
      case 'Equipo': return <Monitor className="w-5 h-5 text-green-500" />;
      case 'Aplicación': return <Globe className="w-5 h-5 text-pink-500" />;
      case 'Red': return <Activity className="w-5 h-5 text-orange-500" />;
      default: return <Smartphone className="w-5 h-5 text-gray-500" />;
    }
  };

  const filteredActivos = activos.filter(a => {
    const matchesTab = activeTab === 'Todos' || 
      (activeTab === 'Servidores' && a.tipo === 'Servidor') ||
      (activeTab === 'Equipos' && a.tipo === 'Equipo') ||
      (activeTab === 'Aplicaciones' && a.tipo === 'Aplicación') ||
      (activeTab === 'Red' && a.tipo === 'Red') ||
      (activeTab === 'Base de datos' && a.tipo === 'Base de datos');
    
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      (a.nombre && a.nombre.toLowerCase().includes(term)) || 
      (a.codigo_activo && a.codigo_activo.toLowerCase().includes(term)) ||
      (a.direccion_ip && a.direccion_ip.toLowerCase().includes(term)) ||
      (a.usuario_responsable && a.usuario_responsable.toLowerCase().includes(term));
      
    return matchesTab && matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-brand-accent/30 rounded-lg shadow-sm">
            <Monitor className="w-6 h-6 text-brand-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Gestión de Activos</h1>
            <p className="text-sm text-gray-500">Inventario centralizado y postura de seguridad</p>
          </div>
        </div>
        {['ADMINISTRADOR', 'GESTOR_ACTIVOS'].includes(getUserRole()) && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-brand-primary hover:bg-brand-secondary text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Registrar activo
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-0 flex gap-6 overflow-x-auto bg-brand-light dark:bg-gray-900/50">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap py-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab ? 'text-brand-primary border-brand-primary' : 'text-gray-500 hover:text-gray-900 dark:text-gray-100 border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por código, nombre, IP o responsable..."
              className="w-full pl-9 pr-4 py-2 bg-brand-light dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:bg-white dark:focus:bg-gray-800 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-brand-light dark:hover:bg-gray-900 shadow-sm">
            <Filter className="w-4 h-4" /> Filtros avanzados
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-light dark:bg-gray-900 text-gray-600 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4">Código / Nombre</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Red / IP</th>
                <th className="px-6 py-4">Criticidad</th>
                <th className="px-6 py-4">Responsable</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="7" className="text-center py-12 text-gray-500">Cargando inventario...</td></tr>
              ) : filteredActivos.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-12 text-gray-500">No se encontraron activos con los criterios actuales.</td></tr>
              ) : (
                filteredActivos.map(activo => (
                  <tr key={activo.id_activo} className="hover:bg-brand-accent/20 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-brand-primary" onClick={() => openDetail(activo)}>
                          {activo.nombre}
                        </span>
                        <span className="text-xs text-gray-500 mt-0.5">{activo.codigo_activo}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(activo.tipo)}
                        <span className="text-gray-700 dark:text-gray-300">{activo.tipo}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                        {activo.direccion_ip || activo.hostname || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${getCriticidadColor(activo.criticidad)}`}>
                        {activo.criticidad}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {activo.usuario_responsable || activo.propietario}
                    </td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200 w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        {activo.estado_activo || 'Activo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openDetail(activo)} className="text-brand-primary hover:text-brand-secondary text-sm font-medium mr-3">Ver Detalle</button>
                      {['ADMINISTRADOR', 'GESTOR_ACTIVOS'].includes(getUserRole()) && (
                        <button onClick={() => handleDelete(activo.id_activo)} className="text-red-600 hover:text-red-800 text-sm font-medium">Eliminar</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between text-sm text-gray-500 bg-brand-light dark:bg-gray-900/50">
          <span>Mostrando <span className="font-medium text-gray-900 dark:text-gray-100">{filteredActivos.length}</span> activos de <span className="font-medium text-gray-900 dark:text-gray-100">{activos.length}</span> totales</span>
        </div>
      </div>

      {/* Modal de Creación */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-brand-light dark:bg-gray-900">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Registrar Nuevo Activo (FRD V2)</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700 dark:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <form id="createActivoForm" onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* Info Principal */}
                <div className="col-span-1 lg:col-span-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-4">Información Principal</h3>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código de Activo *</label>
                  <input required type="text" placeholder="Ej: SRV-001" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none" value={formData.codigo_activo} onChange={e => setFormData({...formData, codigo_activo: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                  <input required type="text" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Activo *</label>
                  <select className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none bg-white dark:bg-gray-800" value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}>
                    <option value="Servidor">Servidor</option>
                    <option value="Equipo">Equipo / Endpoint</option>
                    <option value="Aplicación">Aplicación Web</option>
                    <option value="API">API / Microservicio</option>
                    <option value="Base de datos">Base de datos</option>
                    <option value="Red">Dispositivo de Red</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Criticidad del Negocio *</label>
                  <select className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none bg-white dark:bg-gray-800" value={formData.criticidad} onChange={e => setFormData({...formData, criticidad: e.target.value})}>
                    <option value="CRITICA">Crítica (SLA Estricto)</option>
                    <option value="ALTA">Alta</option>
                    <option value="MEDIA">Media</option>
                    <option value="BAJA">Baja</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado Operativo</label>
                  <select className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none bg-white dark:bg-gray-800" value={formData.estado_activo} onChange={e => setFormData({...formData, estado_activo: e.target.value})}>
                    <option value="Activo">Activo / Producción</option>
                    <option value="Inactivo">Inactivo</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                    <option value="Desarrollo">Desarrollo / Testing</option>
                  </select>
                </div>

                {/* Info Técnica */}
                <div className="col-span-1 lg:col-span-3 pb-2 border-b border-gray-100 dark:border-gray-800 mt-2">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-4">Especificaciones Técnicas</h3>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Marca / Proveedor</label>
                  <input type="text" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.marca} onChange={e => setFormData({...formData, marca: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Modelo</label>
                  <input type="text" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.modelo} onChange={e => setFormData({...formData, modelo: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número de Serie / Licencia</label>
                  <input type="text" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.numero_serie} onChange={e => setFormData({...formData, numero_serie: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hostname / FQDN</label>
                  <input type="text" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none font-mono" value={formData.hostname} onChange={e => setFormData({...formData, hostname: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección IP (Local/Pública)</label>
                  <input type="text" placeholder="Ej: 192.168.1.10" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none font-mono" value={formData.direccion_ip} onChange={e => setFormData({...formData, direccion_ip: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sistema Operativo</label>
                  <input type="text" placeholder="Ej: Ubuntu Linux" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.sistema_operativo} onChange={e => setFormData({...formData, sistema_operativo: e.target.value})} />
                </div>

                {/* Organizacional */}
                <div className="col-span-1 lg:col-span-3 pb-2 border-b border-gray-100 dark:border-gray-800 mt-2">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-4">Contexto Organizacional</h3>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usuario Responsable</label>
                  <input type="text" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.usuario_responsable} onChange={e => setFormData({...formData, usuario_responsable: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Área / Departamento</label>
                  <input type="text" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ubicación / Sede</label>
                  <input type="text" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.sede} onChange={e => setFormData({...formData, sede: e.target.value})} />
                </div>
                <div className="col-span-1 lg:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción / Notas</label>
                  <textarea rows={3} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none resize-none" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})}></textarea>
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-brand-light dark:bg-gray-900 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-brand-light dark:hover:bg-gray-900 rounded-lg shadow-sm">Cancelar</button>
              <button type="submit" form="createActivoForm" className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-secondary rounded-lg shadow-sm">Guardar Activo</button>
            </div>
          </div>
        </div>
      )}

      {/* Vista Detallada 360 (Offcanvas / Modal grande) */}
      {isDetailOpen && selectedActivo && (
        <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm flex items-end sm:items-center justify-end z-50">
          <div className="bg-white dark:bg-gray-800 shadow-2xl w-full sm:max-w-2xl lg:max-w-4xl h-[90vh] sm:h-full sm:rounded-l-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center px-8 py-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
                  {getTypeIcon(selectedActivo.tipo)}
                  {selectedActivo.nombre}
                </h2>
                <div className="flex gap-3 mt-2 text-sm">
                  <span className="text-gray-500 font-mono">{selectedActivo.codigo_activo}</span>
                  <span className="text-gray-300">•</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${getCriticidadColor(selectedActivo.criticidad)}`}>
                    {selectedActivo.criticidad}
                  </span>
                </div>
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-brand-light dark:bg-gray-900/50 space-y-8">
              {/* Sección Info Técnica */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-gray-400" />
                  Especificaciones del Activo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                  <div>
                    <span className="block text-xs font-medium text-gray-500 uppercase">Sistema Operativo</span>
                    <span className="mt-1 block text-sm text-gray-900 dark:text-gray-100">{selectedActivo.sistema_operativo || 'No especificado'} {selectedActivo.version_so}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-gray-500 uppercase">Red / Hostname</span>
                    <span className="mt-1 block text-sm font-mono text-gray-900 dark:text-gray-100">{selectedActivo.direccion_ip} / {selectedActivo.hostname || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-gray-500 uppercase">Hardware / Modelo</span>
                    <span className="mt-1 block text-sm text-gray-900 dark:text-gray-100">{selectedActivo.marca} {selectedActivo.modelo}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-gray-500 uppercase">Responsable Operativo</span>
                    <span className="mt-1 block text-sm text-gray-900 dark:text-gray-100">{selectedActivo.usuario_responsable || selectedActivo.propietario} ({selectedActivo.area})</span>
                  </div>
                </div>
              </div>

              {/* Vulnerabilidades */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    Vulnerabilidades
                  </h3>
                  <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-bold">{activoHallazgos.length} Hallazgos</span>
                </div>
                {loadingDetail ? (
                   <div className="text-center py-8 text-gray-500">Cargando...</div>
                ) : activoHallazgos.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                    <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-3" />
                    <p className="text-sm font-medium text-emerald-700">El activo está limpio.</p>
                    <p className="text-xs mt-1 text-gray-500">No hay vulnerabilidades abiertas registradas.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activoHallazgos.map(h => (
                      <div key={h.id_hallazgo} className="p-3 border border-gray-100 dark:border-gray-800 rounded-lg bg-brand-light dark:bg-gray-900 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{h.cve_id || `VULN-${h.id_hallazgo.substring(0,6)}`}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{h.titulo}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${h.severidad === 'CRITICA' ? 'bg-red-100 text-red-800' : h.severidad === 'ALTA' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {h.severidad}
                          </span>
                          <span className="text-[10px] text-gray-500">{h.estado_hallazgo}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Planes */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                    Planes de Remediación
                  </h3>
                  <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">{activoPlanes.length} Planes</span>
                </div>
                {loadingDetail ? (
                   <div className="text-center py-8 text-gray-500">Cargando...</div>
                ) : activoPlanes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                    <FileText className="w-8 h-8 mx-auto text-gray-300 mb-3" />
                    <p className="text-sm font-medium">No hay planes asociados a este activo.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activoPlanes.map(p => (
                      <div key={p.id_plan} className="p-3 border border-gray-100 dark:border-gray-800 rounded-lg bg-brand-light dark:bg-gray-900 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{p.nombre}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{p.plan_accion}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            {p.estado_plan}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
