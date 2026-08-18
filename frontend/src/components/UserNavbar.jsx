import React from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';

export default function UserNavbar({ targetUrl = 'https://docs.litellm.ai' }) {
  const domain = (() => {
    try {
      return new URL(targetUrl).hostname;
    } catch {
      return targetUrl;
    }
  })();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-sky-500 flex items-center justify-center shadow-md shadow-cyan-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white tracking-tight">DocMind</span>
              <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                AI Docs
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Always-accurate answers grounded in live documentation
            </p>
          </div>
        </div>

        {/* Target Site Indicator */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 hidden md:inline">Active Documentation:</span>
          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-400 border border-slate-800 transition-colors font-mono text-xs shadow-sm"
          >
            <span>{domain}</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
        </div>
      </div>
    </header>
  );
}
