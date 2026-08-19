import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileCode,
  FileSpreadsheet,
  FileText,
  Globe,
  Layers,
  Lock,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  User,
  Wrench,
  Zap,
} from 'lucide-react';

/**
 * Reusable Code Block with Syntax Styling, Language Badge, and One-Click Copy
 */
const CodeBlock = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inline) {
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-indigo-700 font-mono text-xs font-semibold"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-md">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-b border-slate-800 text-[11px] font-mono text-slate-400">
        <span className="uppercase tracking-wider font-semibold text-slate-300">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-sans font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="font-sans">Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-xs font-mono leading-relaxed text-slate-100">
        <pre className="!bg-transparent !p-0 !m-0 font-mono">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
};

/**
 * Formatted Markdown Renderer for Assistant Answers
 */
const FormattedMarkdown = ({ content }) => {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-200">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold text-slate-900 mt-3 mb-1.5 text-slate-800">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold text-slate-900 mt-2.5 mb-1">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="leading-relaxed my-2 text-slate-700">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-slate-700">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-slate-700">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-slate-200 shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-slate-100 px-3.5 py-2.5 font-semibold text-slate-800 border-b border-slate-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2 border-b border-slate-100 text-slate-700">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-indigo-500 bg-indigo-50/70 px-3.5 py-2.5 rounded-r-lg my-2.5 text-slate-700 italic text-xs">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2 font-medium"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'admin'
  const [adminSubTab, setAdminSubTab] = useState('overview'); // 'overview' | 'scraper' | 'pages' | 'healing' | 'logs'

  // Chat Engine State
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Hello! I am **DocMind**, your AI documentation assistant. Ask me anything about the indexed documentation, and I will generate grounded answers with direct source citations.',
      grounded: true,
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(() => 'sess_' + Math.random().toString(36).substring(2, 9));
  const messagesEndRef = useRef(null);

  // Scraper Studio Form State
  const [targetUrl, setTargetUrl] = useState('https://docs.litellm.ai');
  const [description, setDescription] = useState('Sitemap scraper for documentation pages');
  const [collectorId, setCollectorId] = useState('');

  // Admin Authentication & Session State
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('docmind_admin_token') || '');
  const [authUsername, setAuthUsername] = useState(() => localStorage.getItem('docmind_admin_user') || 'admin');
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('docmind_admin_token')));
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // Scraper Execution & Ingestion State
  const [creatingScraper, setCreatingScraper] = useState(false);
  const [runningScraper, setRunningScraper] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [scrapedPages, setScrapedPages] = useState([]);
  const [scrapeRuns, setScrapeRuns] = useState([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);

  // Self-Healing & Health State
  const [health, setHealth] = useState(null);
  const [healEvents, setHealEvents] = useState([]);
  const [healsLoading, setHealsLoading] = useState(false);
  const [triggeringHeal, setTriggeringHeal] = useState(false);
  const [manualHealDesc, setManualHealDesc] = useState('');
  const [approvingHeal, setApprovingHeal] = useState(false);
  const [rejectingHeal, setRejectingHeal] = useState(false);
  const [simulatingDegraded, setSimulatingDegraded] = useState(false);

  // Admin State & Metrics
  const [adminState, setAdminState] = useState(null);
  const [indexingProgress, setIndexingProgress] = useState({
    status: 'idle',
    total_pages: 0,
    indexed_pages: 0,
    total_chunks: 0,
    progress_pct: 100,
    current_page_title: '',
    error: null,
  });

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);

  // UI Search & Filter States
  const [searchFilter, setSearchFilter] = useState('');
  const [pageStatusFilter, setPageStatusFilter] = useState('all'); // 'all' | 'valid' | 'flagged'
  const [actionNotice, setActionNotice] = useState(null);

  // Auto-scroll chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, chatLoading]);

  // Initial Data Load
  useEffect(() => {
    fetchHealth();
  }, [isAuthenticated, authToken]);

  useEffect(() => {
    if (activeTab === 'admin' && isAuthenticated) {
      fetchAdminState();
      fetchIndexingProgress();
      fetchLatestPages();
      fetchScrapeRuns();
      fetchHealEvents();
      fetchAuditLogs();
    }
  }, [activeTab, isAuthenticated]);

  // Poll indexing progress when active
  useEffect(() => {
    let interval = null;
    if (indexingProgress.status === 'indexing' && isAuthenticated) {
      interval = setInterval(() => {
        fetchIndexingProgress();
        fetchHealth();
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [indexingProgress.status, isAuthenticated]);

  // Auth Header Helper
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

  // Admin Login Handler
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

  // Admin Logout Handler
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
      setActionNotice({ type: 'info', message: 'Signed out of administrator session.' });
    }
  };

  // Health Polling
  const fetchHealth = async () => {
    try {
      const endpoint = isAuthenticated && authToken ? '/api/admin/health' : '/api/health';
      const headers = isAuthenticated && authToken ? getAuthHeaders() : { 'Content-Type': 'application/json' };
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
      console.warn('Backend API currently unreachable:', err);
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
    setActionNotice({ type: 'info', message: 'Triggering AI Scraper Repair via Bright Data...' });

    try {
      const res = await fetch('/api/admin/heal/trigger', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          collector_id: collectorId.trim() || undefined,
          description: manualHealDesc.trim(),
        }),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to trigger scraper repair');

      setActionNotice({
        type: 'success',
        message: `Scraper repair event registered. Proposed Fix: ${data.proposed_fix || 'Pending review'}`,
      });
      setManualHealDesc('');
      fetchHealth();
      fetchHealEvents();
    } catch (err) {
      setActionNotice({ type: 'error', message: err.message });
    } finally {
      setTriggeringHeal(false);
    }
  };

  const handleApproveHeal = async (healId) => {
    if (approvingHeal) return;
    setApprovingHeal(true);
    setActionNotice({ type: 'info', message: 'Approving AI repair fix, re-scraping & re-indexing vector store...' });

    try {
      const res = await fetch(`/api/admin/heal/${healId}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Approval failed');

      setActionNotice({
        type: 'success',
        message: `Repair approved! Re-indexed ${data.reindexed_pages || 0} pages into knowledge base. System restored to HEALTHY.`,
      });
      fetchHealth();
      fetchHealEvents();
      fetchLatestPages();
    } catch (err) {
      setActionNotice({ type: 'error', message: err.message });
    } finally {
      setApprovingHeal(false);
    }
  };

  const handleRejectHeal = async (healId) => {
    if (rejectingHeal) return;
    setRejectingHeal(true);
    setActionNotice({ type: 'info', message: 'Rejecting proposed repair fix...' });

    try {
      const res = await fetch(`/api/admin/heal/${healId}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Rejection failed');

      setActionNotice({ type: 'info', message: 'Proposed repair fix rejected.' });
      fetchHealth();
      fetchHealEvents();
    } catch (err) {
      setActionNotice({ type: 'error', message: err.message });
    } finally {
      setRejectingHeal(false);
    }
  };

  const handleSimulateDegraded = async () => {
    if (simulatingDegraded) return;
    setSimulatingDegraded(true);
    setActionNotice({ type: 'warning', message: 'Injecting simulated site breakage (1 page returned)...' });

    try {
      const res = await fetch('/api/admin/heal/simulate-degraded', {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Simulation failed');

      setActionNotice({
        type: 'warning',
        message: `Simulated breakage injected! System health changed to DEGRADED. Automated AI repair triggered.`,
      });
      fetchHealth();
      fetchHealEvents();
      fetchScrapeRuns();
    } catch (err) {
      setActionNotice({ type: 'error', message: err.message });
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

  const fetchAuditLogs = async () => {
    setAuditLogsLoading(true);
    try {
      const res = await fetch('/api/admin/audit-logs?limit=25', { headers: getAuthHeaders() });
      if (!checkAuthResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.warn('Failed to fetch audit logs:', err);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  const handleDeltaReindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    setActionNotice({ type: 'info', message: 'Triggering Knowledge Base Delta Re-Indexing...' });

    try {
      const res = await fetch('/api/admin/indexing/reindex', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Reindexing failed');

      setActionNotice({
        type: 'success',
        message: `Delta re-indexing initiated. Reindexed ${data.indexed_pages || data.reindexed_pages || 0} pages into knowledge base.`,
      });
      fetchIndexingProgress();
      fetchHealth();
    } catch (err) {
      setActionNotice({ type: 'error', message: err.message });
    } finally {
      setReindexing(false);
    }
  };

  const handleCreateScraper = async (e) => {
    e?.preventDefault();
    if (creatingScraper) return;
    setCreatingScraper(true);
    setActionNotice({ type: 'info', message: 'Creating Sitemap Scraper with Bright Data Studio... (this may take up to 3 minutes)' });

    try {
      const res = await fetch('/api/admin/scraper/create', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          url: targetUrl.trim(),
          description: description.trim(),
        }),
      });

      if (!checkAuthResponse(res)) return;
      const data = await res.json();

      if (!res.ok) {
        // On timeout/CLI failure, show a helpful tip instead of a generic error
        const isTimeout = res.status === 503 || (data.detail && data.detail.toLowerCase().includes('timed out'));
        if (isTimeout) {
          setActionNotice({
            type: 'warning',
            message: `⚠️ Bright Data CLI timed out creating the scraper. This is normal for large sites. You can: (1) Go to Bright Data Scraper Studio → copy your Collector ID → paste it below and click "Run Scraper", or (2) Use your existing Collector ID: ${settings?.brightdata_collector_id || 'c_msyg7ceoo6la3ofn6'}`,
          });
        } else {
          throw new Error(data.detail || 'Failed to create scraper');
        }
        return;
      }

      setCollectorId(data.collector_id);
      setActionNotice({
        type: 'success',
        message: `Scraper created successfully! Collector ID: ${data.collector_id}`,
      });
      fetchAdminState();
      fetchHealth();
    } catch (err) {
      setActionNotice({ type: 'error', message: err.message });
    } finally {
      setCreatingScraper(false);
    }
  };

  const handleRunScraper = async () => {
    if (runningScraper) return;
    setRunningScraper(true);
    setActionNotice({ type: 'info', message: 'Executing scraper on Bright Data cloud & ingesting pages...' });

    try {
      const res = await fetch('/api/admin/scraper/run', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          collector_id: collectorId.trim() || undefined,
          url: targetUrl.trim() || undefined,
        }),
      });


      if (!checkAuthResponse(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to execute scraper run');

      const validCount = data.valid_count ?? data.pages?.length ?? 0;
      const flaggedCount = data.failed_count ?? 0;
      setActionNotice({
        type: 'success',
        message: `Scrape completed! ${validCount} valid pages indexed (${flaggedCount} flagged).`,
      });
      fetchLatestPages();
      fetchScrapeRuns();
      fetchHealth();
    } catch (err) {
      setActionNotice({ type: 'error', message: err.message });
    } finally {
      setRunningScraper(false);
    }
  };

  // Real-Time Token Streaming Chat Handler
  const handleSendChat = async (e) => {
    e?.preventDefault();
    const query = inputQuery.trim();
    if (!query || chatLoading) return;

    // Add user message immediately
    const userMsg = { role: 'user', content: query };
    const initialAssistantMsg = {
      role: 'assistant',
      content: '',
      citations: [],
      grounded: true,
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setInputQuery('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          session_id: activeSessionId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Chat request failed (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedAnswer = '';
      let receivedCitations = [];
      let isGrounded = true;
      let latency = 0;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const jsonStr = trimmed.startsWith('data: ') ? trimmed.substring(6).trim() : trimmed;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'citations') {
              receivedCitations = event.citations || [];
            } else if (event.type === 'token') {
              accumulatedAnswer += event.delta;
            } else if (event.type === 'done') {
              accumulatedAnswer = event.answer || event.delta || accumulatedAnswer;
              receivedCitations = event.citations || receivedCitations;
              isGrounded = event.grounded ?? true;
              latency = event.latency_ms || 0;
            }

            // Update active streaming message
            setMessages((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: accumulatedAnswer,
                  citations: receivedCitations,
                  grounded: isGrounded,
                  latency_ms: latency,
                  streaming: true,
                };
              }
              return updated;
            });
          } catch (e) {
            console.warn('SSE parsing error:', e, jsonStr);
          }
        }
      }


      // Finalize streaming
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = {
            ...updated[lastIdx],
            streaming: false,
          };
        }
        return updated;
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = {
            role: 'assistant',
            content: `⚠️ Error retrieving answer: ${err.message}`,
            grounded: false,
            streaming: false,
          };
        }
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  };

  const handleClearChat = async () => {
    try {
      await fetch(`/api/chat/history/${activeSessionId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Session reset error:', e);
    }
    const newSession = 'sess_' + Math.random().toString(36).substring(2, 9);
    setActiveSessionId(newSession);
    setMessages([
      {
        role: 'assistant',
        content:
          'Conversation reset! Ask me any question about the documentation, and I will search the indexed vector store for verified answers.',
        grounded: true,
      },
    ]);
  };

  // Filtered pages list
  const filteredPages = scrapedPages.filter((page) => {
    const matchesSearch =
      !searchFilter ||
      page.title?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      page.url?.toLowerCase().includes(searchFilter.toLowerCase());

    if (pageStatusFilter === 'valid') return matchesSearch && page.is_valid;
    if (pageStatusFilter === 'flagged') return matchesSearch && !page.is_valid;
    return matchesSearch;
  });

  const pendingHeal = healEvents.find((h) => h.status === 'pending_review');

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* ──────────────── Top Navigation Header ──────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">
                  DocMind
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Documentation RAG
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Self-Healing AI Documentation Assistant
              </p>
            </div>
          </div>

          {/* Right Navigation & Status Indicators */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* System Health Badge */}
            {health && (
              <div
                className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-sm ${
                  health.status === 'healthy'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : health.status === 'degraded'
                    ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    health.status === 'healthy'
                      ? 'bg-emerald-500'
                      : health.status === 'degraded'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="capitalize">{health.status} System</span>
                {health.total_indexed_pages > 0 && (
                  <span className="text-slate-500 font-normal pl-1 border-l border-slate-300">
                    {health.total_indexed_pages} docs ({health.total_indexed_chunks} chunks)
                  </span>
                )}
              </div>
            )}

            {/* Main Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'chat'
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Chat Assistant</span>
              </button>

              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'admin'
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Admin Studio</span>
                {pendingHeal && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                )}
              </button>
            </div>

            {/* Admin Session Info */}
            {isAuthenticated && (
              <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200">
                <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  {authUsername}
                </span>
                <button
                  onClick={handleAdminLogout}
                  title="Sign out"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-600 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ──────────────── Notification Banner ──────────────── */}
      {actionNotice && (
        <div
          className={`border-b px-4 py-2.5 text-xs font-medium flex items-center justify-between transition-all ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : actionNotice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : actionNotice.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800'
          }`}
        >
          <div className="max-w-7xl mx-auto flex items-center gap-2 w-full">
            {actionNotice.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {actionNotice.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {actionNotice.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
            {actionNotice.type === 'info' && <RefreshCw className="w-4 h-4 text-indigo-600 shrink-0 animate-spin" />}
            <span className="flex-1">{actionNotice.message}</span>
            <button
              onClick={() => setActionNotice(null)}
              className="text-slate-400 hover:text-slate-700 text-xs px-2 py-0.5 rounded hover:bg-slate-200/50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ──────────────── Main Content Area ──────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'chat' ? (
          /* ════════════════════════════════════════════════════════════
             CHAT INTERFACE VIEW
             ════════════════════════════════════════════════════════════ */
          <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-10rem)] min-h-[500px]">
            {/* Chat Messages Container */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                    <Bot className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">
                    Ask DocMind About Your Documentation
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md">
                    Answers are strictly generated from indexed pages with verified source citations.
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    {/* User Message Bubble */}
                    {msg.role === 'user' ? (
                      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-none px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-medium text-sm leading-relaxed shadow-sm">
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ) : (
                      /* Assistant Message Card */
                      <div
                        className={`max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-tl-none p-5 text-sm leading-relaxed shadow-sm transition-all ${
                          msg.grounded === false
                            ? 'bg-amber-50/80 border border-amber-200 text-slate-800'
                            : 'bg-white border border-slate-200 text-slate-800'
                        }`}
                      >
                        {/* Assistant Header Badge */}
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 text-xs font-semibold text-slate-500">
                          <Bot className="w-4 h-4 text-indigo-600" />
                          <span className="text-slate-800">DocMind Assistant</span>
                          {msg.grounded === false && (
                            <span className="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                              Out of Domain
                            </span>
                          )}
                        </div>

                        {/* Rich Markdown Answer Content */}
                        <FormattedMarkdown content={msg.content || '...'} />

                        {/* Interactive Grounded Citations Chips */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Verified Source Citations ({msg.citations.length}):</span>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {msg.citations.map((cit, cIdx) => (
                                <a
                                  key={cIdx}
                                  href={cit.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={cit.section ? `${cit.title} › ${cit.section}` : cit.title}
                                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-indigo-50/80 text-indigo-700 hover:text-indigo-900 border border-slate-200 hover:border-indigo-300 transition shadow-sm group"
                                >
                                  <Globe className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                                  <span className="font-semibold truncate max-w-[200px]">
                                    {cit.title}
                                    {cit.section && (
                                      <span className="text-slate-500 font-normal ml-1">
                                        › {cit.section}
                                      </span>
                                    )}
                                  </span>
                                  {cit.similarity_score !== undefined && (
                                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                                      {Math.round(cit.similarity_score * 100)}% match
                                    </span>
                                  )}
                                  <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Latency & Metadata Footer */}
                        {msg.latency_ms && (
                          <div className="mt-3 text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Response generation time: {Math.round(msg.latency_ms)}ms</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Streaming Indicator */}
              {chatLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex items-center gap-2.5 text-xs text-slate-600 bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm max-w-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Searching vector index & streaming answer...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Starter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto py-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                Suggested:
              </span>
              {[
                'How do I run the LiteLLM proxy with Docker?',
                'What embedding models are supported?',
                'How does load balancing work in LiteLLM?',
              ].map((pill, pIdx) => (
                <button
                  key={pIdx}
                  onClick={() => setInputQuery(pill)}
                  className="text-xs px-3 py-1.5 rounded-full bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-700 font-medium whitespace-nowrap transition shadow-sm"
                >
                  {pill}
                </button>
              ))}
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendChat} className="mt-1 relative flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder="Ask a question about the documentation..."
                  className="w-full pl-4 pr-12 py-3.5 rounded-2xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm shadow-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  disabled={!inputQuery.trim() || chatLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition shadow-sm"
                  title="Send query"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleClearChat}
                title="Reset conversation session"
                className="p-3 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-700 transition shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════════
             ADMIN STUDIO INTERFACE VIEW
             ════════════════════════════════════════════════════════════ */
          <div className="space-y-6">
            {/* Sub-navigation Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Scraper Studio & System Administration
                </h1>
                <p className="text-xs text-slate-500">
                  Manage documentation scraping, monitor crawler health, review automated repairs, and inspect audit logs.
                </p>
              </div>

              {/* Sub-tab Navigation Pills */}
              <div className="flex bg-slate-200/70 p-1 rounded-xl border border-slate-300/60 overflow-x-auto">
                {[
                  { id: 'overview', label: 'Overview', icon: Layers },
                  { id: 'scraper', label: 'Scraper Studio', icon: Globe },
                  { id: 'pages', label: 'Indexed Pages', icon: FileText },
                  { id: 'healing', label: 'Self-Healing', icon: Wrench },
                  { id: 'logs', label: 'Audit Logs', icon: Terminal },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setAdminSubTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                        adminSubTab === tab.id
                          ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Authentication Guard */}
            {!isAuthenticated ? (
              /* ──────────────── Admin Sign-In Card ──────────────── */
              <div className="max-w-md mx-auto my-12 p-8 bg-white border border-slate-200 shadow-xl rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="text-center mb-6">
                  <h2 className="text-lg font-bold text-slate-900">Administrator Sign In</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter your credentials from your environment file to access scraper controls, health monitor, and audit logs.
                  </p>
                </div>

                {loginError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="admin"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter administrator password..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm transition shadow-sm flex items-center justify-center gap-2"
                  >
                    {loginLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                    <span>Sign In to Admin Studio</span>
                  </button>
                </form>

                <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                  <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    Protected by HMAC session signatures & server-side authorization
                  </p>
                </div>
              </div>
            ) : (
              /* ──────────────── Authenticated Admin Panel Views ──────────────── */
              <div className="space-y-6">
                {/* ════ Pending Self-Healing Review Alert Banner ════ */}
                {pendingHeal && (
                  <div className="p-5 rounded-2xl bg-amber-50/90 border border-amber-300 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-amber-900">
                              Automated Scraper Repair Awaiting Review
                            </span>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 border border-amber-300">
                              Action Required
                            </span>
                          </div>
                          <p className="text-xs text-amber-800 mt-1">
                            Breakage detected: {pendingHeal.break_description || 'Page count dropped significantly from previous run.'}
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleApproveHeal(pendingHeal.heal_id)}
                          disabled={approvingHeal}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                        >
                          {approvingHeal ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Approve AI Fix</span>
                        </button>

                        <button
                          onClick={() => handleRejectHeal(pendingHeal.heal_id)}
                          disabled={rejectingHeal}
                          className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 text-xs font-bold transition shadow-sm flex items-center gap-1"
                        >
                          {rejectingHeal ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>

                    {/* Proposed Fix Diagnostic */}
                    {pendingHeal.proposed_fix && (
                      <div className="p-3 bg-white rounded-xl border border-amber-200 text-xs text-slate-700 font-mono">
                        <span className="font-sans font-bold text-amber-900 block mb-1">
                          Proposed Scraper Schema Fix:
                        </span>
                        {pendingHeal.proposed_fix}
                      </div>
                    )}
                  </div>
                )}

                {/* ════ SUBTAB: Overview Dashboard ════ */}
                {adminSubTab === 'overview' && (
                  <div className="space-y-6">
                    {/* KPI Stat Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* System Health */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-card">
                        <div className="flex items-center justify-between text-slate-500 mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider">Health Status</span>
                          <Activity className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-3 h-3 rounded-full ${
                              health?.status === 'healthy'
                                ? 'bg-emerald-500'
                                : health?.status === 'degraded'
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                          />
                          <span className="text-xl font-bold capitalize text-slate-900">
                            {health?.status || 'Unknown'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                          Auto-recovery monitor active
                        </p>
                      </div>

                      {/* Active Collector */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-card">
                        <div className="flex items-center justify-between text-slate-500 mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider">Collector ID</span>
                          <Globe className="w-4 h-4 text-sky-600" />
                        </div>
                        <div className="text-base font-bold font-mono text-slate-900 truncate">
                          {collectorId || adminState?.active_collector_id || 'Not configured'}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                          Bright Data Scraper Studio
                        </p>
                      </div>

                      {/* Total Pages */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-card">
                        <div className="flex items-center justify-between text-slate-500 mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider">Indexed Pages</span>
                          <FileText className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900">
                          {health?.total_indexed_pages || scrapedPages.length || 0}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                          Validated documentation pages
                        </p>
                      </div>

                      {/* Vector Chunks */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-card">
                        <div className="flex items-center justify-between text-slate-500 mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider">Vector Chunks</span>
                          <Database className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900">
                          {health?.total_indexed_chunks || 0}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                          Indexed in local ChromaDB store
                        </p>
                      </div>
                    </div>

                    {/* Quick Action Bar & Live Demo Controls */}
                    <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-card space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            Live System Actions & Demo Controls
                          </h3>
                          <p className="text-xs text-slate-500">
                            Trigger scraper runs, test delta re-indexing, or simulate site breakage for judging demos.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                          onClick={handleRunScraper}
                          disabled={runningScraper || !collectorId}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm flex items-center gap-2"
                        >
                          {runningScraper ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          <span>Run Ingestion Pipeline</span>
                        </button>

                        <button
                          onClick={handleDeltaReindex}
                          disabled={reindexing}
                          className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-bold transition shadow-sm flex items-center gap-2"
                        >
                          {reindexing ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Database className="w-3.5 h-3.5 text-indigo-600" />
                          )}
                          <span>Trigger Delta Re-Index</span>
                        </button>

                        <button
                          onClick={handleSimulateDegraded}
                          disabled={simulatingDegraded}
                          className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition shadow-sm flex items-center gap-2 ml-auto"
                        >
                          {simulatingDegraded ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          <span>Simulate Site Breakage (Demo Mode)</span>
                        </button>
                      </div>
                    </div>

                    {/* Ingestion & Indexing Progress Card */}
                    <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-indigo-600" />
                          <h3 className="text-sm font-bold text-slate-900">
                            Knowledge Base Ingestion Progress
                          </h3>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-700">
                          {indexingProgress.indexed_pages} / {indexingProgress.total_pages} Pages Indexed
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-600 to-sky-500 transition-all duration-300"
                          style={{ width: `${indexingProgress.progress_pct || 100}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          Status: <span className="font-semibold text-slate-700 capitalize">{indexingProgress.status}</span>
                        </span>
                        {indexingProgress.current_page_title && (
                          <span className="truncate max-w-xs text-slate-500">
                            Current: {indexingProgress.current_page_title}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ════ SUBTAB: Scraper Studio ════ */}
                {adminSubTab === 'scraper' && (
                  <div className="space-y-6">
                    <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-card space-y-5">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Bright Data Scraper Studio Configuration
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Create or manage the web crawler collector for extracting sitemap documentation.
                        </p>
                      </div>

                      <form onSubmit={handleCreateScraper} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                              Target Documentation URL
                            </label>
                            <input
                              type="url"
                              value={targetUrl}
                              onChange={(e) => setTargetUrl(e.target.value)}
                              placeholder="https://docs.example.com"
                              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                              Scraper Description
                            </label>
                            <input
                              type="text"
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              placeholder="Sitemap scraper for documentation pages"
                              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Active Collector ID
                          </label>
                          <input
                            type="text"
                            value={collectorId}
                            onChange={(e) => setCollectorId(e.target.value)}
                            placeholder="c_xxxxxxxxxxxxxxx"
                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-mono text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                          <button
                            type="submit"
                            disabled={creatingScraper}
                            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm flex items-center gap-2"
                          >
                            {creatingScraper ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Plus className="w-3.5 h-3.5" />
                            )}
                            <span>Create New Scraper</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleRunScraper}
                            disabled={runningScraper || !collectorId}
                            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm flex items-center gap-2"
                          >
                            {runningScraper ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                            <span>Run Ingestion Pipeline</span>
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Scrape Execution History Table */}
                    <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-card space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">
                          Scrape Execution History
                        </h3>
                        <button
                          onClick={fetchScrapeRuns}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Refresh
                        </button>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Run ID</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Timestamp</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Status</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Valid Pages</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Flagged</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Execution Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {scrapeRuns.length === 0 ? (
                              <tr>
                                <td colSpan="6" className="px-4 py-4 text-center text-slate-400">
                                  No scrape runs recorded yet.
                                </td>
                              </tr>
                            ) : (
                              scrapeRuns.map((run, rIdx) => (
                                <tr key={rIdx} className="hover:bg-slate-50/80">
                                  <td className="px-4 py-2.5 font-mono text-slate-600">{run.run_id}</td>
                                  <td className="px-4 py-2.5 text-slate-500">
                                    {new Date(run.timestamp).toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                        run.status === 'completed'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}
                                    >
                                      {run.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 font-semibold text-slate-800">
                                    {run.valid_pages ?? run.page_count}
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-500">
                                    {run.flagged_pages ?? 0}
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-500 font-mono">
                                    {run.execution_time_seconds
                                      ? `${run.execution_time_seconds.toFixed(2)}s`
                                      : '—'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ════ SUBTAB: Scraped Documentation Pages ════ */}
                {adminSubTab === 'pages' && (
                  <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-card space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Scraped Documentation Pages ({filteredPages.length})
                        </h2>
                        <p className="text-xs text-slate-500">
                          Validated pages from the latest scrape ready for embedding and retrieval.
                        </p>
                      </div>

                      {/* Search & Filter Bar */}
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            placeholder="Search page title or URL..."
                            className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-600 focus:bg-white outline-none w-56"
                          />
                        </div>

                        <select
                          value={pageStatusFilter}
                          onChange={(e) => setPageStatusFilter(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:border-indigo-600 focus:bg-white outline-none"
                        >
                          <option value="all">All Pages</option>
                          <option value="valid">Valid Only</option>
                          <option value="flagged">Flagged Only</option>
                        </select>
                      </div>
                    </div>

                    {/* Pages Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-2.5 font-bold text-slate-700">Status</th>
                            <th className="px-4 py-2.5 font-bold text-slate-700">Document Title</th>
                            <th className="px-4 py-2.5 font-bold text-slate-700">URL</th>
                            <th className="px-4 py-2.5 font-bold text-slate-700">Content Size</th>
                            <th className="px-4 py-2.5 font-bold text-slate-700">Headings</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredPages.length === 0 ? (
                            <tr>
                              <td colSpan="5" className="px-4 py-6 text-center text-slate-400">
                                No documentation pages found matching your search.
                              </td>
                            </tr>
                          ) : (
                            filteredPages.map((page, pIdx) => (
                              <tr key={pIdx} className="hover:bg-slate-50/80">
                                <td className="px-4 py-2.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                      page.is_valid
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}
                                  >
                                    {page.is_valid ? 'Valid' : 'Flagged'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 font-semibold text-slate-900">
                                  {page.title || 'Untitled Page'}
                                </td>
                                <td className="px-4 py-2.5 text-indigo-600 font-mono truncate max-w-xs">
                                  <a
                                    href={page.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline flex items-center gap-1"
                                  >
                                    <span className="truncate">{page.url}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                </td>
                                <td className="px-4 py-2.5 text-slate-500 font-mono">
                                  {page.content_length} chars
                                </td>
                                <td className="px-4 py-2.5 text-slate-500">
                                  {page.headings && page.headings.length > 0 ? (
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
                                      {page.headings.length} sections
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ════ SUBTAB: Self-Healing & Recovery ════ */}
                {adminSubTab === 'healing' && (
                  <div className="space-y-6">
                    {/* Manual Scraper Repair Form */}
                    <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-card space-y-4">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Autonomous AI Scraper Repair & Healing
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          When website layouts change, DocMind automatically diagnoses breakages and prompts Bright Data AI to heal the scraper.
                        </p>
                      </div>

                      <form onSubmit={handleTriggerManualHeal} className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Breakage Description / Custom Healing Instructions
                          </label>
                          <input
                            type="text"
                            value={manualHealDesc}
                            onChange={(e) => setManualHealDesc(e.target.value)}
                            placeholder="e.g. Target documentation updated navbar selectors, 0 pages scraped"
                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                            required
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={triggeringHeal}
                          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm flex items-center gap-2"
                        >
                          {triggeringHeal ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wrench className="w-3.5 h-3.5" />
                          )}
                          <span>Trigger AI Scraper Healing</span>
                        </button>
                      </form>
                    </div>

                    {/* Healing Events History Table */}
                    <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-card space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">
                          Self-Healing Events History
                        </h3>
                        <button
                          onClick={fetchHealEvents}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Refresh
                        </button>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Heal ID</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Timestamp</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Status</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Breakage Reason</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Proposed Fix</th>
                              <th className="px-4 py-2.5 font-bold text-slate-700">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {healEvents.length === 0 ? (
                              <tr>
                                <td colSpan="6" className="px-4 py-4 text-center text-slate-400">
                                  No self-healing events recorded yet.
                                </td>
                              </tr>
                            ) : (
                              healEvents.map((heal, hIdx) => (
                                <tr key={hIdx} className="hover:bg-slate-50/80">
                                  <td className="px-4 py-2.5 font-mono text-slate-600">{heal.heal_id}</td>
                                  <td className="px-4 py-2.5 text-slate-500">
                                    {new Date(heal.timestamp).toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                        heal.status === 'approved'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : heal.status === 'pending_review'
                                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}
                                    >
                                      {heal.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">
                                    {heal.break_description}
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-600 font-mono max-w-xs truncate">
                                    {heal.proposed_fix || '—'}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {heal.status === 'pending_review' ? (
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => handleApproveHeal(heal.heal_id)}
                                          disabled={approvingHeal}
                                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px]"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => handleRejectHeal(heal.heal_id)}
                                          disabled={rejectingHeal}
                                          className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] border border-rose-200"
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 text-[11px]">Completed</span>
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
                )}

                {/* ════ SUBTAB: Security & Audit Logs ════ */}
                {adminSubTab === 'logs' && (
                  <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-card space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Security & Operational Audit Trail
                        </h2>
                        <p className="text-xs text-slate-500">
                          Chronological immutable record of authentication attempts, scraper actions, and recovery events.
                        </p>
                      </div>
                      <button
                        onClick={fetchAuditLogs}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Refresh
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-2.5 font-bold text-slate-700">Timestamp</th>
                            <th className="px-4 py-2.5 font-bold text-slate-700">Actor</th>
                            <th className="px-4 py-2.5 font-bold text-slate-700">Action</th>
                            <th className="px-4 py-2.5 font-bold text-slate-700">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {auditLogs.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="px-4 py-4 text-center text-slate-400">
                                No audit events logged yet.
                              </td>
                            </tr>
                          ) : (
                            auditLogs.map((log, lIdx) => (
                              <tr key={lIdx} className="hover:bg-slate-50/80">
                                <td className="px-4 py-2.5 text-slate-500 font-mono">
                                  {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="px-4 py-2.5 font-semibold text-slate-800 font-mono">
                                  {log.actor}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                      log.action.includes('SUCCESS') || log.action.includes('APPROVED')
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : log.action.includes('FAILED') || log.action.includes('REJECTED')
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    }`}
                                  >
                                    {log.action}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-600 font-mono truncate max-w-sm">
                                  {log.details ? JSON.stringify(log.details) : '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ──────────────── Footer ──────────────── */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">DocMind</span>
            <span>—</span>
            <span>Self-Healing Documentation RAG</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Powered by Bright Data Scraper Studio & OpenAI-compatible Models</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
