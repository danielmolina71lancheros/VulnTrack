import React, { useState, useEffect } from 'react';
import { Target, Plus, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getUserRole } from '../utils/auth';

export default function RiesgosView() {
  const [riesgos, setRiesgos] = useState([]);
  const [hallazgos, setHallazgos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('vulntrack_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [riesgosRes, hallazgosRes] = await Promise.all([
        fetch('/api/riesgos', { headers }),
        fetch('/api/hallazgos', { headers })
      ]);

      if (riesgosRes.ok) setRiesgos(await riesgosRes.json());
      if (hallazgosRes.ok) setHallazgos(await hallazgosRes.json());
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoEvaluate = async () => {
    const pendientes = hallazgos.filter(h => !h.riesgo_puntaje);
    if (pendientes.length === 0) return alert('No hay vulnerabilidades pendientes por evaluar.');
    setLoading(true);
    const token = localStorage.getItem('vulntrack_token');
    
    for (const h of pendientes) {
      let imp = 2; // BAJA
      if (h.activo_criticidad === 'CRITICA') imp = 5;
      else if (h.activo_criticidad === 'ALTA') imp = 4;
      else if (h.activo_criticidad === 'MEDIA') imp = 3;
      
      let prob = 2;
      const cvss = h.cvss || 0;
      if (cvss >= 9) prob = 5;
      else if (cvss >= 7) prob = 4;
      else if (cvss >= 4) prob = 3;
      
      try {
        await fetch('/api/riesgos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ id_hallazgo: h.id_hallazgo, impacto: imp, probabilidad: prob, justificacion: 'Auto-Evaluación basada en criticidad de activo y CVSS.' })
        });
      } catch (e) {
        console.error(e);
      }
    }
    await fetchData();
  };

  const probabilidadLevels = [1, 2, 3, 4, 5];
  const impactoLevels = [5, 4, 3, 2, 1]; // Top to bottom

  const getMatrixCellColor = (impacto, probabilidad) => {
    const puntaje = impacto * probabilidad;
    if (puntaje >= 20) return 'bg-red-600';
    if (puntaje >= 12) return 'bg-orange-500';
    if (puntaje >= 5) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getActivosData = () => {
    const activosRisk = {};
    riesgos.forEach(r => {
      const h = hallazgos.find(x => x.id_hallazgo === r.id_hallazgo);
      if (h) {
         const act = h.activo_nombre || h.codigo_activo || 'Desconocido';
         if (!activosRisk[act]) activosRisk[act] = { name: act, CRITICO: 0, ALTO: 0, MEDIO: 0, BAJO: 0 };
         
         let nivel = 'BAJO';
         if (r.puntaje >= 20) nivel = 'CRITICO';
         else if (r.puntaje >= 12) nivel = 'ALTO';
         else if (r.puntaje >= 5) nivel = 'MEDIO';
         
         activosRisk[act][nivel] = (activosRisk[act][nivel] || 0) + 1;
      }
    });
    return Object.values(activosRisk);
  };

  const getRiesgosInCell = (impacto, probabilidad) => {
    return riesgos.filter(r => Number(r.impacto) === impacto && Number(r.probabilidad) === probabilidad).length;
  };

  const stats = {
    total: riesgos.length,
    criticos: riesgos.filter(r => r.puntaje >= 20).length,
    altos: riesgos.filter(r => r.puntaje >= 12 && r.puntaje < 20).length,
    medios: riesgos.filter(r => r.puntaje >= 5 && r.puntaje < 12).length,
    bajos: riesgos.filter(r => r.puntaje < 5).length,
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-3">
          <Target className="w-8 h-8 text-brand-primary" />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Evaluación y Gestión de Riesgos</h1>
        </div>
        {['ADMINISTRADOR', 'ANALISTA_SEGURIDAD'].includes(getUserRole()) && (
          <button
            onClick={handleAutoEvaluate}
            className="flex items-center space-x-2 bg-brand-primary hover:bg-brand-primary text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Auto-Evaluar Pendientes</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10">Cargando datos...</div>
      ) : (<>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-x-auto">
            <h2 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Matriz de Riesgos</h2>
            <div className="min-w-[500px]">
              <div className="flex">
                <div className="w-24 flex-shrink-0 flex flex-col justify-center items-center font-semibold text-gray-500 text-sm transform -rotate-90">
                  IMPACTO
                </div>
                <div className="flex-1">
                  <div className="grid grid-rows-5 gap-1">
                    {impactoLevels.map((impacto) => (
                      <div key={impacto} className="flex h-20 items-center">
                        <div className="w-24 text-right pr-4 text-xs font-medium text-gray-600 dark:text-gray-400">{ impacto === 5 ? 'CRITICO' : impacto === 4 ? 'ALTO' : impacto === 3 ? 'MEDIO' : impacto === 2 ? 'BAJO' : 'MUY BAJO' }</div>
                        <div className="flex-1 grid grid-cols-5 gap-1 h-full">
                          {probabilidadLevels.map((probabilidad) => {
                            const count = getRiesgosInCell(impacto, probabilidad);
                            const bgColor = getMatrixCellColor(impacto, probabilidad);
                            return (
                              <div
                                key={`${impacto}-${probabilidad}`}
                                className={`relative flex items-center justify-center ${bgColor} rounded-sm opacity-80 hover:opacity-100 transition-opacity`}
                                title={`Impacto: ${impacto}, Probabilidad: ${probabilidad} - ${count} riesgos`}
                              >
                                {count > 0 && (
                                  <div className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md">
                                    {count}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex mt-2">
                    <div className="w-24"></div>
                    <div className="flex-1 grid grid-cols-5 gap-1 text-center text-xs font-medium text-gray-600 dark:text-gray-400">
                      {probabilidadLevels.map(p => <div key={p}>{ p === 1 ? 'MUY BAJA' : p === 2 ? 'BAJA' : p === 3 ? 'MEDIA' : p === 4 ? 'ALTA' : 'CRITICA' }</div>)}
                    </div>
                  </div>
                  <div className="text-center mt-2 font-semibold text-gray-500 text-sm ml-24">
                    PROBABILIDAD
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Resumen Global</h2>
              <div className="text-center mb-6">
                <div className="text-sm text-gray-500 mb-1">Riesgo global predominante</div>
                <div className="text-2xl font-bold text-red-500">
                  {stats.criticos > 0 ? 'CRITICO' : stats.altos > 0 ? 'ALTO' : stats.medios > 0 ? 'MEDIO' : 'BAJO'}
                </div>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-600 dark:text-gray-400 font-medium">Total de riesgos</span>
                <span className="text-xl font-bold">{stats.total}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Críticos</span>
                </div>
                <span className="font-semibold">{stats.criticos}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Altos</span>
                </div>
                <span className="font-semibold">{stats.altos}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Medios</span>
                </div>
                <span className="font-semibold">{stats.medios}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Bajos</span>
                </div>
                <span className="font-semibold">{stats.bajos}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* GRÁFICO DE ACTIVOS */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-6">Activos por Nivel de Riesgo</h2>
          {riesgos.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No hay riesgos evaluados para mostrar.</div>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getActivosData()} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip cursor={{fill: 'transparent'}} />
                  <Legend />
                  <Bar dataKey="CRITICO" stackId="a" fill="#ef4444" name="Crítico" />
                  <Bar dataKey="ALTO" stackId="a" fill="#f97316" name="Alto" />
                  <Bar dataKey="MEDIO" stackId="a" fill="#eab308" name="Medio" />
                  <Bar dataKey="BAJO" stackId="a" fill="#22c55e" name="Bajo" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        
        {/* TABLA DE VULNERABILIDADES Y SUS RIESGOS */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mt-6">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Detalle de Vulnerabilidades y Activos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 dark:text-gray-400">
              <thead className="bg-brand-light dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">Activo</th>
                  <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">Vulnerabilidad</th>
                  <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">Severidad CVSS</th>
                  <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">Probabilidad</th>
                  <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">Impacto</th>
                  <th className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100 text-right">Riesgo Calculado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {hallazgos.map(h => {
                  const evalRisk = riesgos.find(r => r.id_hallazgo === h.id_hallazgo);
                  return (
                    <tr key={h.id_hallazgo} className="hover:bg-brand-light dark:hover:bg-gray-900/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{h.activo_nombre || 'N/A'}</div>
                        <div className="text-xs text-gray-400">{h.codigo_activo}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{h.cve_id}</div>
                        <div className="text-xs text-gray-500 truncate max-w-xs">{h.titulo}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          h.severidad === 'CRITICA' ? 'bg-red-100 text-red-700' :
                          h.severidad === 'ALTA' ? 'bg-orange-100 text-orange-700' :
                          h.severidad === 'MEDIA' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {h.severidad} {h.cvss ? `(${h.cvss})` : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{evalRisk ? evalRisk.probabilidad : '-'}</td>
                      <td className="px-6 py-4 text-gray-500">{evalRisk ? evalRisk.impacto : '-'}</td>
                      <td className="px-6 py-4 text-right">
                        {evalRisk ? (
                          <span className={`font-bold ${
                            evalRisk.nivel_riesgo === 'CRITICO' ? 'text-red-600' :
                            evalRisk.nivel_riesgo === 'ALTO' ? 'text-orange-600' :
                            evalRisk.nivel_riesgo === 'MEDIO' ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {evalRisk.nivel_riesgo} ({evalRisk.puntaje})
                          </span>
                        ) : (
                          <button
                            onClick={handleAutoEvaluate}
                            className="text-xs text-brand-primary hover:text-brand-secondary font-medium bg-brand-accent/20 px-3 py-1.5 rounded-lg"
                          >
                            Evaluar ahora
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {hallazgos.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                      No hay vulnerabilidades registradas en el sistema.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      </div>
    );
  }
