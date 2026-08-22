# Environment Setup & Installation Guide

This guide walks through configuring, installing, and running DocMind locally or via Docker.

---

## 1. Prerequisites

- **Python**: 3.11 or 3.12
- **Node.js**: 18.x or 20.x
- **Package Managers**: `pip` and `npm`
- **Docker & Docker Compose** (Optional for containerized setup)

---

## 2. Environment Configuration (`.env`)

Copy the template file to `.env`:

```bash
cp .env.example .env
```

### Configuration Reference Table

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | string | `development` | Environment mode (`development` or `production`) |
| `HOST` | string | `0.0.0.0` | API bind address |
| `PORT` | integer | `8000` | Backend API port |
| `BRIGHTDATA_API_KEY` | string | *Required* | API token from Bright Data Dashboard |
| `BRIGHTDATA_COLLECTOR_ID` | string | `c_msyg7ceoo6la3ofn6` | Active documentation scraper collector ID |
| `TARGET_DOCS_URL` | string | `https://docs.litellm.ai` | Target documentation website |
| `EMBEDDING_PROVIDER` | string | `openai` | Embedding provider (`openai`, `cohere`, `voyage`, `ollama`) |
| `EMBEDDING_API_KEY` | string | *Required* | OpenAI or compatible provider API key |
| `EMBEDDING_BASE_URL` | string | `https://api.aimlapi.com/v1` | Optional OpenAI-compatible base URL |
| `EMBEDDING_MODEL` | string | `text-embedding-3-small` | Embedding model identifier |
| `EMBEDDING_DIMENSION` | integer | `1536` | Dimensionality of embeddings |
| `LLM_PROVIDER` | string | `openai` | LLM generator provider (`openai`, `anthropic`, `groq`, `ollama`) |
| `LLM_API_KEY` | string | *Required* | LLM API key |
| `LLM_BASE_URL` | string | `https://api.aimlapi.com/v1` | Optional OpenAI-compatible base URL |
| `LLM_MODEL` | string | `gpt-4o-mini` | Generation model name |
| `VECTOR_DB_PROVIDER` | string | `chroma` | Vector store (`chroma` or `pinecone`) |
| `CHROMA_PERSIST_DIR` | string | `./data/chroma` | ChromaDB disk persistence path |
| `CHROMA_COLLECTION_NAME`| string | `docmind_knowledge_base`| Collection identifier |
| `CONFIDENCE_THRESHOLD` | float | `0.50` | Minimum cosine similarity for grounding |
| `ADMIN_USERNAME` | string | `admin` | Admin dashboard login username |
| `ADMIN_PASSWORD` | string | *Required* | Admin dashboard password |
| `SESSION_SECRET_KEY` | string | *Required* | 32-byte secret for signed session tokens |

---

## 3. Local Development Setup

### Step 1: Backend Setup

```bash
# Clone the repository
git clone https://github.com/codedbyasim/DocMind-AI.git
cd DocMind

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the backend API server with reload
uvicorn api.main:app --reload --port 8000
```

The API docs will be available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Step 2: Frontend Setup

Open a separate terminal window:

```bash
cd frontend
npm install
npm run dev
```

The DocMind UI will be accessible at [http://localhost:5173](http://localhost:5173).

---

## 4. Running Tests

Run the full 53-test integration suite:

```bash
pytest tests/ -v
```
