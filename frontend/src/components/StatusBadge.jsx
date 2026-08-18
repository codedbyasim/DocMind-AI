import React from 'react';
import { CheckCircle2, AlertTriangle, RefreshCw, XCircle, HelpCircle } from 'lucide-react';

export default function StatusBadge({ status, size = 'md' }) {
  const normalized = (status || '').toLowerCase();

  const configs = {
    healthy: {
      label: 'Healthy',
      bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
      dot: 'bg-emerald-400',
      icon: CheckCircle2,
    },
    degraded: {
      label: 'Degraded',
      bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      dot: 'bg-amber-400 animate-pulse',
      icon: AlertTriangle,
    },
    healing: {
      label: 'Healing',
      bg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
      dot: 'bg-cyan-400 animate-pulse',
      icon: RefreshCw,
      animate: true,
    },
    error: {
      label: 'Error',
      bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      dot: 'bg-rose-400',
      icon: XCircle,
    },
  };

  const current = configs[normalized] || {
    label: status || 'Unknown',
    bg: 'bg-slate-800 border-slate-700 text-slate-400',
    dot: 'bg-slate-400',
    icon: HelpCircle,
  };

  const Icon = current.icon;
  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-medium transition-all ${current.bg} ${
        isSmall ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${current.animate ? 'animate-spin' : ''}`} />
      <span>{current.label}</span>
    </span>
  );
}
