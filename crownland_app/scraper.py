"""
CrownClaw Scraper — extends OpenClaw to collect NL Crown Land
information from public government sources and cache it locally.
"""

import json
import re
import time
import os
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

CACHE_FILE = Path(__file__).parent / "crown_land_cache.json"
CACHE_TTL = 86_400  # 24 hours

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# NL government Crown Lands pages to scrape
NL_SOURCES = [
    "https://www.gov.nl.ca/crown-lands/",
    "https://www.gov.nl.ca/crown-lands/licences-leases-grants/",
    "https://www.gov.nl.ca/crown-lands/application-process/",
    "https://www.gov.nl.ca/crown-lands/fees/",
    "https://www.gov.nl.ca/crown-lands/contact/",
]

# Static knowledge base compiled from official NL Crown Lands policy
# (used as fallback if scraping fails or as supplement)
KNOWLEDGE_BASE = {
    "overview": {
        "title": "Crown Land in Newfoundland and Labrador",
        "description": (
            "Crown Land is land owned by the Province of Newfoundland and Labrador. "
            "The Crown Lands Administration Division manages applications, "
            "dispositions, and enforcement. About 95% of NL's land area is Crown Land."
        ),
        "website": "https://www.gov.nl.ca/crown-lands/",
        "phone": "1-877-829-4325",
        "email": "crownlands@gov.nl.ca",
    },
    "tenure_types": {
        "license_of_occupation": {
            "name": "Licence of Occupation",
            "description": (
                "Temporary right to occupy and use Crown Land. No transfer of ownership. "
                "Renewable annually or for a fixed term up to 20 years. "
                "Best for: recreational cabins, temporary structures, short-term use."
            ),
            "application_fee": 100,
            "annual_rent_rate": "5% of assessed land value",
            "typical_annual_rent": "$150–$2,000",
            "processing_time": "4–12 weeks",
            "survey_required": False,
            "best_for": ["recreational cabin", "temporary use", "seasonal structure"],
        },
        "lease": {
            "name": "Lease",
            "description": (
                "Long-term right to occupy Crown Land (25–50 years, renewable). "
                "Annual rent applies. Provides greater security than a licence. "
                "Best for: permanent cabins, small businesses, longer-term projects."
            ),
            "application_fee": 200,
            "annual_rent_rate": "6% of assessed land value",
            "typical_annual_rent": "$200–$5,000+",
            "processing_time": "3–6 months",
            "survey_required": "Required for parcels > 2 ha",
            "best_for": ["permanent cabin", "small business", "long-term project"],
        },
        "grant": {
            "name": "Grant (Fee Simple)",
            "description": (
                "Transfer of ownership of Crown Land to the applicant. "
                "Full purchase price (appraised value) must be paid. "
                "Best for: permanent commercial/residential development, farming."
            ),
            "application_fee": 500,
            "purchase_price": "Full appraised market value",
            "processing_time": "6–18 months",
            "survey_required": True,
            "best_for": ["commercial development", "residential", "farming", "permanent investment"],
        },
        "easement": {
            "name": "Easement",
            "description": (
                "Right to use a specific portion of Crown Land for a defined purpose "
                "(e.g., road access, utility lines, pipeline). Does not grant occupation rights."
            ),
            "application_fee": 150,
            "annual_fee": "Varies — $500–$5,000+",
            "processing_time": "6–12 weeks",
            "survey_required": False,
            "best_for": ["road access", "utility lines", "right of way"],
        },
    },
    "application_steps": {
        "general": [
            {
                "step": 1,
                "title": "Identify Your Need",
                "detail": (
                    "Decide what you want to use the land for and how long. "
                    "This determines which tenure type is best."
                ),
            },
            {
                "step": 2,
                "title": "Choose Tenure Type",
                "detail": (
                    "Licence (temporary/recreational), Lease (long-term), "
                    "Grant (ownership), or Easement (specific use right)."
                ),
            },
            {
                "step": 3,
                "title": "Locate the Parcel",
                "detail": (
                    "Use the map to find the land. Note the UTM coordinates or "
                    "legal description. Use GeoNL (https://geonl.gov.nl.ca) to verify "
                    "it is unoccupied Crown Land."
                ),
            },
            {
                "step": 4,
                "title": "Check Restrictions",
                "detail": (
                    "Ensure the land is not inside a park, reserve, existing disposition, "
                    "or restricted resource area. Crown Lands staff can help."
                ),
            },
            {
                "step": 5,
                "title": "Prepare Documents",
                "detail": (
                    "Government-issued ID, sketch/map of the parcel, "
                    "written description of intended use, completed Crown Lands application form."
                ),
            },
            {
                "step": 6,
                "title": "Submit Application",
                "detail": (
                    "Submit online at: https://crownlands.gov.nl.ca "
                    "or in person at your nearest regional office. Pay the application fee."
                ),
            },
            {
                "step": 7,
                "title": "Review & Inspection",
                "detail": (
                    "Crown Lands reviews the application, may inspect the site, "
                    "and consults other departments (Forestry, Wildlife, Environment, etc.)."
                ),
            },
            {
                "step": 8,
                "title": "Decision & Tenure",
                "detail": (
                    "If approved, execute the tenure document and pay outstanding fees. "
                    "For grants, arrange final survey and register at Registry of Deeds."
                ),
            },
        ]
    },
    "fees": {
        "application_fees": {
            "licence": "$100",
            "lease": "$200",
            "grant": "$500",
            "easement": "$150",
            "amendment": "$75",
            "assignment": "$150",
        },
        "annual_rent": {
            "description": "Annual rent for licences and leases is based on assessed land value.",
            "licence_rate": "5% of assessed value per year (minimum $150/year)",
            "lease_rate": "6% of assessed value per year (minimum $200/year)",
            "review_period": "Rent may be reviewed every 5 years.",
        },
        "other_costs": {
            "survey": "$2,000–$15,000+ (required for larger parcels/grants)",
            "appraisal": "$500–$2,000 (required for grants)",
            "registry": "$50–$200 (for grants at Registry of Deeds)",
        },
    },
    "restrictions": {
        "prohibited_areas": [
            "Provincial Parks and protected areas",
            "National Parks and National Park Reserves",
            "Wilderness and Ecological Reserves",
            "Areas with active forestry or mining licences (may conflict)",
            "Wetlands and sensitive habitats",
            "Municipal planning areas (must comply with municipal plan)",
            "Areas within 30m of navigable waterways (setback rules apply)",
        ],
        "special_rules": [
            "Waterfront lots: maximum 30m of water frontage typically allowed",
            "Cabin lots: maximum 0.4 ha for recreational cabin licences",
            "Commercial use: may require Environmental Assessment",
            "Agricultural land: special programs may apply",
        ],
    },
    "regional_offices": [
        {
            "name": "St. John's",
            "phone": "(709) 729-2300",
            "address": "50 Elizabeth Avenue, St. John's, NL  A1B 4J6",
            "region": "Avalon Peninsula and East Coast",
        },
        {
            "name": "Corner Brook",
            "phone": "(709) 637-2213",
            "address": "Corner Brook, NL",
            "region": "Western Newfoundland",
        },
        {
            "name": "Gander",
            "phone": "(709) 256-1460",
            "address": "Gander, NL",
            "region": "Central Newfoundland",
        },
        {
            "name": "Grand Falls-Windsor",
            "phone": "(709) 292-4000",
            "address": "Grand Falls-Windsor, NL",
            "region": "Central Interior",
        },
        {
            "name": "Happy Valley-Goose Bay",
            "phone": "(709) 896-2029",
            "address": "Happy Valley-Goose Bay, NL",
            "region": "Labrador",
        },
    ],
    "online_resources": {
        "crown_lands_portal": "https://www.gov.nl.ca/crown-lands/",
        "online_application": "https://crownlands.gov.nl.ca",
        "geonl_map_viewer": "https://geonl.gov.nl.ca",
        "land_use_atlas": "https://www.gov.nl.ca/dgsnl/geonl/",
        "application_form": "https://www.gov.nl.ca/crown-lands/application-process/",
    },
}


