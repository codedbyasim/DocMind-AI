import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function NoticeBanner({ notice, onDismiss }) {
  if (!notice || !notice.message) return null;

  const types = {
    success: {
      bg: 'bg-emerald-950/50 border-emerald-800/80 text-emerald-200',
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
    },
    error: {
      bg: 'bg-rose-950/50 border-rose-800/80 text-rose-200',
      icon: AlertCircle,
      iconColor: 'text-rose-400',
    },
    warning: {
      bg: 'bg-amber-950/50 border-amber-800/80 text-amber-200',
      icon: AlertCircle,
      iconColor: 'text-amber-400',
    },
    info: {
      bg: 'bg-sky-950/50 border-sky-800/80 text-sky-200',
      icon: Info,
      iconColor: 'text-sky-400',
    },
  };

  const current = types[notice.type] || types.info;
  const Icon = current.icon;

  return (
    <div
      className={`rounded-xl border p-3.5 mb-6 text-xs flex items-center justify-between shadow-sm animate-fadeIn ${current.bg}`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={`w-4 h-4 shrink-0 ${current.iconColor}`} />
        <span className="font-medium">{notice.message}</span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
          title="Dismiss notice"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
