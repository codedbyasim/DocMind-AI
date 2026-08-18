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
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-slate-900 tracking-tight font-sans">DocMind</span>
              <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                AI Docs
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block font-medium">
              Verified answers grounded in live documentation
            </p>
          </div>
        </div>

        {/* Target Site Indicator */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium hidden md:inline">Target Site:</span>
          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-blue-600 border border-slate-200 transition-colors font-mono text-xs font-medium shadow-2xs"
          >
            <span>{domain}</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>
      </div>
    </header>
  );
}
