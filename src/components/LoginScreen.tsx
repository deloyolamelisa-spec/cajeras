import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, Database, ArrowRight } from 'lucide-react';
import { INITIAL_USUARIOS } from '../data/mockData';

interface LoginScreenProps {
  onLogin: (correo: string, password: string) => Promise<string | null>;
  onOpenSupabaseModal: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  onOpenSupabaseModal,
}) => {
  const [correo, setCorreo] = useState('admin@controlops.mx');
  const [password, setPassword] = useState('Control2026!');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const quickProfiles = [
    {
      label: 'Creador (Admin Total)',
      user: INITIAL_USUARIOS[0],
      desc: 'Control total · 17 sucursales · Catálogos y usuarios',
    },
    {
      label: 'Supervisor',
      user: INITIAL_USUARIOS[1],
      desc: 'Ranking y auditoría de sucursales · Sin edición global',
    },
    {
      label: 'Cajera (Suc. Centro)',
      user: INITIAL_USUARIOS[2],
      desc: 'Solo su sucursal · Llamadas, actividades y gastos',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F6FB] flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 bg-white rounded-3xl border border-[#EAE3F5] shadow-sm overflow-hidden">
        {/* Left: Brand & Role Overview */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#F6F1FC] via-[#FAF5FF] to-[#FDF2F8] p-7 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#EAE3F5]">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#EC4899] text-white shadow-sm">
                <svg
                  width="20"
                  height="20"
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
                <h1 className="font-display text-xl font-bold text-[#1F172B]">
                  ControlOps
                </h1>
                <p className="text-xs text-[#6E5F87]">
                  Monitoreo de Cajas y Auditoría
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <h2 className="font-display text-lg font-bold text-[#1F172B] leading-snug">
                Acceso operativo por perfil y sucursal
              </h2>
              <p className="text-xs text-[#55476E] leading-relaxed">
                Cada rol accede únicamente a las herramientas y sucursales
                autorizadas en{' '}
                <code className="font-mono text-[#6D28D9]">
                  usuarios_controlops
                </code>
                .
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-[11px] font-semibold text-[#7A6B93]">
                Perfiles iniciales para prueba rápida
              </p>
              <div className="space-y-2">
                {quickProfiles.map((p) => (
                  <button
                    key={p.user.id}
                    type="button"
                    onClick={() => {
                      setCorreo(p.user.correo);
                      setPassword(p.user.password);
                      setError(null);
                    }}
                    className="w-full text-left rounded-xl bg-white/85 hover:bg-white border border-[#E6DDF5] px-3.5 py-2.5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#4C1D95]">
                        {p.label}
                      </span>
                      <span className="font-mono-num text-[11px] text-[#DB2777]">
                        Autocompletar
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6E5F87] mt-0.5">
                      {p.desc}
                    </p>
                    <p className="font-mono-num text-[11px] text-[#8B7CA5] mt-1">
                      {p.user.correo} · {p.user.password}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSupabaseModal}
            className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-[#5B21B6] hover:text-[#DB2777] transition-colors w-fit"
          >
            <Database className="h-3.5 w-3.5" />
            Ver Script SQL y estado de Supabase
          </button>
        </div>

        {/* Right: Login Form */}
        <div className="lg:col-span-7 p-7 sm:p-10 flex flex-col justify-center">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#1F172B]">
                Iniciar sesión
              </h2>
              <p className="text-sm text-[#7A6B93] mt-1">
                Ingresa tu correo o nombre de usuario y contraseña.
              </p>
            </div>

            {error && (
              <div className="rounded-xl bg-[#FFF1F2] border border-[#FECDD3] px-4 py-3 text-xs font-medium text-[#BE123C]">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#55476E] mb-1.5">
                  Correo o usuario
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-[#8B7CA5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="usuario@controlops.mx"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-sm text-[#1F172B] focus:outline-none focus:border-[#7C3AED] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#55476E] mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-[#8B7CA5] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-sm text-[#1F172B] focus:outline-none focus:border-[#7C3AED] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B7CA5] hover:text-[#1F172B]"
                    aria-label="Mostrar u ocultar contraseña"
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
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors disabled:opacity-60"
              >
                {loading ? 'Validando acceso...' : 'Entrar a ControlOps'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
