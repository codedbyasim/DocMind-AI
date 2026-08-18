import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function NoticeBanner({ notice, onDismiss }) {
  if (!notice || !notice.message) return null;

  const types = {
    success: {
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
    },
    error: {
      bg: 'bg-rose-50 border-rose-200 text-rose-900',
      icon: AlertCircle,
      iconColor: 'text-rose-600',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200 text-amber-900',
      icon: AlertCircle,
      iconColor: 'text-amber-600',
    },
    info: {
      bg: 'bg-blue-50 border-blue-200 text-blue-900',
      icon: Info,
      iconColor: 'text-blue-600',
    },
  };

  const current = types[notice.type] || types.info;
  const Icon = current.icon;

  return (
    <div
      className={`rounded-xl border p-4 mb-6 text-xs flex items-center justify-between shadow-sm animate-fadeIn ${current.bg}`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 shrink-0 ${current.iconColor}`} />
        <span className="font-medium leading-relaxed">{notice.message}</span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 hover:bg-black/5 rounded-lg transition-colors text-slate-500 hover:text-slate-900"
          title="Dismiss notice"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
