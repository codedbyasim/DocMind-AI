import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe,
  Database,
  Layers,
  HeartPulse,
  RefreshCw,
  Play,
  ChevronRight,
  Sparkles,
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Overview</h1>
          <p className="text-sm text-slate-500 mt-1 font-normal">
            Real-time status of documentation scrapers, vector storage, and self-healing.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-semibold transition-all shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* System Health */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">System Health</span>
            <StatusBadge status={health?.status || 'Unknown'} size="sm" />
          </div>
          <div className="text-xl font-bold text-slate-900 mb-1.5">
            {health?.status === 'HEALTHY' ? 'Operating Normally' : health?.status || 'Checking...'}
          </div>
          <p className="text-xs text-slate-500 line-clamp-1 font-normal">
            Target: <span className="font-mono text-slate-700 font-medium">{health?.target_docs_url || 'https://docs.litellm.ai'}</span>
          </p>
        </div>

        {/* Knowledge Base */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Indexed Knowledge</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-2xl font-extrabold text-slate-900">{health?.total_indexed_pages || 0}</span>
            <span className="text-xs text-slate-500 font-medium">pages</span>
            <span className="text-slate-300">/</span>
            <span className="text-xl font-bold text-blue-600">{health?.total_indexed_chunks || 0}</span>
            <span className="text-xs text-slate-500 font-medium">chunks</span>
          </div>
          <p className="text-xs text-slate-500">
            Vector Store: <span className="font-mono font-medium text-slate-700 capitalize">{health?.vector_db_provider || 'ChromaDB'}</span>
          </p>
        </div>

        {/* Scraper Collector */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bright Data Scraper</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="text-sm font-mono font-semibold text-slate-800 mb-1.5 truncate">
            {health?.active_collector_id || 'Not configured'}
          </div>
          <p className="text-xs text-slate-500">
            LLM Provider: <span className="text-slate-700 font-mono font-medium capitalize">{health?.llm_provider || 'OpenAI'}</span>
          </p>
        </div>
      </div>

      {/* Quick Action Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md shadow-blue-500/10">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Quick Maintenance Actions</h2>
          <p className="text-xs text-blue-100 mt-1 font-normal">
            Trigger vector re-indexing or simulate documentation site changes to test self-healing.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleQuickReindex}
            disabled={actionLoading}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all flex items-center gap-2 border border-white/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Index</span>
          </button>
          <Link
            to="/admin/scraper"
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-blue-700 text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Scraper</span>
          </Link>
        </div>
      </div>

      {/* Two Column Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Scrapes */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              <span>Recent Scrape Runs</span>
            </h2>
            <Link to="/admin/logs" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 font-semibold">
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {runs.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No scrape runs recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {runs.map((r, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono text-slate-900 font-semibold">{r.run_id}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {new Date(r.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900">{r.page_count} pages</div>
                    <div className="text-[11px] text-emerald-600 font-semibold capitalize">{r.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Self-Healing Events */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-600" />
              <span>Self-Healing History</span>
            </h2>
            <Link to="/admin/healing" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 font-semibold">
              <span>Monitor</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {heals.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No repair events recorded. Scrapers are healthy.</p>
          ) : (
            <div className="space-y-2.5">
              {heals.map((h, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-slate-900 font-medium truncate">{h.trigger_reason}</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {new Date(h.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold capitalize ${
                      h.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : h.status === 'pending_review'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
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
