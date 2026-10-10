import { useState, useEffect } from 'react';
import { Shield, LayoutDashboard, Users, ShieldCheck, Monitor, AlertTriangle, Crosshair, CheckSquare, FileText, ClipboardList, LogOut, Bell, Search, Settings, Smartphone } from 'lucide-react';
import ResumenDashboard from './views/ResumenDashboard';
import ActivosView from './views/ActivosView';
import VulnerabilidadesView from './views/VulnerabilidadesView';
import RiesgosView from './views/RiesgosView';
import RemediacionesView from './views/RemediacionesView';
import UsuariosView from './views/UsuariosView';
import RolesPermisosView from './views/RolesPermisosView';
import EvidenciasView from './views/EvidenciasView';
import ReportesView from './views/ReportesView';
import ImportacionView from './views/ImportacionView';
import { getUserData } from './utils/auth';
import { UploadCloud, Sun, Moon } from 'lucide-react';

export default function Dashboard({ onLogout }) {
  const [vistaActual, setVistaActual] = useState('dashboard');
  const [qrMfa, setQrMfa] = useState('');
  const [tokenMfa, setTokenMfa] = useState('');
  const [mfaEnabledSession, setMfaEnabledSession] = useState(false);
  const [busquedaGlobal, setBusquedaGlobal] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    setIsDarkMode(isDark);
  };

  
  const [userData, setUserData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const data = getUserData();
    setUserData(data);
    if (data) setMfaEnabledSession(data.mfa_enabled || false);
    fetchNotifications();
  }, []);

  const handleLogoutAttempt = () => {
    if (!mfaEnabledSession) {
      alert("Por políticas de seguridad de la empresa, es OBLIGATORIO configurar el Segundo Factor de Autenticación (MFA) antes de salir. Por favor, asegure su cuenta.");
      configurarMFA();
    } else {
      onLogout();
    }
  };

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('vulntrack_token');
      const res = await fetch('/api/auditoria', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Take the latest 5 events as notifications
        setNotifications(data.slice(0, 5));
      }
    } catch (e) {
      console.error('Error fetching notifications:', e);
    }
  };

  const configurarMFA = async () => {
    try {
      const token = localStorage.getItem('vulntrack_token');
      const response = await fetch('/api/auth/mfa/configurar', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        alert('Su sesion ha expirado. Por favor ingrese de nuevo.');
        onLogout();
        return;
      }
      const data = await response.json();
      if (data.error) {
        if(data.error.includes("configurado")){ setMfaEnabledSession(true); onLogout(); } else { alert(data.error); }
      } else {
        setQrMfa(data.qr_code);
      }
    } catch (err) {
      alert("Error generando QR");
    }
  };

  const activarMFA = async () => {
    try {
      const token = localStorage.getItem('vulntrack_token');
      const response = await fetch('/api/auth/mfa/habilitar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token_mfa: tokenMfa })
      });
      const data = await response.json();
      if (response.ok) {
        alert("¡MFA Activado exitosamente!");
        setQrMfa('');
        setTokenMfa('');
      } else {
        alert(data.error || "Código inválido");
      }
    } catch (err) {
      alert("Error verificando código");
    }
  };

  const navSections = [
    {
      items: [
        { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
        { id: 'usuarios', label: 'Usuarios', icon: Users },
        { id: 'roles', label: 'Roles y Permisos', icon: ShieldCheck },
        { id: 'activos', label: 'Activos', icon: Monitor },
        { id: 'vulnerabilidades', label: 'Vulnerabilidades', icon: AlertTriangle },
        { id: 'importacion', label: 'Importación', icon: UploadCloud },
        { id: 'riesgos', label: 'Riesgos', icon: Crosshair },
        { id: 'remediaciones', label: 'Remediación', icon: CheckSquare },
        { id: 'evidencias', label: 'Evidencias', icon: ClipboardList },
        { id: 'reportes', label: 'Reportes', icon: FileText },
      ]
    }
  ];

  const tituloVista = {
    dashboard: 'Dashboard',
    usuarios: 'Usuarios',
    roles: 'Roles y Permisos',
    activos: 'Activos',
    vulnerabilidades: 'Vulnerabilidades',
    importacion: 'Importación Masiva',
    riesgos: 'Riesgos',
    remediaciones: 'Remediación',
    evidencias: 'Evidencias',
    reportes: 'Reportes',
    configuracion: 'Configuración'
  };

  return (
    <div className="min-h-screen bg-brand-light dark:bg-gray-900 flex font-sans">

      {/* Sidebar */}
      <aside className="w-64 bg-brand-dark text-gray-300 flex flex-col h-screen sticky top-0 overflow-hidden">

        {/* Logo */}
        <div className="p-5 pb-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-brand-primary to-brand-secondary p-2 rounded-xl">
              <Shield className="text-white" size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">SecureHub</h1>
              <p className="text-[10px] text-gray-500">Vulnerability Management</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {navSections[0].items.map(item => {
            const Icon = item.icon;
            const isActive = vistaActual === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setVistaActual(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-white' : 'text-gray-500'} />
                {item.label}
              </button>
            );
          })}

          <div className="h-px bg-[#1d3540] my-4"></div>

          <button
            onClick={() => setVistaActual('configuracion')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
              vistaActual === 'configuracion'
                ? 'bg-brand-primary text-white'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <Settings size={18} className={vistaActual === 'configuracion' ? 'text-white' : 'text-gray-500'} />
            Configuración
          </button>
        </div>

        {/* Bottom */}
        <div className="p-4 space-y-3 border-t border-gray-800/50">
          <div
            className="bg-white/5 rounded-lg p-3 border border-white/10 flex items-center gap-3 cursor-pointer hover:bg-white/10 transition-colors"
            onClick={configurarMFA}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]"></div>
            <div>
              <p className="text-xs font-bold text-white">Sistema activo</p>
              <p className="text-[10px] text-gray-500">Servicios locales</p>
            </div>
          </div>

          <button
            onClick={toggleDarkMode}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors px-1"
          >
            {isDarkMode ? <Sun size={14} /> : <Moon size={14} />} {isDarkMode ? 'Modo Claro' : 'Modo Oscuro'}
          </button>

          <button
            onClick={handleLogoutAttempt}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-white transition-colors px-1"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 h-14 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-md flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busquedaGlobal}
                onChange={e => setBusquedaGlobal(e.target.value)}
                placeholder="Buscar activos, vulnerabilidades, CVE..."
                className="w-full pl-10 pr-4 py-2 bg-brand-light dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:border-brand-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors"
              >
                <Bell size={20} />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-white">
                    {notifications.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm">Notificaciones (Auditoría)</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">No hay actividad reciente</div>
                    ) : (
                      notifications.map(notif => (
                        <div key={notif.id_evento} className="px-4 py-3 border-b border-gray-50 hover:bg-brand-light dark:hover:bg-gray-900 transition-colors">
                          <p className="text-xs font-semibold text-brand-primary">{notif.modulo}</p>
                          <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">{notif.accion}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{new Date(notif.fecha_evento).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pl-5 border-l border-gray-200 dark:border-gray-700">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center text-white font-bold text-sm">
                {userData?.nombre_completo ? userData.nombre_completo.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-tight">
                  {userData?.nombre_completo || 'Usuario'}
                </p>
                <p className="text-[10px] text-gray-400">
                  {userData?.rol?.replace('_', ' ') || 'Cargando...'}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-8 flex-1 bg-white dark:bg-gray-800">
          {vistaActual === 'dashboard' && <ResumenDashboard />}
          {vistaActual === 'usuarios' && <UsuariosView />}
          {vistaActual === 'roles' && <RolesPermisosView />}
          {vistaActual === 'activos' && <ActivosView />}
          {vistaActual === 'vulnerabilidades' && <VulnerabilidadesView />}
          {vistaActual === 'importacion' && <ImportacionView />}
          {vistaActual === 'riesgos' && <RiesgosView />}
          {vistaActual === 'remediaciones' && <RemediacionesView />}
          {vistaActual === 'evidencias' && <EvidenciasView />}
          {vistaActual === 'reportes' && <ReportesView />}

          {vistaActual === 'configuracion' && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Settings size={48} className="mb-4 opacity-30" />
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">Configuración</h3>
              <p className="text-sm text-gray-500 max-w-sm text-center">
                Módulo de configuración del sistema.
              </p>
              <button
                onClick={configurarMFA}
                className="mt-6 bg-brand-primary hover:bg-brand-secondary text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                <Smartphone size={16} /> Configurar MFA
              </button>
            </div>
          )}
        </div>
      </main>

      {/* MFA Modal */}
      {qrMfa && (
        <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl text-center max-w-sm border border-gray-100 dark:border-gray-800">
            <h3 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-200">Activar MFA</h3>
            <p className="text-gray-500 text-sm mb-4">1. Escanea el código con tu app (Google Authenticator).</p>
            <img src={qrMfa} alt="QR MFA" className="mx-auto border-4 border-gray-100 dark:border-gray-800 rounded-xl shadow-sm mb-4" />
            <p className="text-gray-500 text-sm mb-2">2. Ingresa el código de 6 dígitos para verificar.</p>
            <input
              type="text"
              maxLength="6"
              value={tokenMfa}
              onChange={e => setTokenMfa(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="123456"
              className="w-full text-center text-2xl tracking-[0.5em] p-3 border border-gray-300 dark:border-gray-600 rounded-lg mb-4 focus:outline-none focus:border-brand-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setQrMfa(''); setTokenMfa(''); }}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={activarMFA}
                disabled={tokenMfa.length !== 6}
                className="flex-1 py-2.5 bg-brand-primary hover:bg-brand-secondary disabled:bg-brand-primary/40 text-white rounded-lg font-medium transition-colors"
              >
                Verificar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