class CrownLandScraper:
    """
    Scrapes the NL Crown Lands government website to keep the
    knowledge base fresh and supplement the static data.
    """

    def __init__(self):
        self.client = httpx.Client(headers=HEADERS, timeout=15, follow_redirects=True)

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    def _load_cache(self) -> dict | None:
        if not CACHE_FILE.exists():
            return None
        try:
            data = json.loads(CACHE_FILE.read_text())
            if time.time() - data.get("_cached_at", 0) < CACHE_TTL:
                return data
        except (json.JSONDecodeError, KeyError):
            pass
        return None

    def _save_cache(self, data: dict) -> None:
        data["_cached_at"] = time.time()
        CACHE_FILE.write_text(json.dumps(data, indent=2))

    # ------------------------------------------------------------------
    # Scraping
    # ------------------------------------------------------------------

    def _scrape_page(self, url: str) -> str:
        """Return cleaned text from a page, or empty string on failure."""
        try:
            r = self.client.get(url)
            if r.status_code != 200:
                return ""
            soup = BeautifulSoup(r.text, "html.parser")
            # Remove nav, footer, scripts
            for tag in soup(["nav", "footer", "script", "style", "header"]):
                tag.decompose()
            text = soup.get_text(separator=" ", strip=True)
            # Collapse whitespace
            return re.sub(r"\s{2,}", " ", text)
        except Exception:
            return ""

    def scrape_all(self) -> dict:
        """Scrape all NL Crown Lands sources and merge with knowledge base."""
        cached = self._load_cache()
        if cached:
            return cached

        scraped_content: dict[str, str] = {}
        for url in NL_SOURCES:
            text = self._scrape_page(url)
            if text:
                scraped_content[url] = text[:4000]  # Cap per page

        result = {
            **KNOWLEDGE_BASE,
            "scraped_pages": scraped_content,
            "scraped_urls": list(scraped_content.keys()),
        }
        self._save_cache(result)
        return result

    def get_knowledge_base(self) -> dict:
        """Return knowledge base (from cache or static)."""
        cached = self._load_cache()
        if cached:
            return cached
        return KNOWLEDGE_BASE


# Module-level singleton for use by the AI module
_scraper: CrownLandScraper | None = None


def get_scraper() -> CrownLandScraper:
    global _scraper
    if _scraper is None:
        _scraper = CrownLandScraper()
    return _scraper


def get_knowledge_base() -> dict:
    return get_scraper().get_knowledge_base()
