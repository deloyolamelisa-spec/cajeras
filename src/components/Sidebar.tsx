import React from 'react';
import {
  Trophy,
  PhoneCall,
  ClipboardCheck,
  Wallet,
  Clock,
  Building2,
  Plus,
  Database,
  X,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import {
  RolUsuario,
  SectionId,
  Sucursal,
  UsuarioControlOps,
} from '../types/controlops';

interface SidebarProps {
  activeSection: SectionId;
  onSelectSection: (section: SectionId) => void;
  sucursales: Sucursal[];
  selectedSucursalId: string;
  onSelectSucursal: (id: string) => void;
  onQuickAction: (action: 'llamada' | 'evidencia' | 'gasto') => void;
  supabaseConnected: boolean;
  onOpenSupabaseModal: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  branchAlerts: Record<string, boolean>;
  currentUser: UsuarioControlOps;
  onLogout: () => void;
}

const NAV_ITEMS: {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: RolUsuario[];
}[] = [
  {
    id: 'ranking',
    label: 'Ranking General',
    icon: Trophy,
    roles: ['supervisor', 'creador'],
  },
  {
    id: 'llamadas',
    label: 'Llamadas',
    icon: PhoneCall,
    roles: ['cajera', 'supervisor', 'creador'],
  },
  {
    id: 'actividades',
    label: 'Actividades',
    icon: ClipboardCheck,
    roles: ['cajera', 'supervisor', 'creador'],
  },
  {
    id: 'gastos',
    label: 'Gastos y Refrendos',
    icon: Wallet,
    roles: ['cajera', 'supervisor', 'creador'],
  },
  {
    id: 'horarios',
    label: 'Configuración de Horarios',
    icon: Clock,
    roles: ['cajera', 'supervisor', 'creador'],
  },
  {
    id: 'admin',
    label: 'Administración y Catálogos',
    icon: ShieldCheck,
    roles: ['creador'],
  },
];

const ROL_LABELS: Record<RolUsuario, string> = {
  cajera: 'Cajera',
  supervisor: 'Supervisor',
  creador: 'Creador · Admin Total',
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  sucursales,
  selectedSucursalId,
  onSelectSucursal,
  onQuickAction,
  supabaseConnected,
  onOpenSupabaseModal,
  mobileOpen,
  onCloseMobile,
  branchAlerts,
  currentUser,
  onLogout,
}) => {
  const activeSucursales = sucursales.filter((s) => s.activa);
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(currentUser.rol)
  );
  const visibleSucursales =
    currentUser.rol === 'cajera'
      ? activeSucursales.filter((s) => s.id === currentUser.sucursal_id)
      : activeSucursales;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-[#EAE3F5] text-[#1F172B]">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1ECF9]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#EC4899] text-white shadow-sm">
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
            <span className="font-display text-lg font-bold tracking-tight text-[#1F172B]">
              ControlOps
            </span>
            <p className="text-[11px] text-[#7A6B93] leading-tight">
              Cajas y Auditoría
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden rounded-lg p-1.5 text-[#6E5F87] hover:bg-[#F5F0FC]"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Logged-in Profile Banner */}
      <div className="px-4 py-3 border-b border-[#F1ECF9] bg-[#FAF8FC]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#1F172B] truncate">
              {currentUser.nombre}
            </p>
            <p className="text-[11px] font-medium text-[#DB2777] truncate">
              {ROL_LABELS[currentUser.rol]}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Cerrar sesión"
            className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-white hover:text-[#BE123C] border border-transparent hover:border-[#EAE3F5] transition-colors shrink-0"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6">
        {/* Main Navigation */}
        <nav aria-label="Navegación principal" className="space-y-1">
          <p className="px-2.5 pb-1 text-[11px] font-medium text-[#8B7CA5]">
            Módulos operativos
          </p>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-[#F3ECFC] text-[#5B21B6]'
                    : 'text-[#55476E] hover:bg-[#FAF7FE] hover:text-[#1F172B]'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-[#DB2777]' : 'text-[#8B7CA5]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active Branches */}
        <div className="pt-2 border-t border-[#F1ECF9]">
          <div className="flex items-center justify-between px-2.5 pb-2">
            <span className="text-[11px] font-medium text-[#8B7CA5]">
              {currentUser.rol === 'cajera'
                ? 'Sucursal asignada'
                : `Sucursales activas (${visibleSucursales.length})`}
            </span>
          </div>
          <div className="space-y-1">
            {currentUser.rol !== 'cajera' && (
              <button
                type="button"
                onClick={() => {
                  onSelectSucursal('todas');
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  selectedSucursalId === 'todas'
                    ? 'bg-[#FDF2F8] text-[#9D174D] border border-[#FBCFE8]'
                    : 'text-[#55476E] hover:bg-[#FAF7FE]'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  Todas las sucursales
                </span>
                <span className="font-mono-num text-[11px] text-[#8B7CA5]">
                  {visibleSucursales.length}
                </span>
              </button>
            )}

            {visibleSucursales.map((suc) => {
              const isSelected = selectedSucursalId === suc.id;
              const hasAlert = branchAlerts[suc.id];
              return (
                <button
                  key={suc.id}
                  type="button"
                  onClick={() => {
                    onSelectSucursal(suc.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors text-left ${
                    isSelected
                      ? 'bg-[#F3ECFC] text-[#5B21B6] font-semibold'
                      : 'text-[#55476E] hover:bg-[#FAF7FE]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate">{suc.nombre}</div>
                    <div className="text-[11px] text-[#8B7CA5] truncate">
                      {suc.responsable_caja}
                    </div>
                  </div>
                  {hasAlert ? (
                    <span className="shrink-0 text-[10px] font-medium text-[#BE123C] bg-[#FFE4E6] px-1.5 py-0.5 rounded">
                      Alerta
                    </span>
                  ) : (
                    <span className="shrink-0 font-mono-num text-[10px] text-[#8B7CA5]">
                      {suc.codigo}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Cashier Actions (Strictly for Cajera role) */}
        {currentUser.rol === 'cajera' && (
          <div className="pt-2 border-t border-[#F1ECF9]">
            <p className="px-2.5 pb-2 text-[11px] font-medium text-[#8B7CA5]">
              Opciones rápidas de caja
            </p>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  onQuickAction('llamada');
                  onCloseMobile();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-[#FAF7FE] hover:bg-[#F3ECFC] text-[#5B21B6] border border-[#EAE3F5] transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-[#DB2777]" />
                Registrar llamada
              </button>
              <button
                type="button"
                onClick={() => {
                  onQuickAction('evidencia');
                  onCloseMobile();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-[#FAF7FE] hover:bg-[#F3ECFC] text-[#5B21B6] border border-[#EAE3F5] transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-[#DB2777]" />
                Subir evidencia diaria
              </button>
              <button
                type="button"
                onClick={() => {
                  onQuickAction('gasto');
                  onCloseMobile();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-[#FAF7FE] hover:bg-[#F3ECFC] text-[#5B21B6] border border-[#EAE3F5] transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-[#DB2777]" />
                Registrar gasto o refrendo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Supabase Connection Footer (Creador & Supervisor) */}
      {currentUser.rol === 'creador' && (
        <div className="p-3.5 border-t border-[#F1ECF9]">
          <button
            type="button"
            onClick={onOpenSupabaseModal}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#FAF7FE] hover:bg-[#F3ECFC] border border-[#EAE3F5] transition-colors text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Database
                className={`h-4 w-4 shrink-0 ${
                  supabaseConnected ? 'text-[#15803D]' : 'text-[#7C3AED]'
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#1F172B] truncate">
                  {supabaseConnected ? 'Supabase Conectado' : 'Conexión Supabase'}
                </p>
                <p className="text-[11px] text-[#7A6B93] truncate">
                  {supabaseConnected
                    ? 'Sincronización activa'
                    : 'Configurar SQL'}
                </p>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#1F172B]/30 backdrop-blur-[2px]"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
