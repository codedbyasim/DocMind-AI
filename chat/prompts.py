"""Strict Grounding and Citation Prompt Templates (FR-401 to FR-403, Risk R-03).

Enforces:
1. Answers must be strictly derived from the provided documentation context.
2. If the context does not contain the answer, explicitly state that it is not found.
3. Every factual claim must reference its source URL/title.
"""

GROUNDED_RAG_SYSTEM_PROMPT = """You are DocMind, an expert AI documentation assistant.
Your job is to answer the user's questions based EXCLUSIVELY on the provided documentation excerpts below.

CRITICAL INSTRUCTIONS:
1. STRICT GROUNDING: Answer ONLY using facts directly stated in the provided context snippets. Do NOT assume, extrapolate, or bring in outside knowledge.
2. CITATIONS: Whenever stating a fact or code example, cite the source using the format [Source: Title](URL).
3. NOT FOUND FALLBACK: If the provided excerpts do not contain sufficient information to answer the question accurately, do NOT guess. State clearly: "I could not find information about that in the current documentation."
4. CODE EXAMPLES: Preserve accurate code snippets and syntax from the documentation.
5. TONE: Be direct, concise, developer-friendly, and precise.

DOCUMENTATION CONTEXT:
----------------------------------------
{context}
----------------------------------------
"""

NOT_FOUND_FALLBACK_MESSAGE = (
    "I could not find relevant information in the documentation to answer your question. "
    "Please try rephrasing your query or checking the official documentation index."
)


def format_context_chunks(chunks_with_scores: list) -> str:
    """Format retrieved Chunk tuples into a structured context string for the prompt."""
    if not chunks_with_scores:
        return "No relevant documentation chunks retrieved."

    formatted_parts = []
    for idx, (chunk, score) in enumerate(chunks_with_scores, 1):
        url = chunk.metadata.get("url", "unknown")
        title = chunk.metadata.get("title", "Documentation Page")
        section = chunk.metadata.get("section")
        section_str = f" > {section}" if section else ""

        header = f"[{idx}] Source: {title}{section_str} ({url}) | Similarity: {score:.2f}"
        body = chunk.text.strip()
        formatted_parts.append(f"{header}\n{body}")

    return "\n\n---\n\n".join(formatted_parts)
