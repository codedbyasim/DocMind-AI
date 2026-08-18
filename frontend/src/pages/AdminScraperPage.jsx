import React, { useState, useEffect } from 'react';
import {
  Globe,
  Play,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import NoticeBanner from '../components/NoticeBanner';
import { useAuth } from '../context/AuthContext';

export default function AdminScraperPage() {
  const { getAuthHeaders, checkAuthResponse } = useAuth();
  const [targetUrl, setTargetUrl] = useState('https://docs.litellm.ai');
  const [description, setDescription] = useState('Sitemap scraper for documentation pages');
  const [collectorId, setCollectorId] = useState('');
  const [pages, setPages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const fetchStateAndPages = async () => {
    setPagesLoading(true);
    try {
      const [stateRes, pagesRes] = await Promise.all([
        fetch('/api/admin/state', { headers: getAuthHeaders() }),
        fetch('/api/admin/pages/latest', { headers: getAuthHeaders() }),
      ]);

      if (!checkAuthResponse(stateRes)) return;

      if (stateRes.ok) {
        const stateData = await stateRes.json();
        if (stateData.target_docs_url) setTargetUrl(stateData.target_docs_url);
        if (stateData.active_collector_id) setCollectorId(stateData.active_collector_id);
      }

      if (pagesRes.ok) {
        setPages(await pagesRes.json());
      }
    } catch (err) {
      console.warn('Scraper data fetch error:', err);
    } finally {
      setPagesLoading(false);
    }
  };

  useEffect(() => {
    fetchStateAndPages();
  }, []);

  const handleCreateScraper = async (e) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setNotice({ type: 'info', message: 'Creating new Bright Data scraper collector on the cloud...' });

    try {
      const res = await fetch('/api/admin/scraper/create', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          target_url: targetUrl.trim(),
          description: description.trim(),
        }),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create scraper');

      setCollectorId(data.collector_id);
      setNotice({
        type: 'success',
        message: `Scraper created successfully! Collector ID: ${data.collector_id}`,
      });
      fetchStateAndPages();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setCreating(false);
    }
  };

  const handleRunScraper = async () => {
    if (running) return;
    setRunning(true);
    setNotice({ type: 'info', message: 'Running scraper on Bright Data cloud and updating vector index...' });

    try {
      const res = await fetch('/api/admin/scraper/run', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          collector_id: collectorId.trim() || undefined,
        }),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to execute scraper run');

      setNotice({
        type: 'success',
        message: `Scrape finished: ${data.valid_pages_count} pages scraped, ${data.indexed_chunks_count} chunks indexed in ${data.duration_seconds.toFixed(1)}s.`,
      });
      fetchStateAndPages();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setRunning(false);
    }
  };

  const handleReindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    setNotice({ type: 'info', message: 'Re-indexing chunks and updating vector embeddings...' });

    try {
      const res = await fetch('/api/admin/indexing/reindex', {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Re-indexing failed');

      setNotice({
        type: 'success',
        message: `Re-indexing complete: ${data.indexed_chunks_count} chunks updated across ${data.reindexed_pages_count} pages.`,
      });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setReindexing(false);
    }
  };

  const filteredPages = pages.filter((p) => {
    const matchesSearch =
      (p.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.url || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      statusFilter === 'all'
        ? true
        : statusFilter === 'valid'
        ? p.is_valid
        : !p.is_valid;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Scraper Studio</h1>
          <p className="text-sm text-slate-500 mt-1 font-normal">
            Configure target documentation URLs, run Bright Data scrapers, and manage ingested pages.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all shadow-2xs flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reindexing ? 'animate-spin' : ''}`} />
            <span>Refresh Index</span>
          </button>
          <button
            onClick={handleRunScraper}
            disabled={running}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm shadow-blue-500/20"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${running ? 'animate-spin' : ''}`} />
            <span>{running ? 'Scraping...' : 'Run Scraper Now'}</span>
          </button>
        </div>
      </div>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* Scraper Configuration Card */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-600" />
          <span>Documentation Source & Collector</span>
        </h2>

        <form onSubmit={handleCreateScraper} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Target Documentation URL
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://docs.example.com"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Active Collector ID
              </label>
              <input
                type="text"
                value={collectorId}
                onChange={(e) => setCollectorId(e.target.value)}
                placeholder="c_..."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Scraper Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description of documentation structure"
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all font-medium"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400 font-medium">
              Creates an AI-powered documentation scraper on Bright Data Cloud.
            </span>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all flex items-center gap-2 border border-slate-200 shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Creating...' : 'Create New Collector'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Ingested Pages Section */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Ingested Documentation Pages ({pages.length})</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pages scraped from target documentation and indexed in vector storage.
            </p>
          </div>

          {/* Search & Status Filter */}
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pages..."
                className="pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500 outline-none w-48 sm:w-60 font-medium transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 transition-all"
            >
              <option value="all">All Pages</option>
              <option value="valid">Valid Only</option>
              <option value="rejected">Rejected Only</option>
            </select>
          </div>
        </div>

        {/* Pages Table */}
        {pagesLoading ? (
          <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>Loading scraped pages...</span>
          </div>
        ) : filteredPages.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No documentation pages found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-bold">
                  <th className="py-3.5 px-4">Title & Section</th>
                  <th className="py-3.5 px-4">Source URL</th>
                  <th className="py-3.5 px-4">Content Size</th>
                  <th className="py-3.5 px-4">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPages.map((page, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      <div className="truncate max-w-[280px]">{page.title || 'Untitled'}</div>
                      {page.section_headings && page.section_headings.length > 0 && (
                        <div className="text-[11px] text-slate-400 font-normal truncate max-w-[280px]">
                          {page.section_headings.join(' › ')}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 max-w-[240px] truncate font-medium"
                      >
                        <span className="truncate">{page.url}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                      </a>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono">
                      {page.content_length ? `${page.content_length} chars` : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      {page.is_valid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Valid</span>
                        </span>
                      ) : (
                        <span
                          title={page.validation_errors?.join(', ') || 'Validation error'}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-semibold border border-rose-200"
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Rejected</span>
                        </span>
                      )}
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
