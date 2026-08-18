"""Text chunking module per FR-201 and FR-203.

Splits scraped documentation pages into ~500 token segments with configurable overlap,
attaching source metadata (url, title, section, page_id, chunk_order) to every chunk.
"""

import logging
import re
from typing import List, Optional
from core.config import settings
from core.models import Chunk, Page

logger = logging.getLogger("docmind.pipeline.chunker")


class DocumentChunker:
    """Chunks Page objects into citation-ready Chunk models."""

    def __init__(
        self,
        chunk_size_tokens: Optional[int] = None,
        chunk_overlap_tokens: Optional[int] = None,
    ):
        self.chunk_size = chunk_size_tokens or settings.chunk_size_tokens
        self.chunk_overlap = chunk_overlap_tokens or settings.chunk_overlap_tokens
        self._tokenizer = None

        try:
            import tiktoken
            self._tokenizer = tiktoken.get_encoding("cl100k_base")
        except Exception:
            logger.debug("tiktoken not available; falling back to approximate word-based token counting")

    def count_tokens(self, text: str) -> int:
        """Estimate token count for a text string."""
        if not text:
            return 0
        if self._tokenizer:
            try:
                return len(self._tokenizer.encode(text))
            except Exception:
                pass
        # Fallback approximation: 1 token ~= 4 chars or 0.75 words
        return max(1, int(len(text) / 4))

    def _split_into_token_safe_segments(self, text: str) -> List[str]:
        """Split text by paragraphs/headers, then sub-split long blocks into token-safe slices."""
        paragraphs = re.split(r"\n\s*\n|(?<=\n)(?=#+\s)", text)
        segments: List[str] = []
        for p in paragraphs:
            p = p.strip()
            if not p:
                continue
            
            p_tokens = self.count_tokens(p)
            if p_tokens <= self.chunk_size:
                segments.append(p)
            else:
                # Sub-split by sentences
                sentences = re.split(r"(?<=[.!?])\s+", p)
                for s in sentences:
                    s = s.strip()
                    if not s:
                        continue
                    s_tokens = self.count_tokens(s)
                    if s_tokens <= self.chunk_size:
                        segments.append(s)
                    else:
                        # Direct token slicing for oversized sentences/code blocks
                        if self._tokenizer:
                            toks = self._tokenizer.encode(s)
                            step = self.chunk_size - self.chunk_overlap
                            for i in range(0, len(toks), step):
                                slice_toks = toks[i : i + self.chunk_size]
                                segments.append(self._tokenizer.decode(slice_toks))
                        else:
                            # Char slicing fallback
                            char_step = (self.chunk_size - self.chunk_overlap) * 4
                            for i in range(0, len(s), char_step):
                                segments.append(s[i : i + self.chunk_size * 4])
        return segments

    def chunk_page(self, page: Page) -> List[Chunk]:
        """Split a single Page into ordered, metadata-tagged Chunk objects per FR-201 and FR-203.

        Args:
            page: Validated Page instance

        Returns:
            List of Chunk instances with attached metadata
        """
        raw_text = page.content.strip()
        if not raw_text:
            return []

        segments = self._split_into_token_safe_segments(raw_text)
        if not segments:
            segments = [raw_text]

        chunks: List[Chunk] = []
        current_chunk_texts: List[str] = []
        current_tokens = 0
        order_index = 0

        for segment in segments:
            seg_tokens = self.count_tokens(segment)

            if current_tokens + seg_tokens > self.chunk_size and current_chunk_texts:
                # Finalize current chunk
                combined_text = "\n\n".join(current_chunk_texts)
                chunk_tokens = self.count_tokens(combined_text)
                chunk_obj = Chunk(
                    page_id=page.id,
                    text=combined_text,
                    token_count=chunk_tokens,
                    chunk_order=order_index,
                    metadata={
                        "page_id": page.id,
                        "url": page.url,
                        "title": page.title,
                        "section": page.section,
                        "chunk_order": order_index,
                        "token_count": chunk_tokens,
                        "scrape_run_id": page.scrape_run_id,
                    },
                )
                chunks.append(chunk_obj)
                order_index += 1

                # Carry over overlap if possible
                overlap_texts: List[str] = []
                overlap_toks = 0
                for text_block in reversed(current_chunk_texts):
                    t_count = self.count_tokens(text_block)
                    if overlap_toks + t_count <= self.chunk_overlap:
                        overlap_texts.insert(0, text_block)
                        overlap_toks += t_count
                    else:
                        break

                current_chunk_texts = overlap_texts + [segment]
                current_tokens = overlap_toks + seg_tokens
            else:
                current_chunk_texts.append(segment)
                current_tokens += seg_tokens

        # Append remaining chunk
        if current_chunk_texts:
            combined_text = "\n\n".join(current_chunk_texts)
            chunk_tokens = self.count_tokens(combined_text)
            chunk_obj = Chunk(
                page_id=page.id,
                text=combined_text,
                token_count=chunk_tokens,
                chunk_order=order_index,
                metadata={
                    "page_id": page.id,
                    "url": page.url,
                    "title": page.title,
                    "section": page.section,
                    "chunk_order": order_index,
                    "token_count": chunk_tokens,
                    "scrape_run_id": page.scrape_run_id,
                },
            )
            chunks.append(chunk_obj)

        logger.debug(
            "Chunked page '%s' (%s) into %d chunks",
            page.title,
            page.url,
            len(chunks),
        )
        return chunks

    def chunk_pages(self, pages: List[Page]) -> List[Chunk]:
        """Chunk a collection of Page objects."""
        all_chunks: List[Chunk] = []
        for page in pages:
            all_chunks.extend(self.chunk_page(page))
        return all_chunks

