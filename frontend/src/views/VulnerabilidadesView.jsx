import React, { useState, useEffect } from 'react';
import { TriangleAlert, Search, Filter, Plus, X, ShieldAlert, Activity, FileText, CheckCircle, Clock } from 'lucide-react';
import { tienePermiso } from '../utils/auth';
import { apiGet, apiPost, apiDelete } from '../utils/apiClient';

export default function VulnerabilidadesView() {
  const [hallazgos, setHallazgos] = useState([]);
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeveridad, setFilterSeveridad] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedHallazgo, setSelectedHallazgo] = useState(null);
  const [detalleCompleto, setDetalleCompleto] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [nvdLoading, setNvdLoading] = useState(false);

  const [formData, setFormData] = useState({
    cve_id: '',
    titulo: '',
    descripcion: '',
    severidad: 'MEDIA',
    cvss: '',
    id_activo: '',
    fuente: 'Manual'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [hData, aData] = await Promise.all([
        apiGet('/api/hallazgos'),
        apiGet('/api/activos')
      ]);

      if (Array.isArray(hData)) setHallazgos(hData);
      if (Array.isArray(aData)) setActivos(aData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNvdSearch = async () => {
    if (!formData.cve_id) return;
    setNvdLoading(true);
    try {
      const data = await apiGet(`/api/hallazgos/nvd/${formData.cve_id}`);

      let mappedSeveridad = 'MEDIA';
      if (data.severidad) {
        const s = data.severidad.toUpperCase();
        if (s === 'CRITICAL') mappedSeveridad = 'CRITICA';
        else if (s === 'HIGH') mappedSeveridad = 'ALTA';
        else if (s === 'MEDIUM') mappedSeveridad = 'MEDIA';
        else if (s === 'LOW') mappedSeveridad = 'BAJA';
      }

      setFormData({
        ...formData,
        titulo: formData.titulo || `Vulnerabilidad ${data.cve_id}`,
        descripcion: data.descripcion || '',
        severidad: mappedSeveridad,
        cvss: data.cvss || ''
      });
    } catch (error) {
      console.error('Error fetching NVD data:', error);
      alert('No se pudo obtener información del NVD para este CVE.');
    } finally {
      setNvdLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await apiPost('/api/hallazgos', {
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        cve_id: formData.cve_id,
        severidad: formData.severidad,
        cvss: parseFloat(formData.cvss) || null,
        id_activo: formData.id_activo,
        fuente: formData.fuente
      });

      setIsModalOpen(false);
      setFormData({ cve_id: '', titulo: '', descripcion: '', severidad: 'MEDIA', cvss: '', id_activo: '', fuente: 'Manual' });
      fetchData();
    } catch (error) {
      console.error('Error creating hallazgo:', error);
      alert(error.message || 'Error al crear vulnerabilidad');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta vulnerabilidad?')) return;
    try {
      await apiDelete(`/api/hallazgos/${id}`);
      fetchData();
      if (selectedHallazgo && selectedHallazgo.id_hallazgo === id) {
        setIsDetailOpen(false);
      }
    } catch (error) {
      console.error('Error deleting hallazgo:', error);
    }
  };

  const openDetail = async (hallazgo) => {
    setSelectedHallazgo(hallazgo);
    setDetalleCompleto(null);
    setIsDetailOpen(true);
    setLoadingDetail(true);
    try {
      const data = await apiGet(`/api/hallazgos/${hallazgo.id_hallazgo}`);
      setDetalleCompleto(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const getSeveridadColor = (sev) => {
    switch (sev) {
      case 'CRITICA': return 'bg-red-100 text-red-800 border-red-200';
      case 'ALTA': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'MEDIA': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'BAJA': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700';
    }
  };

  const getEstadoBadge = (estado) => {
    switch (estado) {
      case 'DETECTADA': return 'bg-red-50 text-red-700 border-red-200';
      case 'EN_ANALISIS': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'PLANIFICADA': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'EN_REMEDIACION': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'MITIGADA': return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'CORREGIDA': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'CERRADA': return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600';
      default: return 'bg-brand-light dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';
    }
  };

  const filteredHallazgos = hallazgos.filter(h => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = (h.cve_id?.toLowerCase() || '').includes(term) || 
                          (h.titulo?.toLowerCase() || '').includes(term) ||
                          (h.activo_nombre?.toLowerCase() || '').includes(term);
    const matchesSev = filterSeveridad ? h.severidad === filterSeveridad : true;
    const matchesEst = filterEstado ? h.estado_hallazgo === filterEstado : true;
    
    return matchesSearch && matchesSev && matchesEst;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-100 rounded-lg shadow-sm">
            <TriangleAlert className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Gestión de Vulnerabilidades</h1>
            <p className="text-sm text-gray-500">Hallazgos, seguimiento y correlación NVD</p>
          </div>
        </div>
        {tienePermiso('AUDITOR') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-brand-primary hover:bg-brand-secondary text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Registrar Hallazgo
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4 bg-brand-light dark:bg-gray-900/50">
          <div className="relative flex-1 min-w-[250px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por CVE, título o activo..."
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-brand-primary outline-none transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <select 
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-brand-primary outline-none shadow-sm"
              value={filterSeveridad}
              onChange={(e) => setFilterSeveridad(e.target.value)}
            >
              <option value="">Todas las severidades</option>
              <option value="CRITICA">Crítica</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
            <select 
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-brand-primary outline-none shadow-sm"
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="DETECTADA">Detectada</option>
              <option value="EN_ANALISIS">En Análisis</option>
              <option value="PLANIFICADA">Planificada</option>
              <option value="EN_REMEDIACION">En Remediación</option>
              <option value="MITIGADA">Mitigada</option>
              <option value="CORREGIDA">Corregida</option>
              <option value="FALSO_POSITIVO">Falso Positivo</option>
              <option value="CERRADA">Cerrada</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-light dark:bg-gray-900 text-gray-600 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4">Identificador / Título</th>
                <th className="px-6 py-4">Activo Afectado</th>
                <th className="px-6 py-4">Severidad / CVSS</th>
                <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Plan Asignado</th>
                <th className="px-6 py-4">Fecha Ident.</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="6" className="text-center py-12 text-gray-500">Cargando vulnerabilidades...</td></tr>
              ) : filteredHallazgos.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-12 text-gray-500">No se encontraron vulnerabilidades.</td></tr>
              ) : (
                filteredHallazgos.map(h => (
                  <tr key={h.id_hallazgo} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-brand-primary" onClick={() => openDetail(h)}>
                          {h.cve_id || `VULN-${h.id_hallazgo.substring(0,8).toUpperCase()}`}
                        </span>
                        <span className="text-xs text-gray-500 mt-0.5 truncate max-w-[250px]" title={h.titulo}>{h.titulo}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{h.activo_nombre || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${getSeveridadColor(h.severidad)}`}>
                          {h.severidad}
                        </span>
                        {h.cvss && <span className="text-xs font-mono text-gray-500">({h.cvss})</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getEstadoBadge(h.estado_hallazgo)}`}>
                        {h.estado_hallazgo?.replace('_', ' ') || 'DETECTADA'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(h.fecha_identificacion || h.fecha_descubrimiento).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openDetail(h)} className="text-brand-primary hover:text-brand-secondary text-sm font-medium mr-3">Ver Detalle</button>
                      {tienePermiso('AUDITOR') && (
                        <button onClick={() => handleDelete(h.id_hallazgo)} className="text-red-600 hover:text-red-800 text-sm font-medium">Eliminar</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500 bg-brand-light dark:bg-gray-900/50">
          <span>Mostrando <span className="font-medium text-gray-900 dark:text-gray-100">{filteredHallazgos.length}</span> vulnerabilidades de <span className="font-medium text-gray-900 dark:text-gray-100">{hallazgos.length}</span> totales</span>
        </div>
      </div>

      {/* Modal de Registro */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-brand-light dark:bg-gray-900">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Registrar Vulnerabilidad</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700 dark:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <form id="createHallazgoForm" onSubmit={handleCreate} className="space-y-5">
                
                <div className="p-4 bg-brand-accent/20 border border-brand-accent/40 rounded-xl">
                  <label className="block text-sm font-bold text-brand-dark mb-2">Búsqueda Inteligente NVD (Opcional)</label>
                  <p className="text-xs text-brand-primary mb-3">Si conoces el CVE, ingrésalo para autocompletar título, descripción, severidad y CVSS base.</p>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Ej: CVE-2021-44228"
                      className="flex-1 border border-brand-accent/60 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none bg-white dark:bg-gray-800 font-mono uppercase"
                      value={formData.cve_id}
                      onChange={e => setFormData({...formData, cve_id: e.target.value.toUpperCase()})}
                    />
                    <button 
                      type="button"
                      onClick={handleNvdSearch}
                      disabled={nvdLoading || !formData.cve_id}
                      className="px-4 py-2 bg-brand-primary hover:bg-brand-secondary disabled:bg-brand-primary/40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                    >
                      {nvdLoading ? 'Consultando...' : 'Obtener Datos'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título de la Vulnerabilidad *</label>
                  <input required type="text" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none" value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                  <textarea rows="4" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none resize-none" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Severidad *</label>
                    <select className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none bg-white dark:bg-gray-800" value={formData.severidad} onChange={e => setFormData({...formData, severidad: e.target.value})}>
                      <option value="CRITICA">Crítica</option>
                      <option value="ALTA">Alta</option>
                      <option value="MEDIA">Media</option>
                      <option value="BAJA">Baja</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CVSS Base Score</label>
                    <input type="number" step="0.1" min="0" max="10" placeholder="Ej: 9.8" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none font-mono" value={formData.cvss} onChange={e => setFormData({...formData, cvss: e.target.value})} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Activo Afectado (Relación 1:N) *</label>
                  <select required className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none bg-white dark:bg-gray-800" value={formData.id_activo} onChange={e => setFormData({...formData, id_activo: e.target.value})}>
                    <option value="">Seleccione el activo que presenta este hallazgo...</option>
                    {activos.map(a => (
                      <option key={a.id_activo} value={a.id_activo}>{a.codigo_activo} - {a.nombre} ({a.direccion_ip})</option>
                    ))}
                  </select>
                </div>

              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-brand-light dark:bg-gray-900 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-brand-light dark:hover:bg-gray-900 rounded-lg shadow-sm">Cancelar</button>
              <button type="submit" form="createHallazgoForm" className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-secondary rounded-lg shadow-sm">Guardar Hallazgo</button>
            </div>
          </div>
        </div>
      )}

      {/* Vista Detallada 360 (Offcanvas / Modal grande) */}
      {isDetailOpen && selectedHallazgo && (
        <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm flex items-end sm:items-center justify-end z-50">
          <div className="bg-white dark:bg-gray-800 shadow-2xl w-full sm:max-w-2xl lg:max-w-4xl h-[90vh] sm:h-full sm:rounded-l-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center px-8 py-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                  {selectedHallazgo.cve_id || `VULN-${selectedHallazgo.id_hallazgo.substring(0,8).toUpperCase()}`}
                </h2>
                <div className="flex gap-3 mt-2 text-sm">
                  <span className="text-gray-500">{selectedHallazgo.titulo}</span>
                  <span className="text-gray-300">•</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getEstadoBadge(selectedHallazgo.estado_hallazgo)}`}>
                    {selectedHallazgo.estado_hallazgo?.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-brand-light dark:bg-gray-900/50 space-y-8">
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Score Panel */}
                <div className="col-span-1 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col items-center justify-center text-center">
                  <span className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">CVSS Base Score</span>
                  <div className="text-5xl font-black text-gray-900 dark:text-gray-100 mb-2">{selectedHallazgo.cvss || 'N/A'}</div>
                  <span className={`px-3 py-1 rounded-md text-sm font-bold border ${getSeveridadColor(selectedHallazgo.severidad)}`}>
                    {selectedHallazgo.severidad}
                  </span>
                </div>

                {/* Details Panel */}
                <div className="col-span-1 lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">Descripción Técnica</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {selectedHallazgo.descripcion || 'Sin descripción técnica proporcionada.'}
                  </p>
                  
                  <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
                    <div>
                      <span className="block text-xs font-medium text-gray-500 uppercase">Activo Afectado</span>
                      <span className="mt-1 block text-sm font-medium text-brand-primary">{selectedHallazgo.activo_nombre}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-gray-500 uppercase">Identificado</span>
                      <span className="mt-1 block text-sm text-gray-900 dark:text-gray-100">
                        {new Date(selectedHallazgo.fecha_identificacion || selectedHallazgo.fecha_descubrimiento).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Riesgo Evaluado */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-brand-primary" />
                    Evaluación de Riesgo Local
                  </h3>
                </div>
                {loadingDetail ? (
                  <div className="text-center py-6 text-gray-500">Cargando...</div>
                ) : !detalleCompleto?.riesgo_puntaje ? (
                  <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg bg-brand-light dark:bg-gray-900">
                    <p className="text-sm font-medium">No se ha registrado una evaluación de riesgo (Probabilidad x Impacto) para este hallazgo.</p>
                    <p className="text-xs mt-1">Navega a la pestaña de Riesgos para calcular su exposición real.</p>
                  </div>
                ) : (
                  <div className="flex gap-8 items-center">
                    <div className="text-center">
                      <div className="text-4xl font-black text-gray-900 dark:text-gray-100">{detalleCompleto.riesgo_puntaje}</div>
                      <div className={`mt-1 px-3 py-1 rounded text-xs font-bold ${detalleCompleto.riesgo_clasificacion === 'CRITICO' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>{detalleCompleto.riesgo_clasificacion}</div>
                    </div>
                    <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <div><span className="font-bold">Probabilidad:</span> {detalleCompleto.probabilidad}</div>
                      <div><span className="font-bold">Impacto:</span> {detalleCompleto.impacto}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Planes de Remediación */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                    Planes de Remediación Asociados
                  </h3>
                  {detalleCompleto?.planes && <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">{detalleCompleto.planes.length} Planes</span>}
                </div>
                {loadingDetail ? (
                  <div className="text-center py-6 text-gray-500">Cargando...</div>
                ) : (!detalleCompleto?.planes || detalleCompleto.planes.length === 0) ? (
                  <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg bg-brand-light dark:bg-gray-900">
                    <p className="text-sm font-medium">Aún no hay planes de remediación asociados a esta vulnerabilidad.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detalleCompleto.planes.map(p => (
                      <div key={p.id_plan} className="p-4 border border-gray-100 dark:border-gray-800 rounded-lg bg-brand-light dark:bg-gray-900 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{p.nombre}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Responsable: {p.responsable || 'Sin Asignar'} • Vence: {new Date(p.fecha_limite).toLocaleDateString()}</div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                          {p.estado_plan?.replace('_', ' ')}
                        </span>
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
