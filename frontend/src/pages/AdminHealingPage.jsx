import React, { useState, useEffect } from 'react';
import {
  HeartPulse,
  Wrench,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  Check,
  X,
  Sparkles,
  Zap,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import NoticeBanner from '../components/NoticeBanner';
import { useAuth } from '../context/AuthContext';

export default function AdminHealingPage() {
  const { getAuthHeaders, checkAuthResponse } = useAuth();
  const [health, setHealth] = useState(null);
  const [healEvents, setHealEvents] = useState([]);
  const [manualDescription, setManualDescription] = useState('');

  const [loading, setLoading] = useState(true);
  const [triggeringHeal, setTriggeringHeal] = useState(false);
  const [approvingHeal, setApprovingHeal] = useState(false);
  const [rejectingHeal, setRejectingHeal] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [notice, setNotice] = useState(null);

  const fetchHealingData = async () => {
    setLoading(true);
    try {
      const [healthRes, healsRes] = await Promise.all([
        fetch('/api/admin/health', { headers: getAuthHeaders() }),
        fetch('/api/admin/heal/history?limit=20', { headers: getAuthHeaders() }),
      ]);

      if (!checkAuthResponse(healthRes)) return;

      if (healthRes.ok) setHealth(await healthRes.json());
      if (healsRes.ok) setHealEvents(await healsRes.json());
    } catch (err) {
      console.warn('Healing data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealingData();
  }, []);

  const latestPendingHeal = healEvents.find((h) => h.status === 'pending_review');

  const handleApproveHeal = async (healId) => {
    setApprovingHeal(true);
    setNotice({ type: 'info', message: 'Applying AI repair fix to scraper and starting re-indexing...' });

    try {
      const res = await fetch(`/api/admin/heal/${healId}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to approve fix');

      setNotice({
        type: 'success',
        message: 'AI repair approved and applied! Scraper was re-run and vector knowledge base updated.',
      });
      fetchHealingData();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setApprovingHeal(false);
    }
  };

  const handleRejectHeal = async (healId) => {
    setRejectingHeal(true);
    try {
      const res = await fetch(`/api/admin/heal/${healId}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to reject fix');

      setNotice({ type: 'info', message: 'Proposed fix rejected. You can trigger a new repair with adjusted notes.' });
      fetchHealingData();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setRejectingHeal(false);
    }
  };

  const handleTriggerManualHeal = async (e) => {
    e.preventDefault();
    if (!manualDescription.trim() || triggeringHeal) return;
    setTriggeringHeal(true);
    setNotice({ type: 'info', message: 'Requesting AI scraper repair from Bright Data...' });

    try {
      const res = await fetch('/api/admin/heal/trigger', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ description: manualDescription.trim() }),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to request repair');

      setNotice({
        type: 'success',
        message: `Repair fix proposed: "${data.proposed_fix_summary || 'Fix ready for review'}". Review below.`,
      });
      setManualDescription('');
      fetchHealingData();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setTriggeringHeal(false);
    }
  };

  const handleSimulateDegraded = async () => {
    setSimulating(true);
    setNotice({ type: 'warning', message: 'Simulating documentation site breakage...' });

    try {
      const res = await fetch('/api/admin/heal/simulate-degraded', {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Simulation failed');

      setNotice({
        type: 'warning',
        message: `Breakage simulated! Health dropped to DEGRADED and automated repair was triggered (Heal ID: ${data.heal_event_id}).`,
      });
      fetchHealingData();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Self-Healing Monitor</h1>
          <p className="text-xs text-slate-400 mt-1">
            Automatic detection of broken scrapers, AI-assisted selector repairs, and zero-downtime re-indexing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchHealingData}
            disabled={loading}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-medium transition-all flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleSimulateDegraded}
            disabled={simulating}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-all flex items-center gap-2 shadow-sm shadow-amber-600/20"
          >
            <Zap className={`w-3.5 h-3.5 ${simulating ? 'animate-spin' : ''}`} />
            <span>{simulating ? 'Simulating...' : 'Simulate Website Breakage'}</span>
          </button>
        </div>
      </div>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* System Health Banner */}
      <div
        className={`rounded-xl border p-5 backdrop-blur-sm ${
          health?.status === 'DEGRADED'
            ? 'bg-amber-950/30 border-amber-800/80'
            : health?.status === 'HEALING'
            ? 'bg-cyan-950/30 border-cyan-800/80'
            : health?.status === 'ERROR'
            ? 'bg-rose-950/30 border-rose-800/80'
            : 'bg-slate-900/60 border-slate-800/80'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-cyan-400">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-white">Current Scraper Health:</span>
                <StatusBadge status={health?.status || 'HEALTHY'} />
              </div>
              <p className="text-xs text-slate-400">
                {health?.status === 'DEGRADED'
                  ? 'Scraper returned fewer pages than expected. An automatic AI repair is ready for review.'
                  : health?.status === 'HEALING'
                  ? 'A repair is currently being generated and verified on Bright Data cloud.'
                  : 'Scraper output is healthy and verified against expected document structure.'}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0 text-xs">
            <div className="text-slate-400">Indexed Documentation:</div>
            <div className="font-semibold text-white font-mono mt-0.5">
              {health?.total_indexed_pages || 0} pages ({health?.total_indexed_chunks || 0} chunks)
            </div>
          </div>
        </div>
      </div>

      {/* Pending Fix Approval Alert (Human-in-the-Loop Gate) */}
      {latestPendingHeal && (
        <div className="rounded-xl bg-amber-950/40 border border-amber-700/80 p-5 shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-sm mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>AI Repair Ready for Review</span>
          </div>

          <p className="text-xs text-amber-200/90 mb-4 leading-relaxed">
            Bright Data AI analyzed the documentation changes and generated an updated scraper script.
          </p>

          <div className="p-3.5 rounded-lg bg-slate-950/80 border border-amber-800/60 text-xs font-mono text-slate-200 mb-4 space-y-1">
            <div className="text-slate-400 text-[11px]">Breakage Detected:</div>
            <div className="text-amber-300">{latestPendingHeal.trigger_reason}</div>
            <div className="text-slate-400 text-[11px] pt-1">Proposed Fix:</div>
            <div className="text-emerald-300">{latestPendingHeal.proposed_fix_summary || 'Selector adjustments applied'}</div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleApproveHeal(latestPendingHeal.heal_id)}
              disabled={approvingHeal || rejectingHeal}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{approvingHeal ? 'Applying Fix...' : 'Approve Fix & Re-Index'}</span>
            </button>
            <button
              onClick={() => handleRejectHeal(latestPendingHeal.heal_id)}
              disabled={approvingHeal || rejectingHeal}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-800 hover:border-rose-800 text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject Fix</span>
            </button>
          </div>
        </div>
      )}

      {/* Manual Repair Trigger Card */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-5 backdrop-blur-sm">
        <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-cyan-400" />
          <span>Request Custom AI Repair</span>
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Describe any specific issues (e.g. "Navigation structure changed" or "Missing API parameter tables") to prompt Bright Data AI to adapt the scraper.
        </p>

        <form onSubmit={handleTriggerManualHeal} className="space-y-3">
          <input
            type="text"
            value={manualDescription}
            onChange={(e) => setManualDescription(e.target.value)}
            placeholder="e.g., Target website updated sidebar layout and article headings"
            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 outline-none"
            required
          />
          <button
            type="submit"
            disabled={triggeringHeal || !manualDescription.trim()}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>{triggeringHeal ? 'Requesting AI Fix...' : 'Request AI Repair'}</span>
          </button>
        </form>
      </div>

      {/* Repair History Table */}
      <div className="rounded-xl bg-slate-900/50 border border-slate-800/80 p-5">
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-rose-400" />
          <span>Repair Events History</span>
        </h2>

        {healEvents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            No self-healing events on record. All scrapers have run without degradation.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-medium">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Trigger Reason</th>
                  <th className="py-3 px-4">Proposed Fix</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {healEvents.map((h, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {new Date(h.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-200 max-w-[240px]">
                      {h.trigger_reason}
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-[260px] truncate">
                      {h.proposed_fix_summary || 'Automatic selector update'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                          h.status === 'completed'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : h.status === 'pending_review'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {h.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
