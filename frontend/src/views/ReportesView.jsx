import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Activity, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle,
  BarChart,
  ChevronRight
} from 'lucide-react';

export default function ReportesView() {
  const [activeTab, setActiveTab] = useState('ejecutivos');
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activos, setActivos] = useState([]);
  const [selectedActivo, setSelectedActivo] = useState('');

  React.useEffect(() => {
    const fetchActivos = async () => {
      try {
        const token = localStorage.getItem('vulntrack_token');
        const res = await fetch('/api/activos', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setActivos(data);
        }
      } catch (error) {
        console.error("Error fetching activos:", error);
      }
    };
    fetchActivos();
  }, []);

  const reports = [
    {
      id: 'ejecutivo',
      title: 'Reporte ejecutivo',
      description: 'Resumen de estado y métricas clave.',
      icon: Activity,
      iconColor: 'text-brand-primary',
      bgColor: 'bg-brand-accent/20',
      type: 'ejecutivos',
      endpoint: '/api/dashboard/metricas'
    },
    {
      id: 'vulnerabilidades',
      title: 'Reporte de vulnerabilidades',
      description: 'Detalle técnico por CVE y activos.',
      icon: ShieldAlert,
      iconColor: 'text-orange-500',
      bgColor: 'bg-orange-50',
      type: 'tecnicos',
      endpoint: '/api/hallazgos'
    },
    {
      id: 'riesgos',
      title: 'Reporte de riesgos',
      description: 'Matriz y análisis de riesgo.',
      icon: AlertTriangle,
      iconColor: 'text-brand-secondary',
      bgColor: 'bg-brand-secondary/10',
      type: 'tecnicos',
      endpoint: '/api/riesgos'
    },
    {
      id: 'sla',
      title: 'Reporte de cumplimiento SLA',
      description: 'Tiempos y estados de remediación.',
      icon: CheckCircle,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-50',
      type: 'ejecutivos',
      endpoint: '/api/remediacion'
    }
  ];

  const handleGenerateReport = async (report) => {
    setSelectedReport(report);
    setLoading(true);
    setReportData(null);
    try {
      const token = localStorage.getItem('vulntrack_token');
      const url = selectedActivo ? `${report.endpoint}?id_activo=${selectedActivo}` : report.endpoint;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      } else {
        setReportData({ error: 'No se pudo cargar la información del reporte.' });
      }
    } catch (error) {
      console.error(error);
      setReportData({ error: 'Error al conectar con el servidor.' });
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = reports.filter(r => 
    activeTab === 'todos' || r.type === activeTab || (activeTab === 'ejecutivos' && r.type === 'ejecutivos') || (activeTab === 'tecnicos' && r.type === 'tecnicos')
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-accent/30 rounded-lg">
              <FileText className="w-6 h-6 text-brand-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reportes</h1>
          </div>
          <p className="mt-2 text-gray-500">
            Genera y visualiza reportes del estado de seguridad y cumplimiento.
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={selectedActivo}
            onChange={(e) => setSelectedActivo(e.target.value)}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm bg-white dark:bg-gray-800"
          >
            <option value="">Todos los activos</option>
            {activos.map(a => (
              <option key={a.id_activo} value={a.id_activo}>
                {a.nombre} - {a.ip_address}
              </option>
            ))}
          </select>
          <button 
            onClick={() => handleGenerateReport(reports[0])}
            className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-secondary font-medium flex items-center shadow-sm whitespace-nowrap"
          >
            <BarChart className="w-4 h-4 mr-2" />
            + Generar reporte
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('ejecutivos')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'ejecutivos'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:border-gray-600'
            }`}
          >
            Ejecutivos
          </button>
          <button
            onClick={() => setActiveTab('tecnicos')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'tecnicos'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:border-gray-600'
            }`}
          >
            Técnicos
          </button>
        </nav>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredReports.map((report) => {
          const Icon = report.icon;
          const isSelected = selectedReport?.id === report.id;
          
          return (
            <div 
              key={report.id}
              onClick={() => handleGenerateReport(report)}
              className={`p-6 bg-white dark:bg-gray-800 rounded-xl border cursor-pointer transition-all ${
                isSelected ? 'border-brand-primary shadow-md ring-1 ring-brand-primary' : 'border-gray-200 dark:border-gray-700 shadow-sm hover:border-brand-primary hover:shadow-md'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex space-x-4">
                  <div className={`p-3 rounded-xl ${report.bgColor}`}>
                    <Icon className={`w-6 h-6 ${report.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{report.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                  </div>
                </div>
                <div className="text-gray-400 hover:text-brand-primary bg-brand-light dark:bg-gray-900 p-2 rounded-full">
                  <Download className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedReport && (
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-brand-light dark:bg-gray-900 flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <selectedReport.icon className={`w-5 h-5 mr-2 ${selectedReport.iconColor}`} />
              Vista Previa: {selectedReport.title}
            </h3>
            <button className="text-sm text-brand-primary font-medium hover:text-brand-secondary flex items-center">
              Exportar a PDF
              <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
          
          <div className="p-6 min-h-[300px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                <p>Generando datos del reporte...</p>
              </div>
            ) : reportData?.error ? (
              <div className="text-center text-red-500 p-8 bg-red-50 rounded-lg">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                {reportData.error}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 mb-4">Datos del reporte extraídos exitosamente.</p>
                {selectedReport.id === 'ejecutivo' && reportData && !Array.isArray(reportData) ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(reportData).map(([key, value]) => (
                      <div key={key} className="bg-brand-light dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 text-center">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">{key.replace(/_/g, ' ')}</div>
                        <div className="text-2xl font-black text-gray-900 dark:text-gray-100">{typeof value === 'object' ? Object.keys(value).length : value}</div>
                      </div>
                    ))}
                  </div>
                ) : Array.isArray(reportData) && reportData.length > 0 ? (
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-brand-light dark:bg-gray-900 text-gray-600 dark:text-gray-400">
                        <tr>
                          {Object.keys(reportData[0]).slice(0, 5).map(k => (
                            <th key={k} className="px-4 py-3 font-medium uppercase text-xs">{k.replace(/_/g, ' ')}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {reportData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-brand-light dark:hover:bg-gray-900">
                            {Object.values(row).slice(0, 5).map((val, vIdx) => (
                              <td key={vIdx} className="px-4 py-3 text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">No hay datos disponibles para este reporte.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
