import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe,
  Database,
  Layers,
  HeartPulse,
  ArrowUpRight,
  RefreshCw,
  Play,
  Clock,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import NoticeBanner from '../components/NoticeBanner';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboardPage() {
  const { getAuthHeaders, checkAuthResponse } = useAuth();
  const [health, setHealth] = useState(null);
  const [runs, setRuns] = useState([]);
  const [heals, setHeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [healthRes, runsRes, healsRes] = await Promise.all([
        fetch('/api/admin/health', { headers: getAuthHeaders() }),
        fetch('/api/admin/runs?limit=5', { headers: getAuthHeaders() }),
        fetch('/api/admin/heal/history?limit=5', { headers: getAuthHeaders() }),
      ]);

      if (!checkAuthResponse(healthRes)) return;

      if (healthRes.ok) setHealth(await healthRes.json());
      if (runsRes.ok) setRuns(await runsRes.json());
      if (healsRes.ok) setHeals(await healsRes.json());
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleQuickReindex = async () => {
    setActionLoading(true);
    setNotice({ type: 'info', message: 'Refreshing vector embeddings for indexed documentation...' });

    try {
      const res = await fetch('/api/admin/indexing/reindex', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      setNotice({
        type: 'success',
        message: `Index refreshed successfully: ${data.indexed_chunks_count} chunks indexed across ${data.reindexed_pages_count} pages in ${data.duration_seconds.toFixed(2)}s.`,
      });
      fetchDashboardData();
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to refresh index' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Overview</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time status of documentation scrapers, vector storage, and self-healing.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* System Health */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">System Health</span>
            <StatusBadge status={health?.status || 'Unknown'} size="sm" />
          </div>
          <div className="text-xl font-bold text-white mb-1">
            {health?.status === 'HEALTHY' ? 'Operating Normally' : health?.status || 'Checking...'}
          </div>
          <p className="text-[11px] text-slate-400 line-clamp-1">
            Target: <span className="font-mono text-slate-300">{health?.target_docs_url || 'https://docs.litellm.ai'}</span>
          </p>
        </div>

        {/* Knowledge Base */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Indexed Knowledge</span>
            <Database className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold text-white">{health?.total_indexed_pages || 0}</span>
            <span className="text-xs text-slate-400">pages</span>
            <span className="text-slate-600">/</span>
            <span className="text-lg font-semibold text-cyan-400">{health?.total_indexed_chunks || 0}</span>
            <span className="text-xs text-slate-400">chunks</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Vector store: <span className="font-mono text-slate-300 capitalize">{health?.vector_db_provider || 'ChromaDB'}</span>
          </p>
        </div>

        {/* Scraper Collector */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Bright Data Scraper</span>
            <Globe className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-sm font-mono text-slate-200 mb-1 truncate">
            {health?.active_collector_id || 'Not configured'}
          </div>
          <p className="text-[11px] text-slate-400">
            LLM: <span className="text-slate-300 font-mono capitalize">{health?.llm_provider || 'OpenAI'}</span>
          </p>
        </div>
      </div>

      {/* Quick Action Banner */}
      <div className="rounded-xl bg-gradient-to-r from-slate-900 to-slate-900/80 border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-white">Quick Maintenance Actions</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Trigger vector re-indexing or simulate site changes to test self-healing.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleQuickReindex}
            disabled={actionLoading}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all flex items-center gap-1.5 border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Index</span>
          </button>
          <Link
            to="/admin/scraper"
            className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm shadow-cyan-600/20"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Run Scraper</span>
          </Link>
        </div>
      </div>

      {/* Two Column Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Scrapes */}
        <div className="rounded-xl bg-slate-900/50 border border-slate-800/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>Recent Scrape Runs</span>
            </h2>
            <Link to="/admin/logs" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 font-medium">
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {runs.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No scrape runs recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {runs.map((r, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/70 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono text-slate-200 font-medium">{r.run_id}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {new Date(r.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-slate-200">{r.page_count} pages</div>
                    <div className="text-[10px] text-emerald-400 capitalize">{r.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Self-Healing Events */}
        <div className="rounded-xl bg-slate-900/50 border border-slate-800/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-400" />
              <span>Self-Healing History</span>
            </h2>
            <Link to="/admin/healing" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 font-medium">
              <span>Monitor</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {heals.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No repair events recorded. Scrapers are healthy.</p>
          ) : (
            <div className="space-y-2.5">
              {heals.map((h, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/70 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-slate-200 font-medium truncate">{h.trigger_reason}</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {new Date(h.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                      h.status === 'completed'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : h.status === 'pending_review'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {h.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
