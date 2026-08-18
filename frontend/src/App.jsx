import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  ExternalLink,
  Terminal,
  Play,
  PlusCircle,
  Database,
  Layers,
  Cpu,
  Search,
  Check,
  X,
  AlertTriangle,
  History,
  Globe,
  Sliders,
  ChevronRight,
  Info
} from 'lucide-react';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'admin'

  // Chat State
  const [sessionId, setSessionId] = useState(() => 'sess_' + Math.random().toString(36).substring(2, 9));
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  // System & Health State

  const [health, setHealth] = useState(null);
  const [adminState, setAdminState] = useState({
    target_docs_url: 'https://docs.litellm.ai',
    active_collector_id: '',
  });

  // Admin Form State
  const [targetUrl, setTargetUrl] = useState('https://docs.litellm.ai');
  const [description, setDescription] = useState('Sitemap scraper for documentation pages');
  const [collectorId, setCollectorId] = useState('');
  // Phase 6: Admin Authentication & Token State (SRS §5.1, §2.2)
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('docmind_admin_token') || '');
  const [authUsername, setAuthUsername] = useState(() => localStorage.getItem('docmind_admin_user') || 'admin');
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('docmind_admin_token')));
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);



  // Scraper Actions & Results
  const [creatingScraper, setCreatingScraper] = useState(false);
  const [runningScraper, setRunningScraper] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [actionNotice, setActionNotice] = useState(null); // { type: 'success' | 'error' | 'info', message: string }
  const [scrapedPages, setScrapedPages] = useState([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pageFilter, setPageFilter] = useState('all'); // 'all' | 'valid' | 'invalid'
  const [pageSearch, setPageSearch] = useState('');
  const [scrapeRuns, setScrapeRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // Phase 2: Indexing Progress State (SRS §3.2)
  const [indexingProgress, setIndexingProgress] = useState({
    status: 'idle',
    processed_pages: 0,
    total_pages: 0,
    processed_chunks: 0,
    total_chunks: 0,
    current_page_title: null,
    last_indexed_at: null,
  });

  // Phase 5: Self-Healing Monitor & Recovery State (FR-501 to FR-505 & SRS §3.5)
  const [healEvents, setHealEvents] = useState([]);
  const [healsLoading, setHealsLoading] = useState(false);
  const [manualHealDesc, setManualHealDesc] = useState('');
  const [triggeringHeal, setTriggeringHeal] = useState(false);
  const [simulatingDegraded, setSimulatingDegraded] = useState(false);
  const [healingActionId, setHealingActionId] = useState(null);

  // Load initial data
  useEffect(() => {
    fetchHealth();
    if (isAuthenticated) {
      fetchAdminState();
      fetchScrapeRuns();
      fetchLatestPages();
      fetchIndexingProgress();
      fetchHealEvents();
    }
  }, [isAuthenticated]);

  // Poll indexing progress when active
  useEffect(() => {
    if (indexingProgress.status === 'indexing' && isAuthenticated) {
      const timer = setInterval(() => {
        fetchIndexingProgress();
        fetchHealth();
      }, 1500);
      return () => clearInterval(timer);
    }
  }, [indexingProgress.status, isAuthenticated]);

  const getAuthHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken.trim()}`;
    }
    return headers;
  };

  const checkAuthResponse = (res) => {
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('docmind_admin_token');
      localStorage.removeItem('docmind_admin_user');
      setAuthToken('');
      setAuthUsername('');
      setIsAuthenticated(false);
      return false;
    }
    return true;
  };


  const handleAdminLogin = async (e) => {
    e?.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim() || loginLoading) return;
    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `Login failed (HTTP ${res.status})`);
      }

      localStorage.setItem('docmind_admin_token', data.access_token);
      localStorage.setItem('docmind_admin_user', data.username);
      setAuthToken(data.access_token);
      setAuthUsername(data.username);
      setIsAuthenticated(true);
      setActionNotice({ type: 'success', message: `Welcome back, ${data.username}! Admin session active.` });
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch (err) {
      console.warn('Logout notification error:', err);
    } finally {
      localStorage.removeItem('docmind_admin_token');
      localStorage.removeItem('docmind_admin_user');
      setAuthToken('');
      setAuthUsername('');
      setIsAuthenticated(false);
      setActionNotice({ type: 'info', message: 'Admin signed out successfully.' });
    }
  };


  const fetchHealth = async () => {
    try {
      const endpoint = (isAuthenticated && authToken) ? '/api/admin/health' : '/api/health';
      const headers = (isAuthenticated && authToken) ? getAuthHeaders() : { 'Content-Type': 'application/json' };
      const res = await fetch(endpoint, { headers });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else if (endpoint === '/api/admin/health') {
        checkAuthResponse(res);
        const fallbackRes = await fetch('/api/health');
        if (fallbackRes.ok) {
          setHealth(await fallbackRes.json());
        }
      }
    } catch (err) {
      console.warn('Backend API currently offline:', err);
    }
  };


  const fetchHealEvents = async () => {
    setHealsLoading(true);
    try {
      const res = await fetch('/api/admin/heal/history?limit=15', { headers: getAuthHeaders() });
      if (!checkAuthResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setHealEvents(data);
      }
    } catch (err) {
      console.warn('Failed to fetch heal events:', err);
    } finally {
      setHealsLoading(false);
    }
  };


  const handleTriggerManualHeal = async (e) => {
    e?.preventDefault();
    if (!manualHealDesc.trim() || triggeringHeal) return;
    setTriggeringHeal(true);
    setActionNotice({ type: 'info', message: 'Invoking bdata scraper heal with Bright Data AI...' });

    try {
      const res = await fetch('/api/admin/heal/trigger', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          collector_id: collectorId.trim() || undefined,
          description: manualHealDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

      setActionNotice({
        type: 'success',
        message: data.message || `Heal event triggered successfully. Fix proposed: ${data.heal_event?.fix_summary}`,
      });
      setManualHealDesc('');
      fetchHealEvents();
      fetchHealth();
    } catch (err) {
      setActionNotice({ type: 'error', message: `Heal invocation failed: ${err.message}` });
    } finally {
      setTriggeringHeal(false);
    }
  };

  const handleApproveHeal = async (healId) => {
    setHealingActionId(healId);
    setActionNotice({ type: 'info', message: 'Approving heal fix and re-running scraper + re-indexing (FR-504)...' });

    try {
      const res = await fetch(`/api/admin/heal/${healId}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

      setActionNotice({
        type: 'success',
        message: data.message || 'Heal approved and knowledge base successfully re-indexed!',
      });
      fetchHealEvents();
      fetchScrapeRuns();
      fetchLatestPages();
      fetchHealth();
    } catch (err) {
      setActionNotice({ type: 'error', message: `Heal approval failed: ${err.message}` });
    } finally {
      setHealingActionId(null);
    }
  };

  const handleRejectHeal = async (healId) => {
    setHealingActionId(healId);
    setActionNotice({ type: 'info', message: 'Rejecting proposed fix (FR-505)...' });

    try {
      const res = await fetch(`/api/admin/heal/${healId}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ feedback: 'Admin requested alternative fix' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

      setActionNotice({
        type: 'info',
        message: data.message || 'Heal fix rejected. You can submit an adjusted description.',
      });
      fetchHealEvents();
      fetchHealth();
    } catch (err) {
      setActionNotice({ type: 'error', message: `Heal rejection failed: ${err.message}` });
    } finally {
      setHealingActionId(null);
    }
  };

  const handleSimulateDegraded = async () => {
    if (simulatingDegraded) return;
    setSimulatingDegraded(true);
    setActionNotice({ type: 'info', message: 'Simulating degraded scrape breakage (Demo Mode)...' });

    try {
      const res = await fetch('/api/admin/heal/simulate-degraded', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

      setActionNotice({
        type: 'success',
        message: data.message || 'Degraded run simulated! Health flipped to DEGRADED and heal auto-triggered.',
      });
      fetchHealEvents();
      fetchScrapeRuns();
      fetchHealth();
    } catch (err) {
      setActionNotice({ type: 'error', message: `Simulation failed: ${err.message}` });
    } finally {
      setSimulatingDegraded(false);
    }
  };


  const fetchAdminState = async () => {
    try {
      const res = await fetch('/api/admin/state', { headers: getAuthHeaders() });
      if (!checkAuthResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setAdminState(data);
        if (data.target_docs_url) setTargetUrl(data.target_docs_url);
        if (data.active_collector_id) setCollectorId(data.active_collector_id);
      }
    } catch (err) {
      console.warn('Failed to load admin state:', err);
    }
  };

  const fetchIndexingProgress = async () => {
    try {
      const res = await fetch('/api/admin/indexing/progress', { headers: getAuthHeaders() });
      if (!checkAuthResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setIndexingProgress(data);
      }
    } catch (err) {
      console.warn('Failed to fetch indexing progress:', err);
    }
  };

  const fetchLatestPages = async () => {
    setPagesLoading(true);
    try {
      const res = await fetch('/api/admin/pages/latest', { headers: getAuthHeaders() });
      if (!checkAuthResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setScrapedPages(data);
      }
    } catch (err) {
      console.warn('Failed to fetch latest pages:', err);
    } finally {
      setPagesLoading(false);
    }
  };

  const fetchScrapeRuns = async () => {
    setRunsLoading(true);
    try {
      const res = await fetch('/api/admin/runs?limit=15', { headers: getAuthHeaders() });
      if (!checkAuthResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setScrapeRuns(data);
      }
    } catch (err) {
      console.warn('Failed to fetch scrape runs:', err);
    } finally {
      setRunsLoading(false);
    }
  };


  const handleDeltaReindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    setActionNotice({ type: 'info', message: 'Triggering Delta Re-indexing pipeline (FR-204)...' });

    try {
      const res = await fetch('/api/admin/indexing/reindex', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ force_full: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

      setActionNotice({
        type: 'success',
        message: data.message || `Re-indexed ${data.indexed_pages} pages into ${data.indexed_chunks} chunks.`,
      });
      fetchIndexingProgress();
      fetchHealth();
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Delta re-indexing failed: ${err.message}`,
      });
    } finally {
      setReindexing(false);
    }
  };


  // --- Handlers ---
  const handleCreateScraper = async (e) => {
    e.preventDefault();
    if (!targetUrl.trim() || creatingScraper) return;

    setCreatingScraper(true);
    setActionNotice({ type: 'info', message: 'Creating Sitemap Scraper via Bright Data CLI (bdata scraper create)...' });

    try {
      const res = await fetch('/api/admin/scraper/create', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          url: targetUrl.trim(),
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      setCollectorId(data.collector_id);
      setActionNotice({
        type: 'success',
        message: `Collector created successfully! Collector ID: ${data.collector_id}`,
      });
      fetchAdminState();
      fetchHealth();
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Failed to create scraper: ${err.message}`,
      });
    } finally {
      setCreatingScraper(false);
    }
  };

  const handleRunScraper = async () => {
    if (runningScraper) return;

    setRunningScraper(true);
    setActionNotice({
      type: 'info',
      message: 'Running Bright Data scraper (bdata scraper run) & ingesting documentation...',
    });

    try {
      const res = await fetch('/api/admin/scraper/run', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          url: targetUrl.trim() || undefined,
          collector_id: collectorId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      if (data.pages) {
        setScrapedPages(data.pages);
      }

      if (data.success) {
        setActionNotice({
          type: 'success',
          message: `Scrape completed successfully! Validated ${data.valid_count} pages (${data.failed_count} flagged). Run ID: ${data.scrape_run.id}`,
        });
      } else {
        setActionNotice({
          type: 'error',
          message: `Scrape run completed with status '${data.scrape_run.status}': ${data.scrape_run.error_summary || 'Unknown error'}`,
        });
      }

      fetchScrapeRuns();
      fetchHealth();
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Scraper execution failed: ${err.message}`,
      });
    } finally {
      setRunningScraper(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!query.trim() || chatLoading) return;

    const userMessage = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMessage.content,
          session_id: sessionId,
        }),
      });

      if (!res.ok || !res.body) {
        // Fallback to non-streaming endpoint
        const fallbackRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: userMessage.content, session_id: sessionId }),
        });
        const data = await fallbackRes.json();
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.answer,
            citations: data.citations || [],
            latency_ms: data.latency_ms,
            grounded: data.grounded,
          },
        ]);
        return;
      }

      // Add placeholder assistant message for streaming tokens
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          citations: [],
          grounded: true,
        },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // Keep partial chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const eventData = JSON.parse(trimmed);
            if (eventData.type === 'token') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  last.content += eventData.delta;
                }
                return updated;
              });
            } else if (eventData.type === 'citations') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  last.citations = eventData.citations;
                }
                return updated;
              });
            } else if (eventData.type === 'done') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  last.content = eventData.answer;
                  last.citations = eventData.citations || last.citations;
                  last.latency_ms = eventData.latency_ms;
                  last.grounded = eventData.grounded;
                }
                return updated;
              });
            }
          } catch (pErr) {
            // Ignore parse errors on partial frames
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Failed to reach the DocMind API. Please ensure the backend server is running.',
          citations: [],
          grounded: false,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };


  const handleClearChat = async () => {
    try {
      await fetch(`/api/chat/history/${sessionId}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to clear session on backend:', err);
    }
    setMessages([]);
    setSessionId('sess_' + Math.random().toString(36).substring(2, 9));
  };


  // Filtered scraped pages
  const filteredPages = scrapedPages.filter((page) => {
    if (pageFilter === 'valid' && !page.is_valid) return false;
    if (pageFilter === 'invalid' && page.is_valid) return false;
    if (pageSearch.trim()) {
      const q = pageSearch.toLowerCase();
      const matchTitle = (page.title || '').toLowerCase().includes(q);
      const matchUrl = (page.url || '').toLowerCase().includes(q);
      const matchSection = (page.section || '').toLowerCase().includes(q);
      if (!matchTitle && !matchUrl && !matchSection) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col w-screen min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-sky-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-tr from-sky-600 to-indigo-600 text-white rounded-xl shadow-lg shadow-sky-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">DocMind</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-mono border border-sky-500/30">
                Self-Healing RAG
              </span>
            </div>
            <p className="text-xs text-slate-400">Bright Data Scrape-Verse Hackathon</p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'chat'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Chat Assistant
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'admin'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Admin & Scraper
          </button>
        </div>

        {/* Health status badge */}
        <div className="hidden md:flex items-center gap-3">
          {health && (
            <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/90 px-3 py-1.5 rounded-full border border-slate-800 shadow-inner">
              <span
                className={`w-2 h-2 rounded-full ${
                  health.status === 'healthy'
                    ? 'bg-emerald-400 animate-pulse'
                    : health.status === 'healing'
                    ? 'bg-amber-400 animate-spin'
                    : 'bg-rose-400'
                }`}
              />
              <span className="capitalize font-medium">{health.status}</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400 font-mono">{health.total_indexed_chunks} chunks</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* =========================================================================
            TAB 1: END-USER CHAT ASSISTANT (PHASE 4 SRS §3.4)
            ========================================================================= */}
        {activeTab === 'chat' && (
          <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4 sm:p-6 overflow-hidden">
            {/* Chat Session Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>Grounded RAG Assistant</span>
                <span className="text-slate-600">|</span>
                <span className="font-mono text-[11px] text-slate-500">Session: {sessionId}</span>
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1.5 transition-colors"
                  title="Clear conversation and start a new session"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>New Session</span>
                </button>
              )}
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                  <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 mb-4 shadow-xl">
                    <BookOpen className="w-10 h-10 text-sky-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-200">Ask a question about the documentation</h2>
                  <p className="text-sm text-slate-400 max-w-md mt-1.5 leading-relaxed">
                    Answers are strictly grounded in documentation scraped via Bright Data Scraper Studio, complete with clickable source citations.
                  </p>

                  {/* Starter question pills */}
                  <div className="flex flex-wrap gap-2 mt-6 justify-center max-w-xl">
                    {[
                      'How do I set up and start the LiteLLM proxy with Docker?',
                      'How does LiteLLM map exceptions across providers?',
                      'What are callbacks used for and how do I create one?',
                      'How do I use the autorouter CLI for model routing?',
                    ].map((sample, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => setQuery(sample)}
                        className="text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-sky-300 px-3 py-2 rounded-lg transition-all text-left shadow-sm"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed shadow-lg ${
                        msg.role === 'user'
                          ? 'bg-sky-600 text-white font-medium rounded-br-none'
                          : msg.grounded === false
                          ? 'bg-slate-900/95 border border-amber-800/60 text-amber-200 rounded-bl-none'
                          : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-none'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {/* Citations block */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Grounded Sources ({msg.citations.length}):</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {msg.citations.map((cit, cIdx) => (
                              <a
                                key={cIdx}
                                href={cit.url}
                                target="_blank"
                                rel="noreferrer"
                                title={cit.section ? `${cit.title} > ${cit.section}` : cit.title}
                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-sky-400 hover:text-sky-300 border border-slate-800 hover:border-sky-500/50 transition-all shadow-sm group"
                              >
                                <span className="font-medium truncate max-w-[220px]">
                                  {cit.title} {cit.section && <span className="text-slate-500 font-normal">› {cit.section}</span>}
                                </span>
                                {cit.similarity_score !== undefined && (
                                  <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                                    {Math.round(cit.similarity_score * 100)}%
                                  </span>
                                )}
                                <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-sky-400 shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {msg.latency_ms && (
                      <span className="text-[10px] text-slate-500 mt-1 px-1 font-mono">
                        Latency: {Math.round(msg.latency_ms)}ms
                      </span>
                    )}
                  </div>
                ))
              )}

              {chatLoading && (
                <div className="flex items-center gap-2.5 text-xs text-slate-400 bg-slate-900/80 px-4 py-3 rounded-xl max-w-xs border border-slate-800 shadow-md">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                  <span>Searching docs & generating answer...</span>
                </div>
              )}
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleSendChat} className="relative mt-auto">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a question about the scraped docs (e.g. 'How do I configure provider retries?')..."
                className="w-full px-4 py-3.5 pr-12 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-sm text-slate-100 placeholder-slate-500 transition-all shadow-xl"
              />
              <button
                type="submit"
                disabled={!query.trim() || chatLoading}
                className="absolute right-2 top-2 p-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white transition-colors"
                aria-label="Send question"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </main>
        )}


        {/* =========================================================================
            TAB 2: ADMIN PANEL & SCRAPER CONTROL (PHASE 1 & PHASE 6 SRS §3.1, §5.1)
            ========================================================================= */}
        {activeTab === 'admin' && !isAuthenticated && (
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex items-center justify-center max-w-md mx-auto w-full">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl w-full space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center mx-auto text-sky-400">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-white">Admin Authentication</h2>
                <p className="text-xs text-slate-400">
                  Sign in with administrator credentials or API key to access scraper management, self-healing controls, and system logs.
                </p>
              </div>

              {loginError && (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Admin Username
                  </label>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Admin Password
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 outline-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
                >
                  {loginLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sliders className="w-4 h-4" />
                  )}
                  <span>Sign In to Admin Panel</span>
                </button>
              </form>

              <div className="pt-3 border-t border-slate-800 text-center">
                <p className="text-[11px] text-slate-500">
                  Protected by HMAC-SHA256 session token signatures & role-based server enforcement (SRS §5.1).
                </p>
              </div>
            </div>
          </main>
        )}

        {activeTab === 'admin' && isAuthenticated && (
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
            {/* Top Admin User Status Bar */}
            <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Signed in as <strong className="text-white font-mono">{authUsername || 'admin'}</strong></span>
                <span className="text-slate-500">| Session Active</span>
              </div>
              <button
                type="button"
                onClick={handleAdminLogout}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition-colors flex items-center gap-1"
              >
                <span>Sign Out</span>
              </button>
            </div>

            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>System Health</span>
                  <ShieldAlert className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-xl font-bold text-white capitalize flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      health?.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  {health?.status || 'Unknown'}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 truncate">
                  {health?.vector_db_provider?.toUpperCase()} Vector DB
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Knowledge Base</span>
                  <Database className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-white font-mono">
                  {health?.total_indexed_chunks || 0}{' '}
                  <span className="text-xs font-normal text-slate-400 font-sans">chunks</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Across {health?.total_indexed_pages || 0} validated pages
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Active Collector ID</span>
                  <Terminal className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-sm font-bold text-sky-400 font-mono truncate">
                  {collectorId || adminState.active_collector_id || '(none set)'}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Bright Data Scraper Studio</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Target Site</span>
                  <Globe className="w-4 h-4 text-amber-400" />
                </div>
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-slate-200 truncate flex items-center gap-1 hover:text-sky-400 transition-colors"
                >
                  <span className="truncate">{targetUrl}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
                <p className="text-[11px] text-slate-500 mt-1">Sitemap-discoverable public docs</p>
              </div>
            </div>

            {/* Action Notice Alert */}
            {actionNotice && (
              <div
                className={`p-4 rounded-xl text-sm flex items-start justify-between border shadow-md transition-all ${
                  actionNotice.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                    : actionNotice.type === 'error'
                    ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                    : 'bg-sky-950/40 border-sky-800/80 text-sky-200'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {actionNotice.type === 'success' && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  {actionNotice.type === 'error' && (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  {actionNotice.type === 'info' && (
                    <RefreshCw className="w-5 h-5 text-sky-400 animate-spin shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold capitalize">{actionNotice.type}: </span>
                    <span className="leading-relaxed">{actionNotice.message}</span>
                  </div>
                </div>
                <button
                  onClick={() => setActionNotice(null)}
                  className="text-slate-400 hover:text-white p-1 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Pending Heal Approval Gate Banner (FR-503 to FR-505) */}
            {health?.pending_heal && (
              <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500/80 rounded-2xl p-6 shadow-2xl space-y-4 animate-pulse">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-amber-500/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl">
                      <AlertTriangle className="w-6 h-6 animate-bounce text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-amber-200 flex items-center gap-2">
                        <span>Scraper Degradation Detected — Self-Healing Approval Required (FR-503)</span>
                      </h3>
                      <p className="text-xs text-amber-400/90 font-mono mt-0.5">
                        Collector: {health.pending_heal.collector_id} | Heal Event: {health.pending_heal.id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleRejectHeal(health.pending_heal.id)}
                      disabled={healingActionId === health.pending_heal.id}
                      className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-rose-800 text-rose-300 hover:text-rose-200 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject Fix (FR-505)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveHeal(health.pending_heal.id)}
                      disabled={healingActionId === health.pending_heal.id}
                      className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {healingActionId === health.pending_heal.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Approve Fix & Re-Index (FR-504)</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-950/90 p-3.5 rounded-xl border border-amber-500/20 space-y-1">
                    <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] block">
                      Detected Breakage Diagnostic (FR-501)
                    </span>
                    <p className="text-amber-300 font-mono text-[11px] leading-relaxed">
                      {health.pending_heal.break_description}
                    </p>
                  </div>
                  <div className="bg-slate-950/90 p-3.5 rounded-xl border border-emerald-500/20 space-y-1">
                    <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] block">
                      Proposed Fix from Bright Data AI (FR-502)
                    </span>
                    <p className="text-emerald-300 font-mono text-[11px] leading-relaxed">
                      {health.pending_heal.fix_summary || 'Autonomous scraper repair proposed by Bright Data Scraper Studio.'}
                    </p>
                  </div>
                </div>
              </div>
            )}


            {/* Scraper Management Form (FR-101 & FR-102) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-sky-400" />
                    Sitemap Scraper Management & Ingestion (FR-101 – FR-104)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Create scrapers via Bright Data CLI (<code className="text-sky-300">bdata scraper create</code>) and ingest documentation pages (<code className="text-sky-300">bdata scraper run</code>).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
                {/* Form Controls */}
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Target Documentation Site URL
                    </label>
                    <input
                      type="url"
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      placeholder="https://docs.litellm.ai"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-sm text-slate-100 placeholder-slate-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Collector ID
                      </label>
                      <input
                        type="text"
                        value={collectorId}
                        onChange={(e) => setCollectorId(e.target.value)}
                        placeholder="c_abc123..."
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-sm font-mono text-sky-300 placeholder-slate-600 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Scraper Description
                      </label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Sitemap scraper for documentation"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-sm text-slate-100 placeholder-slate-600 outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleCreateScraper}
                      disabled={creatingScraper || runningScraper || !targetUrl.trim()}
                      className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {creatingScraper ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                      ) : (
                        <PlusCircle className="w-4 h-4 text-sky-400" />
                      )}
                      <span>Create Scraper (bdata scraper create)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRunScraper}
                      disabled={runningScraper || creatingScraper}
                      className="px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-lg shadow-sky-600/30 flex items-center gap-2 disabled:opacity-50"
                    >
                      {runningScraper ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                      <span>Run Scraper & Ingest Pages (FR-102)</span>
                    </button>
                  </div>
                </div>

                {/* Pipeline Info Card */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-3 text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-sky-400" />
                    Ingestion Pipeline Flow
                  </span>
                  <div className="space-y-2 text-slate-400 leading-relaxed">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-sky-950 text-sky-400 border border-sky-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        1
                      </span>
                      <span>
                        <strong className="text-slate-300">FR-101:</strong> Create Sitemap Scraper via Bright Data CLI.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-sky-950 text-sky-400 border border-sky-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        2
                      </span>
                      <span>
                        <strong className="text-slate-300">FR-102:</strong> Collect structured JSON output and persist raw dumps to <code className="text-sky-300">./data/raw_scrapes/</code>.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-sky-950 text-sky-400 border border-sky-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        3
                      </span>
                      <span>
                        <strong className="text-slate-300">FR-103:</strong> Strict PageValidator rejects empty titles/content and flags errors.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-sky-950 text-sky-400 border border-sky-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        4
                      </span>
                      <span>
                        <strong className="text-slate-300">FR-104:</strong> Scrape run metadata recorded in <code className="text-sky-300">scrape_runs.json</code>.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 2: Indexing Progress & Delta Re-indexing (FR-201 - FR-204 & SRS §3.2) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    Chunking & Embedding Pipeline (FR-201 – FR-204)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Token-accurate chunking (<code className="text-sky-300">tiktoken</code>), AI/ML API embeddings with retry backoff, and delta re-indexing.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
                      indexingProgress.status === 'indexing'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-800/80 animate-pulse'
                        : indexingProgress.status === 'completed'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80'
                        : indexingProgress.status === 'failed'
                        ? 'bg-rose-950/60 text-rose-300 border-rose-800/80'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {indexingProgress.status === 'indexing' && (
                      <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                    )}
                    {indexingProgress.status === 'completed' && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    )}
                    {indexingProgress.status === 'failed' && (
                      <AlertCircle className="w-3 h-3 text-rose-400" />
                    )}
                    <span className="capitalize">{indexingProgress.status}</span>
                  </span>

                  <button
                    type="button"
                    onClick={handleDeltaReindex}
                    disabled={reindexing || indexingProgress.status === 'indexing'}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/20"
                  >
                    {reindexing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>Trigger Delta Re-Index (FR-204)</span>
                  </button>
                </div>
              </div>

              {/* Progress Bars & Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                    <span>Pages Processed</span>
                    <span className="font-mono text-slate-200">
                      {indexingProgress.processed_pages} / {indexingProgress.total_pages || indexingProgress.processed_pages}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          indexingProgress.total_pages > 0
                            ? Math.min(100, (indexingProgress.processed_pages / indexingProgress.total_pages) * 100)
                            : indexingProgress.processed_pages > 0 ? 100 : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                    <span>Chunks Generated</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {indexingProgress.processed_chunks}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-2 truncate">
                    Target: ~500 tokens / chunk with 50-token overlap
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400 mb-1">Last Indexed At</div>
                  <div className="text-xs font-mono text-slate-200 font-semibold mt-1">
                    {indexingProgress.last_indexed_at
                      ? new Date(indexingProgress.last_indexed_at).toLocaleString()
                      : 'Never'}
                  </div>
                  {indexingProgress.current_page_title && (
                    <div className="text-[11px] text-sky-400 mt-1 truncate">
                      Processing: {indexingProgress.current_page_title}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Scraped Pages Table View (SRS §3.1 UI Requirements) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-400" />
                    Scraped Documentation Pages ({scrapedPages.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Live inspection of scraped records, validation status, and content lengths.
                  </p>
                </div>

                {/* Filters & Search */}
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 text-xs">
                    <button
                      onClick={() => setPageFilter('all')}
                      className={`px-3 py-1 rounded font-medium ${
                        pageFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All ({scrapedPages.length})
                    </button>
                    <button
                      onClick={() => setPageFilter('valid')}
                      className={`px-3 py-1 rounded font-medium ${
                        pageFilter === 'valid' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Valid ({scrapedPages.filter((p) => p.is_valid).length})
                    </button>
                    <button
                      onClick={() => setPageFilter('invalid')}
                      className={`px-3 py-1 rounded font-medium ${
                        pageFilter === 'invalid' ? 'bg-rose-950 text-rose-300 border border-rose-800/60' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Flagged ({scrapedPages.filter((p) => !p.is_valid).length})
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={pageSearch}
                      onChange={(e) => setPageSearch(e.target.value)}
                      placeholder="Filter by title / URL..."
                      className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-600 outline-none w-48 focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Title & Section</th>
                      <th className="py-3 px-4">Source URL</th>
                      <th className="py-3 px-4">Content Preview</th>
                      <th className="py-3 px-4">Length</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-normal">
                    {pagesLoading ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-sky-400 mb-2" />
                          <span>Loading scraped pages...</span>
                        </td>
                      </tr>
                    ) : filteredPages.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          <BookOpen className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                          <p className="font-semibold text-slate-300">No documentation pages to display</p>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                            Click <strong className="text-sky-400">'Run Scraper & Ingest Pages'</strong> above to trigger data acquisition via Bright Data CLI.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredPages.map((page, pIdx) => (
                        <tr key={pIdx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap">
                            {page.is_valid ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                                <Check className="w-3 h-3 text-emerald-400" />
                                Valid
                              </span>
                            ) : (
                              <span
                                title={page.error_reason || 'Validation failure'}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/50 cursor-help"
                              >
                                <X className="w-3 h-3 text-rose-400" />
                                Flagged
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">{page.title || '(untitled)'}</div>
                            {page.section && (
                              <span className="inline-block mt-0.5 px-2 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400">
                                {page.section}
                              </span>
                            )}
                            {page.error_reason && (
                              <div className="text-[11px] text-rose-400 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {page.error_reason}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 max-w-[240px]">
                            <a
                              href={page.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-400 hover:text-sky-300 truncate inline-flex items-center gap-1"
                            >
                              <span className="truncate">{page.url}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                            </a>
                          </td>
                          <td className="py-3 px-4 text-slate-400 max-w-xs truncate font-mono text-[11px]">
                            {page.content_snippet || '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {page.content_length} chars
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Historical Scrape Runs Table (FR-104) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-400" />
                    Scrape Execution Runs (FR-104 Metadata Log)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Audit log of Bright Data scraper runs, status, and health metrics.
                  </p>
                </div>
                <button
                  onClick={fetchScrapeRuns}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Refresh runs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${runsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Run ID</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Collector ID</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Pages</th>
                      <th className="py-3 px-4">Details / Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {scrapeRuns.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          No scrape runs logged yet.
                        </td>
                      </tr>
                    ) : (
                      scrapeRuns.map((run, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono text-sky-400 font-semibold">{run.id.slice(0, 8)}...</td>
                          <td className="py-3 px-4 text-slate-400">
                            {new Date(run.timestamp).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">{run.collector_id}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                run.status === 'completed'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : run.status === 'running'
                                  ? 'bg-sky-950 text-sky-400 border border-sky-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {run.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-200">{run.page_count}</td>
                          <td className="py-3 px-4 text-slate-400 truncate max-w-xs">
                            {run.error_summary || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Self-Healing & Scraper Recovery Section (FR-501 to FR-505 & SRS §3.5) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    Self-Healing Monitor & Autonomous Scraper Recovery (FR-501 – FR-505)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Continuous health verification, auto-healing via Bright Data CLI (<code className="text-sky-300">bdata scraper heal</code>), approval gates, and zero-downtime re-indexing.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSimulateDegraded}
                    disabled={simulatingDegraded}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-700/80 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
                    title="Simulate a structural break to demonstrate the automated detection -> heal -> approval -> re-index loop"
                  >
                    {simulatingDegraded ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>Simulate Degraded Breakage (Demo Mode)</span>
                  </button>
                </div>
              </div>

              {/* Manual Heal Trigger Form */}
              <form onSubmit={handleTriggerManualHeal} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Manual Heal Trigger (FR-502)
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={manualHealDesc}
                    onChange={(e) => setManualHealDesc(e.target.value)}
                    placeholder="Describe failure (e.g. 'Sitemap changed structure, missing content tags')..."
                    className="flex-1 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!manualHealDesc.trim() || triggeringHeal}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                  >
                    {triggeringHeal ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5" />
                    )}
                    <span>Trigger bdata scraper heal</span>
                  </button>
                </div>
              </form>

              {/* Heal Events History Log Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Heal Events History Log ({healEvents.length})
                  </span>
                  <button
                    onClick={fetchHealEvents}
                    className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${healsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="py-3 px-4">Heal ID</th>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Breakage Diagnostic</th>
                        <th className="py-3 px-4">Proposed Fix (bdata)</th>
                        <th className="py-3 px-4">Status & Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {healEvents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-500">
                            No heal events recorded yet.
                          </td>
                        </tr>
                      ) : (
                        healEvents.map((heal, hIdx) => (
                          <tr key={hIdx} className="hover:bg-slate-800/40">
                            <td className="py-3 px-4 font-mono text-amber-400 font-semibold">{heal.id.slice(0, 8)}...</td>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                              {new Date(heal.timestamp).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-slate-200 max-w-xs leading-relaxed">
                              {heal.break_description}
                            </td>
                            <td className="py-3 px-4 text-emerald-300 font-mono text-[11px] max-w-xs leading-relaxed">
                              {heal.fix_summary || 'Analysis pending from Bright Data AI'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {heal.approved === true ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  <Check className="w-3 h-3" />
                                  Approved & Re-indexed
                                </span>
                              ) : heal.approved === false ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                                  <X className="w-3 h-3" />
                                  Rejected
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleApproveHeal(heal.id)}
                                    disabled={healingActionId === heal.id}
                                    className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px] transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectHeal(heal.id)}
                                    disabled={healingActionId === heal.id}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-900 text-slate-300 hover:text-rose-200 font-bold text-[10px] border border-slate-700 transition-colors"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </main>
        )}

      </div>
    </div>
  );
}
