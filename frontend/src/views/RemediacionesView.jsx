import React, { useState, useEffect } from 'react';
import { CheckCircle, Plus, Search, Filter, X, ShieldCheck, Clock, FileText, Activity, Target } from 'lucide-react';
import { getUserRole } from '../utils/auth';
import { apiGet, apiPost, apiPatch } from '../utils/apiClient';

export default function RemediacionesView() {
  const [planes, setPlanes] = useState([]);
  const [hallazgos, setHallazgos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState(null);
  const [expandedPlanData, setExpandedPlanData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
    const [filtroActivo, setFiltroActivo] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    plan_accion: '',
    id_remediador: '',
    prioridad: 'MEDIA',
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_limite: '',
    vulnerabilidades: [] // Array de IDs
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [planesData, hallazgosData, usuariosData] = await Promise.all([
        apiGet('/api/remediacion'),
        apiGet('/api/hallazgos'),
        apiGet('/api/usuarios')
      ]);

      setPlanes(planesData);
      setHallazgos(hallazgosData);
      setUsuarios(usuariosData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.vulnerabilidades.length === 0) {
      alert("Debes seleccionar al menos una vulnerabilidad para este plan.");
      return;
    }

    try {
      await apiPost('/api/remediacion', formData);
      setIsModalOpen(false);
      fetchData();
      setFormData({
        nombre: '', descripcion: '', plan_accion: '', id_remediador: '', 
        prioridad: 'MEDIA', fecha_inicio: new Date().toISOString().split('T')[0], 
        fecha_limite: '', vulnerabilidades: []
      });
    } catch (error) {
      console.error('Error creating plan:', error);
      alert(error.message || "Error al crear el plan");
    }
  };

  const handleVulnToggle = (id) => {
    setFormData(prev => {
      const isSelected = prev.vulnerabilidades.includes(id);
      return {
        ...prev,
        vulnerabilidades: isSelected 
          ? prev.vulnerabilidades.filter(v => v !== id)
          : [...prev.vulnerabilidades, id]
      };
    });
  };

  const getSLAInfo = (fecha_limite) => {
    if (!fecha_limite) return { text: 'Sin fecha', color: 'text-gray-500 bg-gray-100 dark:bg-gray-700' };
    const limitDate = new Date(fecha_limite);
    const today = new Date();
    const diffTime = limitDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d Vencido`, color: 'text-red-700 bg-red-100 border-red-200' };
    if (diffDays === 0) return { text: 'Vence Hoy', color: 'text-orange-700 bg-orange-100 border-orange-200' };
    if (diffDays <= 3) return { text: `${diffDays}d Restantes`, color: 'text-yellow-700 bg-yellow-100 border-yellow-200' };
    return { text: `${diffDays}d Restantes`, color: 'text-emerald-700 bg-emerald-100 border-emerald-200' };
  };

  const getStatusBadgeColor = (estado) => {
    switch (estado) {
      case 'COMPLETADO': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'EN_EJECUCION': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'VENCIDO': return 'bg-red-100 text-red-800 border-red-200';
      case 'CANCELADO': return 'bg-gray-200 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200'; // PENDIENTE
    }
  };

  const filteredPlanes = planes.filter(plan => {
    const matchStatus = statusFilter === 'TODOS' || plan.estado_plan === statusFilter;
    const term = searchTerm.toLowerCase();
    const matchSearch = (plan.nombre || '').toLowerCase().includes(term) || 
                        (plan.plan_accion || '').toLowerCase().includes(term);
    return matchStatus && matchSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-100 rounded-lg shadow-sm">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Planes de Remediación</h1>
            <p className="text-sm text-gray-500">Gestión de mitigación M:N y control de SLAs</p>
          </div>
        </div>
        {['ADMINISTRADOR', 'ANALISTA_SEGURIDAD', 'AUDITOR'].includes(getUserRole()) && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 bg-brand-primary hover:bg-brand-secondary text-white px-4 py-2 rounded-lg transition-colors shadow-sm text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Plan de Acción</span>
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between gap-4 bg-brand-light dark:bg-gray-900/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar por nombre o descripción..."
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-primary outline-none text-sm transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="text-gray-400 w-4 h-4" />
            <select
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-brand-primary outline-none shadow-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="TODOS">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_EJECUCION">En Ejecución</option>
              <option value="COMPLETADO">Completado</option>
              <option value="VENCIDO">Vencido</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-brand-light dark:bg-gray-900 text-gray-600 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4">Nombre del Plan</th>
                <th className="px-6 py-4">Prioridad</th>
                <th className="px-6 py-4">Responsable</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Progreso / SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="5" className="text-center py-12 text-gray-500">Cargando planes...</td></tr>
              ) : filteredPlanes.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-12 text-gray-500">No se encontraron planes de acción.</td></tr>
              ) : (
                filteredPlanes.map((plan) => {
                  const sla = getSLAInfo(plan.fecha_limite);
                  return (
                    <React.Fragment key={plan.id_plan}>
                    <tr 
                      onClick={async () => {
                        if (expandedPlanId === plan.id_plan) {
                           setExpandedPlanId(null);
                        } else {
                           setExpandedPlanId(plan.id_plan);
                           try {
                             setExpandedPlanData(await apiGet('/api/remediacion/' + plan.id_plan));
                           } catch (err) { console.error(err); }
                        }
                      }}
                      className="hover:bg-brand-accent/20 transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-brand-primary">{plan.nombre}</span>
                          <span className="text-xs text-gray-500 mt-0.5 max-w-xs truncate" title={plan.descripcion}>{plan.descripcion || plan.plan_accion}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${plan.prioridad === 'CRITICA' ? 'text-red-700' : plan.prioridad === 'ALTA' ? 'text-orange-700' : 'text-gray-700 dark:text-gray-300'}`}>
                          {plan.prioridad}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-brand-accent/40 flex items-center justify-center text-brand-primary font-bold text-xs">
                            {(plan.remediador || plan.id_remediador || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-gray-600 dark:text-gray-400 font-medium">
                            {plan.remediador || usuarios.find(u => u.id_usuario === plan.id_remediador)?.nombre_completo || 'Sin Asignar'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-bold border ${getStatusBadgeColor(plan.estado_plan)}`}>
                          {plan.estado_plan?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${sla.color}`}>
                              {sla.text}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono">
                            Vence: {plan.fecha_limite ? new Date(plan.fecha_limite).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {expandedPlanId === plan.id_plan && (
                      <tr className="bg-brand-light dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <td colSpan="5" className="px-6 py-6">
                          {expandedPlanData ? (
                             <div className="grid grid-cols-2 gap-8 text-sm">
                               <div>
                                 <h4 className="font-bold mb-3 text-gray-800 dark:text-gray-200 border-b pb-2 flex items-center gap-2"><Target size={16}/> Vulnerabilidades a Mitigar</h4>
                                 <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                                   {expandedPlanData.vulnerabilidades?.map(v => (
                                      <li key={v.id_hallazgo} className="flex justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                                        <span className="font-medium">{v.cve_id}</span>
                                        <span className={`text-xs font-bold ${v.severidad === 'CRITICA' ? 'text-red-600' : 'text-orange-500'}`}>{v.severidad}</span>
                                      </li>
                                   ))}
                                 </ul>
                               </div>
                               <div>
                                 <h4 className="font-bold mb-3 text-gray-800 dark:text-gray-200 border-b pb-2 flex items-center gap-2"><Activity size={16}/> Activos Afectados</h4>
                                 <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                                   {Array.from(new Set(expandedPlanData.vulnerabilidades?.map(v => v.codigo_activo))).map(act => (
                                      <li key={act} className="flex justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                                        <span className="font-semibold text-brand-primary">{act}</span>
                                      </li>
                                   ))}
                                 </ul>

                                 <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                   <h4 className="font-bold mb-3 text-gray-800 dark:text-gray-200 text-sm flex items-center gap-2">Control de Estado</h4>
                                   <p className="text-xs text-gray-500 mb-2">Marcar como COMPLETADO cerrará automáticamente las vulnerabilidades asociadas.</p>
                                   <select 
                                     className="border border-gray-300 dark:border-gray-600 rounded p-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                     value={plan.estado_plan}
                                     onChange={async (e) => {
                                        const nuevoEstado = e.target.value;
                                        try {
                                            await apiPatch(`/api/remediacion/${plan.id_plan}/estado`, { estado: nuevoEstado });
                                            fetchData();
                                            alert('Estado actualizado. Las vulnerabilidades asociadas se han actualizado.');
                                        } catch(err) {
                                            console.error(err);
                                            alert(err.message || 'Error al cambiar estado.');
                                        }
                                     }}
                                   >
                                     <option value="PENDIENTE">Pendiente</option>
                                     <option value="EN_EJECUCION">En Ejecución</option>
                                     <option value="COMPLETADO">Completado</option>
                                     <option value="CANCELADO">Cancelado</option>
                                   </select>
                                 </div>

                                 </div>
                               </div>
                          ) : ( <div className="text-center text-gray-500 py-6">Cargando detalles...</div> )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between text-sm text-gray-500 bg-brand-light dark:bg-gray-900/50">
          <span>Mostrando <span className="font-medium text-gray-900 dark:text-gray-100">{filteredPlanes.length}</span> planes de <span className="font-medium text-gray-900 dark:text-gray-100">{planes.length}</span> totales</span>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-brand-light dark:bg-gray-900">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Diseñar Plan de Remediación</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700 dark:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <form id="createPlanForm" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Columna Izquierda: Detalles del Plan */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-2 border-b border-gray-100 dark:border-gray-800 pb-2">Información del Plan</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del Plan *</label>
                    <input required type="text" placeholder="Ej: Parcheo de Log4j en Servidores Críticos" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Objetivo / Descripción</label>
                    <textarea rows="2" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none resize-none" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan de Acción / Tareas (Step-by-Step) *</label>
                    <textarea required rows="4" placeholder="1. Respaldar sistema.&#10;2. Descargar parche oficial.&#10;3. Desplegar en ventana de mantenimiento." className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none resize-none" value={formData.plan_accion} onChange={e => setFormData({...formData, plan_accion: e.target.value})} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridad *</label>
                      <select className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none bg-white dark:bg-gray-800" value={formData.prioridad} onChange={e => setFormData({...formData, prioridad: e.target.value})}>
                        <option value="CRITICA">Crítica</option>
                        <option value="ALTA">Alta</option>
                        <option value="MEDIA">Media</option>
                        <option value="BAJA">Baja</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsable *</label>
                      <select required className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none bg-white dark:bg-gray-800" value={formData.id_remediador} onChange={e => setFormData({...formData, id_remediador: e.target.value})}>
                        <option value="">Seleccione...</option>
                        {usuarios.map(u => (
                          <option key={u.id_usuario} value={u.id_usuario}>{u.nombre_completo} ({u.rol})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de Inicio *</label>
                      <input required type="date" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.fecha_inicio} onChange={e => setFormData({...formData, fecha_inicio: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Límite (SLA) *</label>
                      <input required type="date" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.fecha_limite} onChange={e => setFormData({...formData, fecha_limite: e.target.value})} />
                    </div>
                  </div>
                </div>

                {/* Columna Derecha: Selección M:N de Vulnerabilidades */}
                <div className="space-y-4 flex flex-col h-full">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-2 border-b border-gray-100 dark:border-gray-800 pb-2 flex justify-between">
                    <span>Alcance (Hallazgos) *</span>
                    <span className="bg-brand-accent/40 text-brand-primary px-2 py-0.5 rounded-full text-xs">{formData.vulnerabilidades.length} seleccionados</span>
                  </h3>
                  
                  <div className="flex-1 bg-brand-light dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 overflow-y-auto max-h-[400px]">
                    
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filtrar por Activo (Opcional)</label>
                      <select 
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        value={filtroActivo}
                        onChange={e => setFiltroActivo(e.target.value)}
                      >
                        <option value="">Todos los activos</option>
                        {Array.from(new Set(hallazgos.map(h => h.codigo_activo))).map(act => (
                          <option key={act} value={act}>{act}</option>
                        ))}
                      </select>
                    </div>

                    {hallazgos.filter(h => h.estado_hallazgo !== 'CERRADA' && h.estado_hallazgo !== 'MITIGADA' && (!filtroActivo || h.codigo_activo === filtroActivo)).length === 0 ? (
                      <div className="text-center p-6 text-gray-500 text-sm">No hay vulnerabilidades abiertas disponibles para remediar.</div>
                    ) : (
                      <div className="space-y-2">
                        {hallazgos.filter(h => h.estado_hallazgo !== 'CERRADA' && h.estado_hallazgo !== 'MITIGADA' && (!filtroActivo || h.codigo_activo === filtroActivo)).map(h => (
                          <div 
                            key={h.id_hallazgo} 
                            onClick={() => handleVulnToggle(h.id_hallazgo)}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-start gap-3 ${formData.vulnerabilidades.includes(h.id_hallazgo) ? 'bg-brand-accent/20 border-brand-primary' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-brand-primary'}`}
                          >
                            <input 
                              type="checkbox" 
                              checked={formData.vulnerabilidades.includes(h.id_hallazgo)}
                              onChange={() => {}}
                              className="mt-1 w-4 h-4 text-brand-primary border-gray-300 dark:border-gray-600 rounded focus:ring-brand-primary"
                            />
                            <div>
                              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{h.cve_id || `VULN-${h.id_hallazgo.substring(0,6).toUpperCase()}`}</div>
                              <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1" title={h.titulo}>{h.titulo}</div>
                              <div className="text-xs text-gray-400 mt-1">Activo: {h.activo_nombre}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Selecciona todas las vulnerabilidades que este plan mitigará de forma simultánea.</p>
                </div>
                
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-brand-light dark:bg-gray-900 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-brand-light dark:hover:bg-gray-900 rounded-lg shadow-sm">Cancelar</button>
              <button type="submit" form="createPlanForm" className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-secondary rounded-lg shadow-sm">Guardar Plan de Remediación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
