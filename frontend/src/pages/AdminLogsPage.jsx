import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  Globe,
  Shield,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminLogsPage() {
  const { getAuthHeaders, checkAuthResponse } = useAuth();
  const [runs, setRuns] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('runs');
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
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Activity & Audit Logs</h1>
          <p className="text-sm text-slate-500 mt-1 font-normal">
            Historical records of scraper execution, vector updates, and administrative actions.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('runs')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'runs'
                ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Scrape Runs ({runs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'audit'
                ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Security Audit Trail ({auditLogs.length})</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter logs..."
            className="pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 outline-none w-full sm:w-60 font-medium transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2 font-medium">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>Loading log history...</span>
          </div>
        ) : activeTab === 'runs' ? (
          /* Scrape Runs */
          filteredRuns.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No scrape runs matching filter.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-bold">
                    <th className="py-3.5 px-4">Run ID</th>
                    <th className="py-3.5 px-4">Timestamp</th>
                    <th className="py-3.5 px-4">Collector ID</th>
                    <th className="py-3.5 px-4">Page Count</th>
                    <th className="py-3.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRuns.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{r.run_id}</td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(r.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 font-medium">{r.collector_id}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{r.page_count} pages</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold capitalize ${
                            r.status === 'success' || r.status === 'healthy'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
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
          /* Audit Logs */
          filteredAudit.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No audit events matching filter.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-bold">
                    <th className="py-3.5 px-4">Timestamp</th>
                    <th className="py-3.5 px-4">Actor</th>
                    <th className="py-3.5 px-4">Action</th>
                    <th className="py-3.5 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAudit.map((a, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                        {new Date(a.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{a.actor}</td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-blue-700 font-semibold">{a.action}</td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px] truncate max-w-[280px]">
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
