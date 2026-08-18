import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  Globe,
  Shield,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  FileCode,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminLogsPage() {
  const { getAuthHeaders, checkAuthResponse } = useAuth();
  const [runs, setRuns] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('runs'); // 'runs' | 'audit'
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const [runsRes, auditRes] = await Promise.all([
        fetch('/api/admin/runs?limit=30', { headers: getAuthHeaders() }),
        fetch('/api/admin/audit-logs?limit=30', { headers: getAuthHeaders() }),
      ]);

      if (!checkAuthResponse(runsRes)) return;

      if (runsRes.ok) setRuns(await runsRes.json());
      if (auditRes.ok) setAuditLogs(await auditRes.json());
    } catch (err) {
      console.warn('Logs fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredRuns = runs.filter(
    (r) =>
      r.run_id?.toLowerCase().includes(search.toLowerCase()) ||
      r.status?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAudit = auditLogs.filter(
    (a) =>
      a.action?.toLowerCase().includes(search.toLowerCase()) ||
      a.actor?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Activity & Audit Logs</h1>
          <p className="text-xs text-slate-400 mt-1">
            Historical records of scraper execution, vector updates, and administrative actions.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-medium transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('runs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'runs'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Scrape Runs ({runs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'audit'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Security Audit Trail ({auditLogs.length})</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter logs..."
            className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 outline-none w-full sm:w-56"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl bg-slate-900/50 border border-slate-800/80 p-5">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Loading log history...</span>
          </div>
        ) : activeTab === 'runs' ? (
          /* Scrape Runs Table */
          filteredRuns.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">No scrape runs matching filter.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800/80">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-medium">
                    <th className="py-3 px-4">Run ID</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Collector ID</th>
                    <th className="py-3 px-4">Page Count</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRuns.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-200">{r.run_id}</td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(r.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">{r.collector_id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-200">{r.page_count} pages</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                            r.status === 'success' || r.status === 'healthy'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{r.status}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Audit Logs Table */
          filteredAudit.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">No audit events matching filter.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800/80">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-medium">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredAudit.map((a, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {new Date(a.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-200">{a.actor}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-cyan-400">{a.action}</td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px] truncate max-w-[280px]">
                        {a.details ? JSON.stringify(a.details) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
