import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Sparkles,
  RotateCcw,
  ExternalLink,
  CheckCircle2,
  Clock,
  BookOpen,
  Copy,
  Check,
} from 'lucide-react';
import UserNavbar from '../components/UserNavbar';

// Dedicated Code Block component with Copy functionality
function CodeBlock({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeContent = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  if (inline) {
    return (
      <code
        className="px-1.5 py-0.5 mx-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-mono text-xs font-semibold"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="relative my-3.5 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-md">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-b border-slate-800/80 text-[11px] font-mono text-slate-400">
        <span className="font-semibold uppercase tracking-wider text-slate-300">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-sans"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto font-mono text-xs text-slate-100 leading-relaxed scrollbar-thin">
        <code>{codeContent}</code>
      </div>
    </div>
  );
}

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

  // Auto scroll to bottom
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
            // ignore partial frames
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
      console.warn('Session clear notice:', err);
    }
    setMessages([]);
    setSessionId('sess_' + Math.random().toString(36).substring(2, 9));
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans">
      {/* Clean Light Navbar */}
      <UserNavbar targetUrl={targetUrl} />

      {/* Main Chat Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col">
        {/* Messages Card */}
        <div className="flex-1 rounded-2xl bg-white border border-slate-200/90 p-5 sm:p-7 flex flex-col justify-between shadow-sm min-h-[580px]">
          {/* Scrollable Message Feed */}
          <div className="space-y-6 overflow-y-auto max-h-[64vh] pr-2 scrollbar-thin">
            {messages.length === 0 ? (
              /* Empty State */
              <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-4 text-blue-600 shadow-sm">
                  <BookOpen className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">
                  Search & Explore Documentation
                </h2>
                <p className="text-sm text-slate-500 max-w-md mb-8 leading-relaxed font-normal">
                  Ask any question regarding installation, APIs, code samples, or architecture. Answers are verified and strictly grounded in live documentation.
                </p>

                {/* Popular Questions */}
                <div className="w-full max-w-xl space-y-2.5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Popular Questions
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {starterQuestions.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendChat(null, q)}
                        className="text-left text-xs p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-900 transition-all shadow-2xs group flex items-start justify-between gap-2"
                      >
                        <span className="line-clamp-2 leading-relaxed font-medium">{q}</span>
                        <Sparkles className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0 mt-0.5" />
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
                    className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-br-none'
                        : msg.grounded === false
                        ? 'bg-amber-50/90 border border-amber-200 text-amber-950 rounded-bl-none'
                        : 'bg-white border border-slate-200 text-slate-900 rounded-bl-none'
                    }`}
                  >
                    {/* Assistant Header */}
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-2.5 text-xs font-bold text-blue-700">
                        <Sparkles className="w-4 h-4" />
                        <span>DocMind Assistant</span>
                      </div>
                    )}

                    {/* Markdown Rendered Content */}
                    <div className="markdown-body">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: CodeBlock,
                          h1: ({ children }) => <h1 className="text-base font-bold text-slate-900 mt-3 mb-1.5">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold text-slate-900 mt-2.5 mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-xs font-bold text-slate-800 mt-2 mb-1">{children}</h3>,
                          strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
                          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                        }}
                      >
                        {msg.content || '...'}
                      </ReactMarkdown>
                    </div>

                    {/* Citations block */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Verified Sources ({msg.citations.length}):</span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-0.5">
                          {msg.citations.map((cit, cIdx) => (
                            <a
                              key={cIdx}
                              href={cit.url}
                              target="_blank"
                              rel="noreferrer"
                              title={cit.section ? `${cit.title} > ${cit.section}` : cit.title}
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 transition-all shadow-2xs group"
                            >
                              <span className="font-medium truncate max-w-[210px]">
                                {cit.title}
                              </span>
                              {cit.similarity_score !== undefined && (
                                <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                  {Math.round(cit.similarity_score * 100)}%
                                </span>
                              )}
                              <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-600 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Latency badge */}
                  {msg.latency_ms && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1 px-1 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>{Math.round(msg.latency_ms)}ms</span>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Live Streaming Spinner */}
            {chatLoading && (
              <div className="flex items-center gap-2.5 text-xs text-slate-600 bg-slate-50 px-4 py-3 rounded-xl max-w-xs border border-slate-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                <span className="font-medium">Searching documentation & drafting answer...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input & Actions Bar */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <form onSubmit={handleSendChat} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything about the documentation..."
                disabled={chatLoading}
                className="w-full pl-5 pr-28 py-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-inner font-medium"
              />
              <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearChat}
                    title="Clear conversation history"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!query.trim() || chatLoading}
                  className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold text-xs transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
            <p className="text-[11px] text-slate-400 text-center mt-2.5 font-medium">
              Answers are generated from live documentation and include direct source links.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
