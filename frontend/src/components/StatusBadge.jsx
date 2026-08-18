import React from 'react';
import { CheckCircle2, AlertTriangle, RefreshCw, XCircle, HelpCircle } from 'lucide-react';

export default function StatusBadge({ status, size = 'md' }) {
  const normalized = (status || '').toLowerCase();

  const configs = {
    healthy: {
      label: 'Healthy',
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      icon: CheckCircle2,
    },
    degraded: {
      label: 'Degraded',
      bg: 'bg-amber-50 border-amber-200 text-amber-700',
      icon: AlertTriangle,
    },
    healing: {
      label: 'Healing',
      bg: 'bg-blue-50 border-blue-200 text-blue-700',
      icon: RefreshCw,
      animate: true,
    },
    error: {
      label: 'Error',
      bg: 'bg-rose-50 border-rose-200 text-rose-700',
      icon: XCircle,
    },
  };

  const current = configs[normalized] || {
    label: status || 'Unknown',
    bg: 'bg-slate-100 border-slate-200 text-slate-600',
    icon: HelpCircle,
  };

  const Icon = current.icon;
  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide ${current.bg} ${
        isSmall ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${current.animate ? 'animate-spin' : ''}`} />
      <span>{current.label}</span>
    </span>
  );
}
