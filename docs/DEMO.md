# DocMind Live Demo & Presentation Script

This script provides a step-by-step walkthrough for live presentations, judging demonstrations, and technical showcases.

---

## Presentation Outline (5-Minute Walkthrough)

### 1. Introduction & Public Chat Assistant (1 Min)
- **Goal**: Showcase fast, token-streamed RAG with strict grounding and clickable citations.
- **Action**: Open [http://localhost:5173](http://localhost:5173).
- **Prompt**: Click suggested prompt *"How do I run LiteLLM with Docker?"*
- **Highlight**:
  - Response streams in real-time.
  - Source links and citation pills appear above the response.
  - Direct provenance linking back to official documentation.

---

### 2. Hallucination Defense & Out-of-Domain Guardrail (1 Min)
- **Goal**: Demonstrate zero-hallucination guarantee when queries fall outside the documentation scope.
- **Action**: Enter out-of-domain query: *"What is quantum gravity string theory?"*
- **Highlight**:
  - Yellow **Out of Domain** badge appears.
  - Returns safe deterministic message without making up false facts.

---

### 3. Admin Studio & Scraper Configuration (1 Min)
- **Goal**: Show web crawler controls, sitemap scraping, and data validation.
- **Action**:
  - Click **Admin Studio** $\to$ Sign in with `admin` / password.
  - Navigate to **Scraper Studio** tab.
  - Show active Collector ID (`c_msyg7ceoo6la3ofn6`) and target URL.
  - Click **"Indexed Pages"** tab to view structured table of 13+ pages, section headings, and code snippets.

---

### 4. Autonomous Self-Healing Simulation (2 Min)
- **Goal**: Demonstrate autonomous crawler breakage detection, AI repair proposal, approval gate, and recovery.
- **Action**:
  - Go to **Overview** tab $\to$ Click **"⚡ Simulate Site Breakage (Demo Mode)"**.
  - Notice status immediately switches from `🟢 Healthy` to `🟡 Degraded System`.
  - Switch to **Self-Healing** tab:
    - View anomaly alert: *"Page count dropped by 80.0% (from 13 to 1 pages)"*.
    - View AI-generated CSS selector repair proposal.
    - Click **"Approve & Re-Index"**.
  - System automatically triggers delta re-indexing, updates ChromaDB embeddings, and restores status to **🟢 Healthy System**.

---

## Key Talking Points for Judges

1. **Self-Healing Loop**: Web scrapers break frequently when websites redesign. DocMind autonomously detects breakages, calls AI self-healing APIs, and re-indexes without human engineering time.
2. **Strict Provenance**: Answers are strictly grounded in vector embeddings with exact source URL citations.
3. **Swappable Architecture**: Every layer (Embeddings, Vector Store, LLM, Scraper) is interface-based and swappable via `.env`.
