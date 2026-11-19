import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ArrowRight, AlertTriangle } from 'lucide-react';
import { getSupabaseConfigStatus } from '../lib/supabaseConfig';

interface LoginScreenProps {
  onLogin: (correo: string, password: string) => Promise<string | null>;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configStatus = getSupabaseConfigStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const errMsg = await onLogin(correo, password);
      if (errMsg) {
        setError(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6FB] flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#EAE3F5] shadow-sm p-8 sm:p-10 space-y-7">
        {/* Brand Logo & Title */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#EC4899] text-white shadow-sm">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="3"
                y="4"
                width="8"
                height="7"
                rx="2"
                fill="currentColor"
                fillOpacity="0.95"
              />
              <rect
                x="13"
                y="4"
                width="8"
                height="11"
                rx="2"
                fill="currentColor"
                fillOpacity="0.65"
              />
              <rect
                x="3"
                y="13"
                width="8"
                height="7"
                rx="2"
                fill="currentColor"
                fillOpacity="0.65"
              />
              <circle cx="17" cy="18.5" r="2.5" fill="#FDE68A" />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#1F172B]">
              ControlOps
            </h1>
            <p className="text-xs text-[#7A6B93] mt-0.5">
              Monitoreo de Cajas y Auditoría de Sucursales
            </p>
          </div>
        </div>

        {!configStatus.configured && (
          <div
            role="alert"
            className="rounded-xl bg-[#FFF1F2] border border-[#FECDD3] px-4 py-3 text-xs text-[#BE123C] flex items-start gap-2"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#E11D48]" />
            <div>
              <p className="font-bold">Error de configuración Supabase</p>
              <p className="mt-0.5">{configStatus.errorMessage}</p>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-[#FFF1F2] border border-[#FECDD3] px-4 py-3 text-xs font-medium text-[#BE123C]"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-correo"
              className="block text-xs font-semibold text-[#55476E] mb-1.5"
            >
              Correo o Usuario
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 text-[#8B7CA5] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-correo"
                type="text"
                required
                autoComplete="username"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="Ingresa tu correo o usuario"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-sm text-[#1F172B] placeholder:text-[#A394BA] focus:outline-none focus:border-[#7C3AED] focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-[#55476E] mb-1.5"
            >
              Contraseña
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-[#8B7CA5] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-sm text-[#1F172B] placeholder:text-[#A394BA] focus:outline-none focus:border-[#7C3AED] focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B7CA5] hover:text-[#1F172B] p-1"
                aria-label={
                  showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
              >
                {showPass ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors disabled:opacity-60 mt-2"
          >
            {loading ? 'Validando acceso...' : 'Iniciar sesión'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
