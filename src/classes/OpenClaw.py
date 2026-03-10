import re
import csv
import requests
import os

from cache import *
from status import *
from config import *


class OpenClaw:
    """
    OpenClaw: Open-web crawler for finding business leads.

    Searches the web using DuckDuckGo's HTML interface, visits matching pages,
    extracts contact emails, and saves results to a CSV file for outreach.
    """

    DDGO_URL = "https://html.duckduckgo.com/html/"
    EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,7}\b")
    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }

    def __init__(self, query: str, max_results: int = 20) -> None:
        """
        Initialise OpenClaw.

        Args:
            query (str): The search keyword / niche to look for.
            max_results (int): Maximum number of pages to visit.
        """
        self.query = query
        self.max_results = max_results
        self.leads: list[dict] = []

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _search_urls(self) -> list[str]:
        """
        Return up to `max_results` URLs from a DuckDuckGo HTML search.

        Returns:
            list[str]: Discovered URLs.
        """
        info(f" => Searching DuckDuckGo for: {self.query}")
        try:
            resp = requests.post(
                self.DDGO_URL,
                data={"q": self.query, "b": "", "kl": ""},
                headers=self.HEADERS,
                timeout=15,
            )
            resp.raise_for_status()
        except Exception as exc:
            error(f" => Search request failed: {exc}")
            return []

        # Extract result links – DuckDuckGo wraps them in <a class="result__url">
        urls = re.findall(r'result__url[^>]*href="([^"]+)"', resp.text)
        if not urls:
            # Fallback: grab any http(s) href that looks like a real site
            urls = re.findall(r'href="(https?://[^"]+)"', resp.text)

        # Deduplicate while preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for u in urls:
            if u not in seen:
                seen.add(u)
                unique.append(u)

        return unique[: self.max_results]

    def _extract_emails(self, url: str) -> list[str]:
        """
        Visit `url` and extract any e-mail addresses found in the page body.

        Args:
            url (str): URL to visit.

        Returns:
            list[str]: Unique email addresses found on the page.
        """
        try:
            resp = requests.get(url, headers=self.HEADERS, timeout=10)
            if resp.status_code != 200:
                return []
            emails = list(set(self.EMAIL_RE.findall(resp.text)))
            # Filter out common false-positives (image filenames, etc.)
            emails = [e for e in emails if "." in e.split("@")[-1] and len(e) < 80]
            return emails
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def crawl(self) -> None:
        """
        Run the full crawl: search → visit → extract → store leads.

        Results are accumulated in `self.leads`.
        """
        urls = self._search_urls()
        if not urls:
            warning(" => No URLs found. Try a different query.")
            return

        info(f" => Found {len(urls)} URL(s). Crawling for contact info...")

        for url in urls:
            emails = self._extract_emails(url)
            if emails:
                for email in emails:
                    self.leads.append({"url": url, "email": email})
                success(f" => {url} → {', '.join(emails)}")
            else:
                info(f" => {url} → no email found", False)

        success(f" => Crawl complete. {len(self.leads)} lead(s) collected.")

    def save_leads(self, output_path: str) -> None:
        """
        Write collected leads to a CSV file.

        Args:
            output_path (str): Destination file path for the CSV.
        """
        if not self.leads:
            warning(" => No leads to save.")
            return

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["url", "email"])
            writer.writeheader()
            writer.writerows(self.leads)

        success(f" => Leads saved to {output_path}")

    def start(self, output_path: str) -> None:
        """
        Convenience method: crawl then save.

        Args:
            output_path (str): Destination file path for the CSV.
        """
        self.crawl()
        self.save_leads(output_path)
