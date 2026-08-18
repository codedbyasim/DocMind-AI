import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Sparkles,
  RotateCcw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  BookOpen,
} from 'lucide-react';
import UserNavbar from '../components/UserNavbar';

export default function ChatPage() {
  const [sessionId, setSessionId] = useState(() => 'sess_' + Math.random().toString(36).substring(2, 9));
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [targetUrl, setTargetUrl] = useState('https://docs.litellm.ai');
  const chatBottomRef = useRef(null);

  // Fetch target site metadata
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.target_docs_url) {
          setTargetUrl(data.target_docs_url);
        }
      })
      .catch((err) => console.warn('Could not fetch documentation status:', err));
  }, []);

  // Auto scroll to bottom of chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const starterQuestions = [
    'How do I run LiteLLM proxy with Docker?',
    'How does LiteLLM handle error and exception mapping?',
    'What environment variables are supported for OpenAI models?',
    'How do I configure load balancing across multiple LLM keys?',
  ];

  const handleSendChat = async (e, directQuery = null) => {
    if (e) e.preventDefault();
    const queryText = (directQuery || query).trim();
    if (!queryText || chatLoading) return;

    const userMessage = { role: 'user', content: queryText };
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          session_id: sessionId,
        }),
      });

      if (!res.ok || !res.body) {
        // Fallback to non-streaming endpoint
        const fallbackRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryText, session_id: sessionId }),
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
        buffer = lines.pop();

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
            // Partial JSON frames are ignored
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Unable to reach the assistant. Please make sure the backend server is running.',
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
      console.warn('Session clear notification error:', err);
    }
    setMessages([]);
    setSessionId('sess_' + Math.random().toString(36).substring(2, 9));
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col">
      {/* Public Minimal Header */}
      <UserNavbar targetUrl={targetUrl} />

      {/* Main Chat Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col">
        {/* Messages Card */}
        <div className="flex-1 rounded-2xl bg-slate-900/50 border border-slate-800/80 p-4 sm:p-6 flex flex-col justify-between shadow-xl backdrop-blur-sm min-h-[560px]">
          {/* Scrollable Conversation Stream */}
          <div className="space-y-4 overflow-y-auto max-h-[62vh] pr-2 scrollbar-thin">
            {messages.length === 0 ? (
              /* Empty State */
              <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600/20 to-sky-500/20 border border-cyan-500/30 flex items-center justify-center mb-4 text-cyan-400 shadow-inner">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-white mb-1.5 tracking-tight">
                  Search & Explore Documentation
                </h2>
                <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
                  Ask any question regarding installation, APIs, code examples, or configuration. Answers are strictly grounded in live documentation with verified citations.
                </p>

                {/* Starter Pills */}
                <div className="w-full max-w-lg space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    Popular Questions
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {starterQuestions.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendChat(null, q)}
                        className="text-left text-xs p-3 rounded-xl bg-slate-950/70 hover:bg-slate-800/90 border border-slate-800/80 hover:border-cyan-500/40 text-slate-300 hover:text-white transition-all shadow-sm group flex items-start justify-between gap-2"
                      >
                        <span className="line-clamp-2 leading-relaxed">{q}</span>
                        <Sparkles className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0 mt-0.5" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Message Bubbles */
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed shadow-md ${
                      msg.role === 'user'
                        ? 'bg-cyan-600 text-white font-normal rounded-br-none'
                        : msg.grounded === false
                        ? 'bg-slate-950/90 border border-amber-800/50 text-amber-200/90 rounded-bl-none'
                        : 'bg-slate-950/80 border border-slate-800/90 text-slate-200 rounded-bl-none'
                    }`}
                  >
                    {/* Assistant header icon */}
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-cyan-400">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>DocMind Assistant</span>
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{msg.content || '...'}</p>

                    {/* Grounded Citation Chips */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Sources ({msg.citations.length}):</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {msg.citations.map((cit, cIdx) => (
                            <a
                              key={cIdx}
                              href={cit.url}
                              target="_blank"
                              rel="noreferrer"
                              title={cit.section ? `${cit.title} > ${cit.section}` : cit.title}
                              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 transition-all shadow-sm group"
                            >
                              <span className="font-medium truncate max-w-[200px]">
                                {cit.title}
                              </span>
                              {cit.similarity_score !== undefined && (
                                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1 py-0.5 rounded">
                                  {Math.round(cit.similarity_score * 100)}%
                                </span>
                              )}
                              <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Latency and turn meta */}
                  {msg.latency_ms && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1 px-1 font-mono">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{Math.round(msg.latency_ms)}ms</span>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Live Loading Indicator */}
            {chatLoading && (
              <div className="flex items-center gap-2.5 text-xs text-slate-400 bg-slate-950/80 px-3.5 py-2.5 rounded-xl max-w-xs border border-slate-800 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>Searching documentation...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input & Toolbar */}
          <div className="mt-4 pt-4 border-t border-slate-800/80">
            <form onSubmit={handleSendChat} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything about the documentation..."
                disabled={chatLoading}
                className="w-full pl-4 pr-24 py-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-400 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/40 outline-none transition-all shadow-inner"
              />
              <div className="absolute right-2 top-2 flex items-center gap-1.5">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearChat}
                    title="Clear conversation history"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!query.trim() || chatLoading}
                  className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white font-medium text-xs transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
            <p className="text-[11px] text-slate-400 text-center mt-2.5">
              Answers are generated from live documentation and include direct source links.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
