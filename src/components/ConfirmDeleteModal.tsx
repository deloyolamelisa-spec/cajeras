import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  open: boolean;
  title?: string;
  detail?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  open,
  title = '¿Seguro que deseas eliminar este registro?',
  detail,
  loading = false,
  onCancel,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/45 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#FECDD3] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#FFF1F2] bg-[#FFF1F2]/60">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-[#BE123C]" />
            <h3 className="font-display text-sm font-bold text-[#881337]">
              Confirmar eliminación
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-[#9F1239] hover:bg-white"
            aria-label="Cancelar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-2">
          <p className="text-sm font-semibold text-[#1F172B]">{title}</p>
          {detail && <p className="text-xs text-[#6E5F87]">{detail}</p>}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-[#F1ECF9] bg-[#FAF8FC]">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-[#55476E] hover:bg-white border border-[#E6DDF5]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#E11D48] hover:bg-[#BE123C] text-white disabled:opacity-50"
          >
            {loading ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
};
