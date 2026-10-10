import React, { useState } from 'react';
import Dashboard from './Dashboard';
import { Shield, Eye, EyeOff } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', minHeight: '100vh' }}>
          <h1>Algo salió mal.</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error && this.state.error.toString()}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [requiereMfa, setRequiereMfa] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const iniciarSesion = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correo,
          password,
          ...(requiereMfa && { mfa_token: mfaToken })
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.mensaje || 'Error al iniciar sesión');
        return;
      }
      if (data.mfa_requerido) {
        setRequiereMfa(true);
      } else {
        localStorage.setItem('vulntrack_token', data.token);
        setExito(true);
      }
    } catch (err) {
      setError('No se pudo conectar con el servidor.');
    }
  };

  const cerrarSesion = () => {
    localStorage.removeItem('vulntrack_token');
    setExito(false);
    setCorreo('');
    setPassword('');
    setMfaToken('');
    setRequiereMfa(false);
  };

  if (exito || localStorage.getItem('vulntrack_token')) {
    return <Dashboard onLogout={cerrarSesion} />;
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* Panel Izquierdo - Formulario */}
      <div className="w-full lg:w-[480px] bg-brand-dark flex flex-col justify-center px-12 py-10">
        {/* Logo */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-gradient-to-br from-brand-primary to-brand-secondary p-2.5 rounded-xl">
              <Shield className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">SecureHub</h1>
              <p className="text-[11px] text-gray-400">Gestión de Vulnerabilidades y Riesgos</p>
            </div>
          </div>
        </div>

        {/* Título */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-1">Bienvenido</h2>
          <p className="text-gray-400 text-sm">Inicia sesión para acceder a la plataforma</p>
        </div>

        <form onSubmit={iniciarSesion} className="space-y-5">
          {!requiereMfa ? (
            <>
              <div>
                <div className="relative">
                  <input
                    type="email"
                    className="w-full bg-white/5 border border-gray-600/50 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors text-sm"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="Usuario o correo electrónico"
                    required
                  />
                </div>
              </div>
              <div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full bg-white/5 border border-gray-600/50 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors text-sm pr-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-600 bg-transparent" />
                  Recordarme
                </label>
                <a href="#" className="text-brand-accent hover:text-brand-accent transition-colors">¿Olvidaste tu contraseña?</a>
              </div>
            </>
          ) : (
            <div>
              <div className="bg-brand-primary/10 border border-brand-primary/50 p-4 rounded-xl mb-6 text-center">
                <p className="text-brand-accent text-sm">
                  Abre <b>Google Authenticator</b> en tu celular e ingresa el código de 6 dígitos.
                </p>
              </div>
              <input
                type="text"
                maxLength="6"
                className="w-full bg-white/5 border border-gray-600/50 rounded-xl px-4 py-4 text-white text-center text-2xl tracking-[0.5em] placeholder-gray-500 focus:outline-none focus:border-brand-primary transition-colors"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="123456"
                required
              />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-secondary hover:to-brand-primary text-white font-semibold py-3.5 px-4 rounded-xl transition-all duration-200 text-sm"
          >
            {requiereMfa ? 'Verificar Identidad' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="mt-12 pt-6 border-t border-gray-800 text-center">
          <p className="text-[11px] text-gray-500">Seguridad · Control · Trazabilidad</p>
        </div>
      </div>

      {/* Panel Derecho - Decorativo */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-[#0B132B] via-[#1C2541] to-[#0B132B] items-center justify-center relative overflow-hidden">
        {/* Glow effects */}
        <div className="absolute w-96 h-96 bg-brand-primary/20 rounded-full blur-[128px] top-1/4 left-1/4"></div>
        <div className="absolute w-64 h-64 bg-brand-accent/20 rounded-full blur-[96px] bottom-1/4 right-1/4"></div>

        <div className="text-center z-10">
          {/* Shield icon */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="w-40 h-40 rounded-full border-2 border-brand-primary/30 flex items-center justify-center">
                <div className="w-28 h-28 rounded-full border-2 border-brand-accent/50 flex items-center justify-center bg-gradient-to-br from-brand-primary/10 to-brand-accent/10 backdrop-blur-sm">
                  <Shield className="text-brand-accent" size={48} />
                </div>
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-brand-accent rounded-full opacity-60 animate-pulse"></div>
              <div className="absolute -bottom-1 -left-3 w-4 h-4 bg-brand-primary rounded-full opacity-40 animate-pulse"></div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3 max-w-sm">
            Protege tus activos, reduce riesgos, mantén el control.
          </h2>
        </div>
      </div>
    </div>
  );
}
