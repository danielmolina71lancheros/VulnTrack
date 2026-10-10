import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Calendar,
  FileText,
  Camera,
  Clock,
  Route
} from 'lucide-react';

export default function EvidenciasView() {
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState({});
  const [planes, setPlanes] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [comentario, setComentario] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('Todos los módulos');

  const modules = [
    'Todos los módulos',
    'Activos',
    'Vulnerabilidades',
    'Riesgos',
    'Remediación',
    'Usuarios'
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('vulntrack_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch users to map IDs to names
        const usersRes = await fetch('/api/usuarios', { headers });
        let usersMap = {};
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          usersData.forEach(u => {
            usersMap[u.id_usuario] = u.nombre_completo;
          });
          setUsers(usersMap);
        }

        // Fetch audit logs
        const auditRes = await fetch('/api/auditoria', { headers });
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          setEvents(auditData);
        }
        
        // Fetch Planes de Remediación
        const planesRes = await fetch('/api/remediacion', { headers });
        if (planesRes.ok) {
          const planesData = await planesRes.json();
          setPlanes(planesData);
        }
      } catch (error) {
        console.error("Error fetching audit data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedPlan || !archivo) {
      alert("Seleccione un plan y un archivo.");
      return;
    }
    setUploading(true);
    try {
      const token = localStorage.getItem('vulntrack_token');
      const formData = new FormData();
      formData.append('comentario', comentario);
      formData.append('archivo', archivo);

      const res = await fetch(`/api/remediacion/${selectedPlan}/evidencias`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        alert("Evidencia subida correctamente");
        setComentario('');
        setArchivo(null);
        setSelectedPlan('');
      } else {
        alert("Error al subir evidencia");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red");
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredEvents = events.filter(ev => {
    const matchesModule = moduleFilter === 'Todos los módulos' || ev.modulo === moduleFilter;
    const userName = users[ev.id_usuario] || 'Usuario Desconocido';
    const matchesSearch = 
      userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.accion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ev.modulo && ev.modulo.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesModule && matchesSearch;
  });

  const cards = [
    { title: 'Archivos', icon: FileText, desc: 'Documentos adjuntos' },
    { title: 'Capturas', icon: Camera, desc: 'Evidencias visuales' },
    { title: 'Historial', icon: Clock, desc: 'Línea de tiempo' },
    { title: 'Trazabilidad', icon: Route, desc: 'Flujo de cambios' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-brand-dark p-6 rounded-2xl">
          <div className="col-span-1 md:col-span-4 mb-2">
            <h2 className="text-xl font-bold text-white flex items-center">
              <ShieldCheck className="w-6 h-6 mr-2 text-brand-accent" />
              Toda la trazabilidad, en un solo lugar.
            </h2>
          </div>
          {cards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div key={idx} className="bg-[#1d3540] p-4 rounded-xl border border-gray-700 flex flex-col items-center justify-center text-center">
                <div className="p-3 bg-gray-700 rounded-full mb-3">
                  <Icon className="w-6 h-6 text-brand-accent" />
                </div>
                <h3 className="text-white font-medium">{card.title}</h3>
                <p className="text-gray-400 text-xs mt-1">{card.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 mb-8">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
          <Camera className="w-5 h-5 mr-2 text-brand-primary" />
          Subir Nueva Evidencia
        </h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan de Remediación</label>
              <select
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm"
              >
                <option value="">Seleccionar plan...</option>
                {planes.map(p => (
                  <option key={p.id_plan} value={p.id_plan}>
                    {p.id_plan} - {p.estado}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Archivo de Evidencia</label>
              <input
                type="file"
                onChange={(e) => setArchivo(e.target.files[0])}
                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comentario</label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Descripción de la evidencia..."
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm"
              rows="3"
            ></textarea>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading}
              className="px-6 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-secondary font-medium disabled:bg-brand-primary/40"
            >
              {uploading ? 'Subiendo...' : 'Subir Evidencia'}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <ShieldCheck className="w-6 h-6 mr-3 text-brand-primary" />
          Evidencias y Auditoría
        </h1>
        <p className="mt-2 text-gray-500">Historial de cambios y registro de acciones del sistema.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex flex-1 gap-4 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por usuario o acción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm"
            />
          </div>
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="pl-9 pr-8 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm appearance-none bg-white dark:bg-gray-800"
            >
              {modules.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 bg-brand-light dark:bg-gray-900 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 w-full md:w-auto">
          <Calendar className="w-4 h-4" />
          <span>Últimos 30 días</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-light dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-sm border-b border-gray-100 dark:border-gray-800">
                <th className="px-6 py-4 font-medium">Fecha / Hora</th>
                <th className="px-6 py-4 font-medium">Usuario</th>
                <th className="px-6 py-4 font-medium">Acción</th>
                <th className="px-6 py-4 font-medium">Módulo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                    Cargando historial...
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                    No se encontraron registros de auditoría.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev, index) => (
                  <tr key={ev.id_evento || index} className="hover:bg-brand-light dark:hover:bg-gray-900/50">
                    <td className="px-6 py-4 text-gray-500 font-medium">
                      {formatDate(ev.fecha_evento)}
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-gray-100 font-medium">
                      {users[ev.id_usuario] || `Usuario ${ev.id_usuario}`}
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {ev.accion}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-accent/30 text-brand-primary">
                        {ev.modulo || 'Sistema'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
