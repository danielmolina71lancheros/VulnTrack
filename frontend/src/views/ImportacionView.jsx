import React, { useState, useRef } from 'react';
import { UploadCloud, FileDown, CheckCircle, AlertTriangle, FileSpreadsheet, Download, Info } from 'lucide-react';
import { getUserRole } from '../utils/auth';
import { apiUpload, apiGetBlob } from '../utils/apiClient';

export default function ImportacionView() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          selectedFile.name.endsWith('.xlsx')) {
        setFile(selectedFile);
        setResult(null);
      } else {
        alert("Por favor selecciona un archivo Excel (.xlsx)");
        e.target.value = null;
      }
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiGetBlob('/api/importacion/plantilla');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SecureHub_Carga_Masiva.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading template:', error);
      alert("Error al descargar la plantilla.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const data = await apiUpload('/api/importacion/excel', formData);
      setResult({ success: true, data });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = null;
    } catch (error) {
      console.error('Upload error:', error);
      // error.message trae el data.error del backend.
      setResult({ success: false, data: { error: error.message || 'Error de conexión con el servidor.' } });
    } finally {
      setUploading(false);
    }
  };

  // Solo ADMIN y ANALISTA pueden importar
  if (!['ADMINISTRADOR', 'ANALISTA_SEGURIDAD'].includes(getUserRole())) {
    return (
      <div className="p-6 text-center text-gray-500 mt-20">
        No tienes permisos para acceder a este módulo.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-2 bg-brand-accent/30 rounded-lg shadow-sm">
          <UploadCloud className="w-6 h-6 text-brand-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Carga Masiva de Datos</h1>
          <p className="text-sm text-gray-500">Importación de activos y vulnerabilidades vía Excel (.xlsx)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel Izquierdo: Descarga e Instrucciones */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 dark:border-gray-800 bg-brand-light dark:bg-gray-900/50 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-gray-900 dark:text-gray-100">1. Descargar Plantilla</h2>
          </div>
          <div className="p-6 flex-1 flex flex-col">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
              Para garantizar que los datos se integren correctamente, debes utilizar la plantilla oficial. La plantilla contiene dos hojas: <strong>Activos</strong> y <strong>Vulnerabilidades</strong>, junto con instrucciones detalladas de los campos obligatorios.
            </p>
            
            <div className="mt-auto">
              <button 
                onClick={handleDownloadTemplate}
                className="w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 py-3 px-4 rounded-lg font-medium transition-colors"
              >
                <Download className="w-5 h-5" />
                Descargar Plantilla Excel
              </button>
            </div>
            
            <div className="mt-6 flex items-start gap-3 p-4 bg-brand-accent/20 border border-brand-accent/40 rounded-lg text-sm text-brand-dark">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-brand-primary" />
              <p>El sistema soporta actualización (Upsert). Si un Activo con el mismo Código ya existe, se actualizarán sus datos. Los CVEs nuevos se programarán para enriquecimiento automático NVD en segundo plano.</p>
            </div>
          </div>
        </div>

        {/* Panel Derecho: Subida de Archivo */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 dark:border-gray-800 bg-brand-light dark:bg-gray-900/50 flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-brand-primary" />
            <h2 className="font-bold text-gray-900 dark:text-gray-100">2. Cargar Archivo</h2>
          </div>
          <div className="p-6 flex-1 flex flex-col">
            
            <div className="flex-1">
              <label 
                className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${file ? 'border-brand-primary bg-brand-accent/20' : 'border-gray-300 dark:border-gray-600 bg-brand-light dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {file ? (
                    <>
                      <FileSpreadsheet className="w-10 h-10 text-brand-primary mb-3" />
                      <p className="mb-2 text-sm text-brand-primary font-semibold">{file.name}</p>
                      <p className="text-xs text-brand-primary">{(file.size / 1024).toFixed(1)} KB</p>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-10 h-10 text-gray-400 mb-3" />
                      <p className="mb-2 text-sm text-gray-500"><span className="font-semibold text-brand-primary">Haz clic para subir</span> o arrastra y suelta</p>
                      <p className="text-xs text-gray-400">Solo archivos .xlsx</p>
                    </>
                  )}
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                />
              </label>
            </div>

            <div className="mt-6">
              <button 
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-secondary disabled:bg-brand-primary/40 text-white py-3 px-4 rounded-lg font-medium transition-colors shadow-sm"
              >
                {uploading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Procesando Archivo...
                  </>
                ) : (
                  <>
                    <FileDown className="w-5 h-5" />
                    Iniciar Importación
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resultados de la Importación */}
      {result && (
        <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {result.success ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
              <div className="bg-emerald-50 border-b border-emerald-100 p-4 flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
                <h3 className="font-bold text-emerald-900">Importación Completada Exitosamente</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-brand-light dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 text-center">
                    <div className="text-2xl font-black text-gray-900 dark:text-gray-100">{result.data.resumen.activos_creados}</div>
                    <div className="text-xs font-medium text-gray-500 uppercase mt-1">Activos Nuevos</div>
                  </div>
                  <div className="p-4 bg-brand-light dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 text-center">
                    <div className="text-2xl font-black text-gray-900 dark:text-gray-100">{result.data.resumen.activos_actualizados}</div>
                    <div className="text-xs font-medium text-gray-500 uppercase mt-1">Activos Actualizados</div>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                    <div className="text-2xl font-black text-emerald-700">{result.data.resumen.vulnerabilidades_creadas}</div>
                    <div className="text-xs font-medium text-emerald-600 uppercase mt-1">Vulns. Importadas</div>
                  </div>
                  <div className="p-4 bg-brand-accent/20 rounded-lg border border-brand-accent/40 text-center">
                    <div className="text-2xl font-black text-brand-primary">{result.data.resumen.pendientes_enriquecimiento}</div>
                    <div className="text-xs font-medium text-brand-primary uppercase mt-1">Enriqueciendo NVD...</div>
                  </div>
                </div>

                {result.data.errores && result.data.errores.length > 0 && (
                  <div className="mt-4 border border-orange-200 rounded-lg overflow-hidden">
                    <div className="bg-orange-50 px-4 py-2 text-sm font-bold text-orange-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Advertencias durante la importación ({result.data.errores.length})
                    </div>
                    <ul className="divide-y divide-orange-100 max-h-[200px] overflow-y-auto bg-white dark:bg-gray-800">
                      {result.data.errores.map((err, idx) => (
                        <li key={idx} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                          <span className="font-semibold text-orange-600 mr-2">[{err.hoja} - Fila {err.fila}]</span> 
                          {err.mensaje}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 shadow-sm overflow-hidden">
              <div className="bg-red-50 border-b border-red-100 p-4 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600" />
                <h3 className="font-bold text-red-900">Error en la Importación</h3>
              </div>
              <div className="p-6">
                <p className="text-gray-800 dark:text-gray-200 font-medium mb-4">{result.data.error || 'Ocurrió un error inesperado al procesar el archivo.'}</p>
                
                {result.data.detalles && result.data.detalles.length > 0 && (
                  <div className="bg-brand-light dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Detalles del Error:</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {result.data.detalles.map((det, idx) => (
                        <li key={idx} className="text-sm text-red-600">
                          <span className="font-semibold">[{det.hoja} - Fila {det.fila}]</span> {det.mensaje}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
