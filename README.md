# 🧠 DocMind

> **Self-Healing Documentation-to-RAG Pipeline**  
> Built for the **Bright Data x WeMakeDevs "Scrape-Verse" Hackathon** (August 2026).

DocMind continuously scrapes documentation websites via **Bright Data Scraper Studio (Sitemap scraper)**, indexes the content into a vector database with citation metadata, and powers a grounded chat interface. When the target documentation site updates its layout or HTML structure and breaks the scraper, DocMind detects the breakage, triggers an automated **Bright Data Scraper Heal** cycle, and re-indexes the corrected data without requiring manual code changes in downstream layers.

---

## 🏗️ Architecture & Layer Separation

The project enforces strict separation of concerns across layers (per SRS §2.4 & NFR-06):

```
DocMind/
├── scraper/              # Bright Data Scraper Studio & CLI client, validation, run logger
├── pipeline/             # Chunking (token-based + overlap) & swappable embedding providers
│   └── embeddings/       # Provider abstraction (OpenAI, Cohere, Voyage, Ollama, Mock)
├── retrieval/            # Vector DB abstraction & stores (Chroma default, Pinecone alternative)
├── chat/                 # RAG query engine, grounding prompts, citations & swappable LLMs
│   └── llm/              # Provider abstraction (OpenAI, Anthropic, Groq, Ollama, Mock)
├── admin/                # Health monitor (FR-501), auto-heal triggers & scraper lifecycle
├── api/                  # FastAPI REST routes (/api/chat, /api/health, /api/admin/*)
├── frontend/             # React + Tailwind CSS client (Chat UI + Admin Panel)
├── core/                 # Config loader (Pydantic), domain entities (SRS §6.1), security
├── tests/                # Automated tests & test fixtures
├── .env.example          # Template for all environment variables (no secrets)
├── .gitignore            # Excludes secrets, virtualenvs, and vector DB data
└── requirements.txt      # Python dependencies
```

---

## ⚡ Bright Data CLI Setup & Authentication

DocMind interacts with Bright Data Scraper Studio using the official `bdata` CLI.

### 1. Authenticate with Bright Data

Run the login command in your terminal:

```bash
# Using npx (no global install needed):
npx -p @brightdata/cli bdata login

# Or if you install globally:
npm install -g @brightdata/cli
bdata login
```

Follow the browser prompt to log in and authorize your Bright Data account.

### 2. Basic Scraper CLI Commands

Once authenticated, DocMind invokes these commands via its `BrightDataClient` or you can run them manually:

- **Create a Sitemap Scraper:**
  ```bash
  bdata scraper create <TARGET_URL> "DocMind sitemap scraper for <TARGET_URL>"
  ```
- **Run a Scraper:**
  ```bash
  bdata scraper run <COLLECTOR_ID> <TARGET_URL>
  ```
- **Heal a Broken Scraper:**
  ```bash
  bdata scraper heal <COLLECTOR_ID> "Detected missing title or content tags"
  ```
- **Approve a Proposed Heal:**
  ```bash
  bdata scraper approve <COLLECTOR_ID>
  ```
- **Reject a Proposed Heal:**
  ```bash
  bdata scraper approve <COLLECTOR_ID> --reject
  ```

---

## 🚀 Quickstart & Local Development

### Prerequisites
- **Python 3.10+** (Python 3.12 recommended)
- **Node.js 18+** & **npm**
- **Bright Data Account** (for live scraping and healing)
- **OpenAI API Key** (or Cohere / Ollama / Anthropic / Groq)

---

### Step 1: Clone & Configure Environment

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env with your credentials:
# - BRIGHTDATA_API_KEY
# - EMBEDDING_API_KEY / OPENAI_API_KEY
# - LLM_API_KEY / OPENAI_API_KEY
# - TARGET_DOCS_URL
```

> ⚠️ **Security Notice:** Never commit `.env` or real API keys to version control. `.gitignore` is pre-configured to exclude all secret and local data files.

---

### Step 2: Backend Setup (Python)

```bash
# Create and activate virtual environment
python -m venv venv

# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Linux/macOS:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run backend API server
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be live at:
- **API Root:** [http://localhost:8000/](http://localhost:8000/)
- **Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Endpoint:** [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

### Step 3: Frontend Setup (React + Tailwind)

In a separate terminal window:

```bash
cd frontend
npm install
npm run dev
```

Frontend will be live at [http://localhost:5173](http://localhost:5173).

---

## 🔄 Swappable Provider Configuration (NFR-08)

All AI and database components are abstracted and swappable via `.env`:

| Component | Default Provider | OpenAI-Compatible Alternatives | Other Providers | Configuration Keys |
|---|---|---|---|---|
| **Vector DB** | `chroma` (local directory) | — | `pinecone`, `mock` | `VECTOR_DB_PROVIDER`, `CHROMA_PERSIST_DIR`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` |
| **Embedding** | `openai` (`text-embedding-3-small`) | **AI/ML API** (`https://api.aimlapi.com/v1`), LiteLLM Proxy, vLLM | `cohere`, `voyage`, `ollama`, `mock` | `EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL` |
| **LLM** | `openai` (`gpt-4o-mini`) | **AI/ML API** (`https://api.aimlapi.com/v1`), OpenRouter, Groq, Ollama | `anthropic`, `groq`, `ollama`, `mock` | `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TEMPERATURE` |

> 💡 **AI/ML API (aimlapi.com) Quick Setup:**  
> Set `EMBEDDING_BASE_URL=https://api.aimlapi.com/v1` and `LLM_BASE_URL=https://api.aimlapi.com/v1`, and put your AI/ML API key in `EMBEDDING_API_KEY` and `LLM_API_KEY`.


---

## 📋 Phase 1: Sitemap Scraping & Ingestion (FR-101 to FR-104)

Phase 1 provides end-to-end documentation ingestion driven by Bright Data Scraper Studio:

- **FR-101 (Scraper Creation):** Automatically generates a sitemap scraper via `bdata scraper create <URL> "<description>"` and persists the Collector ID.
- **FR-102 (Scraper Execution & Raw Storage):** Runs `bdata scraper run <COLLECTOR_ID> <URL> --json` and persists unmutated raw JSON payloads to `./data/raw_scrapes/latest.json` and `./data/raw_scrapes/<run_id>.json`.
- **FR-103 (Strict Page Validation):** Enforces non-empty title, valid URL, and minimum content length (≥ 20 chars). Rejections are logged and displayed in the Admin UI table rather than silently dropped.
- **FR-104 (Run Metadata Logging):** Records timestamp, collector ID, status, page count, and errors into `ScrapeRuns` in `./data/logs/scrape_runs.json`.
- **Admin UI (SRS §3.1):** Complete web interface for scraper configuration, creation, execution with live progress spinners, and a full table view of scraped documentation pages with search and validation filters.

---

## 🔍 Phase 1 Manual Smoke Test Instructions

Follow these steps to perform a live smoke test against `https://docs.litellm.ai`:

### Option A: Using the Admin Web UI (Recommended)
1. Start the backend: `uvicorn api.main:app --reload --port 8000`
2. Start the frontend: `cd frontend && npm run dev`
3. Navigate to [http://localhost:5173](http://localhost:5173) and switch to the **"Admin & Scraper"** tab.
4. Confirm Target URL is set to `https://docs.litellm.ai`.
5. Click **"Create Scraper (bdata scraper create)"** — wait for the Bright Data AI scraper creation to complete and populate the Collector ID.
6. Click **"Run Scraper & Ingest Pages (FR-102)"** — observe the live loading state.
7. Inspect the **"Scraped Documentation Pages"** table: view titles, source URLs, sections, and validation status badges (`Valid` / `Flagged`).

### Option B: Using the CLI Directly
```bash
# 1. Verify Bright Data CLI authentication
npx -y @brightdata/cli zones

# 2. Create Sitemap Scraper (FR-101)
npx -y @brightdata/cli scraper create https://docs.litellm.ai "DocMind sitemap scraper for LiteLLM" --json

# 3. Copy the returned collector_id (e.g. c_xxx) and run scraper (FR-102)
npx -y @brightdata/cli scraper run <COLLECTOR_ID> https://docs.litellm.ai --json -o ./data/raw_scrapes/manual_smoke.json

# 4. Trigger backend ingestion & validation via API:
curl -X POST http://localhost:8000/api/admin/scraper/run \
  -H "Content-Type: application/json" \
  -H "X-Admin-API-Key: docmind_dev_admin_key_12345" \
  -d "{\"url\": \"https://docs.litellm.ai\", \"collector_id\": \"<COLLECTOR_ID>\"}"
```

---

## 🧪 Running Automated Tests

Run unit, validation, and pipeline integration tests with `pytest`:

```bash
pytest -v
```

---

## 🤖 Phase 7: Automation & Scheduled CI/CD Scrape-Heal Cycles (FR-601 to FR-602)

> **GitHub Repository:** [https://github.com/codedbyasim/DocMind-AI](https://github.com/codedbyasim/DocMind-AI)

DocMind supports fully unattended, autonomous execution in CI/CD pipelines via GitHub Actions (per Hackathon Idea #5: *"Scrapers in CI, no humans"*).

### 1. GitHub Actions Workflow (`.github/workflows/scrape-heal-cycle.yml`)
- **Daily Cron Schedule:** Executes daily at `04:00 UTC` (`0 4 * * *`).
- **Manual Trigger (`workflow_dispatch`):** Run on-demand anytime from the Actions tab with custom target URL and collector overrides.
- **Unattended Self-Healing:** In CI mode, `DOCMIND_AUTO_APPROVE_HEALS=true` is enabled automatically to allow autonomous scraper self-repair, approval, and delta re-indexing without human button clicks.

### 2. Configured GitHub Repository Secrets
To enable the automated scheduled workflow on your repository fork, configure these Secrets under **Settings > Secrets and variables > Actions**:

| Secret Name | Description | Example / Default |
| :--- | :--- | :--- |
| `BRIGHTDATA_API_KEY` | Bright Data API token for CLI scraper execution & healing | `lum_big_...` |
| `EMBEDDING_API_KEY` | API Key for embedding model (AI/ML API or OpenAI) | `aiml_...` / `sk-...` |
| `LLM_API_KEY` | API Key for LLM model (AI/ML API or OpenAI) | `aiml_...` / `sk-...` |
| `TARGET_DOCS_URL` | Documentation site to scrape & monitor | `https://docs.litellm.ai` |
| `BRIGHTDATA_COLLECTOR_ID`| Scraper Collector ID generated on Bright Data | `c_msyg7ceoo6la3ofn6` |
| `SESSION_SECRET_KEY` | HMAC secret for session tokens (32+ chars) | `your_secret_32_bytes_key` |

### 3. Local CLI Execution
You can also run the unattended automation cycle locally anytime:

```bash
# Run real scrape -> validate -> auto-heal cycle against active collector:
python scripts/run_automation_cycle.py

# Run in mock/test double mode:
python scripts/run_automation_cycle.py --mock --url https://docs.litellm.ai

# Inspect generated report files:
cat data/logs/automation_report.json
cat data/logs/automation_summary.md
```

---

---

## 🛡️ Phase 8: Testing, Reliability & Production Readiness (NFR-01 to NFR-08)

### 1. Durability & Crash Safety (NFR-05)
- **Atomic File Writes:** JSON logs (`scrape_runs.json`, `heal_events.json`, `audit_log.json`) utilize atomic file swapping via `atomic_write_json` (`os.replace`) to prevent corrupted state on sudden process termination.
- **Persistent Vector Indexing:** Local ChromaDB data survives full server restarts without loss of chunks or source metadata.

### 2. Timeouts & Graceful Error Handling
- **Bounded Request Lifetimes:** Configurable timeouts protect against zombie processes: `EMBEDDING_TIMEOUT_SECONDS=30.0`, `LLM_TIMEOUT_SECONDS=45.0`, `SCRAPER_CLI_TIMEOUT_SECONDS=180`.
- **Empty Knowledge Base Fallback:** Queries on un-indexed installations return user-friendly guidance instead of 500 exceptions.

---

## ⚖️ Known Limitations & Production Considerations

| Component | Current Implementation | Production Recommendation |
| :--- | :--- | :--- |
| **Chat Latency** | ~6.5s – 10.8s (via remote AI/ML API non-streaming proxy) | Enable token streaming or deploy direct low-latency Tier-4 OpenAI/Ollama endpoints to reach <3s targets. |
| **Admin Session Storage** | Browser `localStorage` with HMAC-SHA256 session token | Upgrade to `httpOnly`, `Secure`, `SameSite=Strict` cookies for high-security enterprise environments. |
| **Vector DB Scaling** | ChromaDB local directory (ideal for 100–10,000 pages) | Set `VECTOR_DB_PROVIDER=pinecone` to scale to millions of chunks across distributed clusters. |



