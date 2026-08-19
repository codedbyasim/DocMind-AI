"""Universal Direct Documentation Crawler for arbitrary documentation sites."""

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("docmind.scraper.crawler")


class DirectDocsCrawler:
    """Universal web documentation crawler that extracts clean text, headings, and code blocks."""

    def __init__(self, max_pages: int = 25, timeout: float = 15.0):
        self.max_pages = max_pages
        self.timeout = timeout
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36 DocMind/1.0"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }

    async def crawl_site(self, root_url: str) -> List[Dict[str, Any]]:
        """Crawl a documentation website starting from root_url.

        Args:
            root_url: Entry documentation URL (e.g. 'https://docs.pydantic.dev')

        Returns:
            List of structured page dictionaries matching DocMind schema.
        """
        parsed_root = urlparse(root_url)
        base_domain = f"{parsed_root.scheme}://{parsed_root.netloc}"
        
        discovered_urls: List[str] = [root_url]
        seen_urls: Set[str] = {root_url.rstrip("/")}

        async with httpx.AsyncClient(
            headers=self.headers,
            timeout=self.timeout,
            follow_redirects=True,
            verify=False,
        ) as client:
            # 1. Try sitemap discovery
            sitemap_urls = await self._discover_sitemap_urls(client, base_domain, root_url)
            for s_url in sitemap_urls:
                norm = s_url.rstrip("/")
                if norm not in seen_urls and len(discovered_urls) < self.max_pages:
                    seen_urls.add(norm)
                    discovered_urls.append(s_url)

            # 2. If sitemap gave fewer than 5 pages, discover links from root page
            if len(discovered_urls) < 5:
                root_links = await self._extract_links_from_page(client, root_url, base_domain)
                for l_url in root_links:
                    norm = l_url.rstrip("/")
                    if norm not in seen_urls and len(discovered_urls) < self.max_pages:
                        seen_urls.add(norm)
                        discovered_urls.append(l_url)

            logger.info(
                "[Universal Crawler] Discovered %d documentation pages for %s",
                len(discovered_urls),
                root_url,
            )

            # 3. Fetch and parse pages in parallel (concurrency limit 5)
            semaphore = asyncio.Semaphore(5)

            async def _fetch_and_parse(url: str) -> Optional[Dict[str, Any]]:
                async with semaphore:
                    try:
                        res = await client.get(url)
                        if res.status_code != 200:
                            return None
                        return self._parse_html(url, res.text)
                    except Exception as e:
                        logger.warning("[Universal Crawler] Failed fetching %s: %s", url, e)
                        return None

            tasks = [_fetch_and_parse(u) for u in discovered_urls]
            results = await asyncio.gather(*tasks, return_exceptions=False)
            pages = [p for p in results if p is not None and len(p.get("content", "")) > 100]

            logger.info(
                "[Universal Crawler] Successfully extracted %d valid pages for %s",
                len(pages),
                root_url,
            )
            return pages

    async def _discover_sitemap_urls(
        self, client: httpx.AsyncClient, base_domain: str, root_url: str
    ) -> List[str]:
        """Attempt to fetch sitemap.xml to find all page URLs."""
        sitemap_candidates = [
            f"{base_domain}/sitemap.xml",
            f"{base_domain}/sitemap_index.xml",
            urljoin(root_url, "sitemap.xml"),
        ]
        doc_urls: List[str] = []

        for sm_url in sitemap_candidates:
            try:
                res = await client.get(sm_url)
                if res.status_code == 200 and ("<loc>" in res.text or "<url>" in res.text):
                    urls = re.findall(r"<loc>(https?://[^<]+)</loc>", res.text)
                    for u in urls:
                        # Only include relevant doc pages (skip images, tags, assets)
                        if any(ext in u.lower() for ext in [".png", ".jpg", ".svg", ".css", ".js", ".xml", ".json", ".zip"]):
                            continue
                        doc_urls.append(u)
                        if len(doc_urls) >= self.max_pages:
                            return doc_urls
                    if doc_urls:
                        return doc_urls
            except Exception:
                continue

        return doc_urls

    async def _extract_links_from_page(
        self, client: httpx.AsyncClient, page_url: str, base_domain: str
    ) -> List[str]:
        """Extract internal links from a documentation page."""
        links: List[str] = []
        try:
            res = await client.get(page_url)
            if res.status_code != 200:
                return []

            soup = BeautifulSoup(res.text, "html.parser")
            for a_tag in soup.find_all("a", href=True):
                href = a_tag["href"].strip()
                if not href or href.startswith("#") or href.startswith("javascript:") or href.startswith("mailto:"):
                    continue

                full_url = urljoin(page_url, href).split("#")[0].rstrip("/")
                parsed = urlparse(full_url)
                # Keep same domain and docs path
                if parsed.netloc == urlparse(base_domain).netloc:
                    if full_url not in links:
                        links.append(full_url)
                        if len(links) >= self.max_pages:
                            break
        except Exception:
            pass

        return links

    def _parse_html(self, url: str, html_content: str) -> Dict[str, Any]:
        """Parse HTML into clean text, section headings, and code snippets."""
        soup = BeautifulSoup(html_content, "html.parser")

        # Extract title
        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        h1 = soup.find("h1")
        if h1:
            h1_text = h1.get_text(strip=True)
            if h1_text:
                title = h1_text

        # Extract section headings
        headings: List[str] = []
        for h in soup.find_all(["h2", "h3", "h4"]):
            htext = h.get_text(strip=True)
            if htext and len(htext) > 2 and htext not in headings:
                headings.append(htext)

        # Extract code examples
        code_examples: List[str] = []
        for pre in soup.find_all("pre"):
            code = pre.get_text(strip=True)
            if code and len(code) > 15:
                code_examples.append(code[:400])

        # Remove scripts, styles, nav, and footers for clean content
        for element in soup(["script", "style", "nav", "footer", "header", "noscript", "svg"]):
            element.decompose()

        main_content = soup.find("main") or soup.find("article") or soup.find("body")
        clean_text = main_content.get_text(separator=" ", strip=True) if main_content else ""

        # Normalize whitespace
        clean_text = re.sub(r"\s+", " ", clean_text).strip()

        return {
            "url": url,
            "title": title or "Documentation Page",
            "content": clean_text,
            "section_headings": headings[:10],
            "code_examples": code_examples[:6],
        }
