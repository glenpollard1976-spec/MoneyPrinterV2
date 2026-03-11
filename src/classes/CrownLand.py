"""
Crown Land Wizard — Newfoundland and Labrador
Guides users through browsing, selecting, and starting an application
for crown land using the NL Land Use Atlas ArcGIS REST API.

Data source:
  https://www.gov.nl.ca/landuseatlasmaps/rest/services/LandUseDetails/MapServer/3
Application info:
  https://www.gov.nl.ca/crownlands/apply-for-crown-lands/
Contact:
  Phone : 1-833-891-3249
  Email : crownlandsinfo@gov.nl.ca
"""
import os
import json
import requests
from datetime import datetime

from status import *
from prettytable import PrettyTable
from termcolor import colored


CROWN_LAND_API = (
    "https://www.gov.nl.ca/landuseatlasmaps/rest/services/"
    "LandUseDetails/MapServer/3/query"
    "?f=json"
    "&where=1%3D1"
    "&outFields=TITLENO,TITLETYPE,TITLESTATUS,APPLICANT,AREA_HA,DISTRICT,PURPOSE,OBJECTID"
    "&returnGeometry=false"
    "&resultRecordCount=100"
)

APPLICATION_PORTAL = "https://www.gov.nl.ca/crownlands/apply-for-crown-lands/"
CONTACT_PHONE     = "1-833-891-3249"
CONTACT_EMAIL     = "crownlandsinfo@gov.nl.ca"

TENURE_TYPES = {
    "1": {
        "name": "Grant (Full Ownership)",
        "desc": (
            "Ownership of the land transfers to you once you develop the lot "
            "and pay the full purchase price. Best if you want to own the land outright."
        ),
        "survey_required": True,
    },
    "2": {
        "name": "Lease",
        "desc": (
            "You rent the land from the Crown for a set period. "
            "Ownership stays with the government. Good for businesses or longer-term projects."
        ),
        "survey_required": True,
    },
    "3": {
        "name": "Licence to Occupy (LTO)",
        "desc": (
            "A lighter permit — no land survey required. "
            "Suitable for temporary or small-scale use (e.g. a cabin, dock, or garden)."
        ),
        "survey_required": False,
    },
}


def _divider(char: str = "=", width: int = 60) -> None:
    info(char * width, False)


def _header(title: str) -> None:
    _divider()
    info(f"  {title}", False)
    _divider()


class CrownLand:
    """
    Step-by-step wizard that helps users browse Newfoundland crown land
    parcels and walks them through starting a purchase/application.
    """

    # ------------------------------------------------------------------
    # Data fetching
    # ------------------------------------------------------------------

    def fetch_available(self) -> list:
        """Fetch crown land titles from the NL government ArcGIS REST API."""
        try:
            info(" => Fetching crown land data from gov.nl.ca ...")
            resp = requests.get(CROWN_LAND_API, timeout=15)
            resp.raise_for_status()
            features = resp.json().get("features", [])
            success(f" => Retrieved {len(features)} record(s).")
            return features
        except requests.exceptions.Timeout:
            error("Connection timed out. Check your internet and try again.")
        except requests.exceptions.ConnectionError:
            error("Could not reach gov.nl.ca. Check your internet connection.")
        except Exception as exc:
            error(f"Unexpected error: {exc}")
        return []

    # ------------------------------------------------------------------
    # Display helpers
    # ------------------------------------------------------------------

    def _show_parcels_table(self, parcels: list) -> None:
        table = PrettyTable()
        table.field_names = ["#", "Title No.", "Type", "Status", "Area (ha)", "District", "Purpose"]
        table.max_width = 20
        table.align = "l"

        for idx, p in enumerate(parcels, start=1):
            a = p["attributes"]
            table.add_row([
                colored(str(idx), "cyan"),
                colored(str(a.get("TITLENO", "N/A")), "yellow"),
                colored(str(a.get("TITLETYPE", "N/A")), "white"),
                colored(str(a.get("TITLESTATUS", "N/A")), "green"),
                colored(str(a.get("AREA_HA", "N/A")), "white"),
                colored(str(a.get("DISTRICT", "N/A")), "blue"),
                colored(str(a.get("PURPOSE", "N/A")), "white"),
            ])

        print(table)

    def _show_parcel_detail(self, parcel: dict) -> None:
        a = parcel["attributes"]
        _header("PARCEL DETAILS")
        fields = [
            ("Title Number",   "TITLENO"),
            ("Title Type",     "TITLETYPE"),
            ("Status",         "TITLESTATUS"),
            ("Current Owner",  "APPLICANT"),
            ("Area (ha)",      "AREA_HA"),
            ("District",       "DISTRICT"),
            ("Purpose",        "PURPOSE"),
        ]
        for label, key in fields:
            val = a.get(key, "N/A")
            print(f"  {colored(label + ':', 'cyan'):<28} {colored(str(val), 'white')}")
        print()

    # ------------------------------------------------------------------
    # Wizard steps
    # ------------------------------------------------------------------

    def _step_browse(self, parcels: list) -> list:
        """Step 1 — optionally filter by district, then show table."""
        _header("STEP 1 OF 5 — Browse Available Crown Land")

        # Collect unique districts for easy filtering
        districts = sorted({
            p["attributes"].get("DISTRICT", "")
            for p in parcels
            if p["attributes"].get("DISTRICT")
        })

        if districts:
            print(colored("\n  Available districts:", "cyan"))
            for i, d in enumerate(districts, 1):
                print(f"    {colored(str(i), 'yellow')}. {d}")
            print(f"    {colored('0', 'yellow')}. Show all districts\n")

            raw = question("  Filter by district number (or 0 for all): ").strip()
            if raw.isdigit() and 1 <= int(raw) <= len(districts):
                chosen_district = districts[int(raw) - 1]
                parcels = [
                    p for p in parcels
                    if p["attributes"].get("DISTRICT") == chosen_district
                ]
                success(f" => Showing {len(parcels)} parcel(s) in {chosen_district}.")

        print()
        self._show_parcels_table(parcels)
        return parcels

    def _step_select(self, parcels: list) -> dict:
        """Step 2 — user picks a parcel by number."""
        _header("STEP 2 OF 5 — Select a Parcel")

        while True:
            raw = question("  Enter the # of the parcel you want: ").strip()
            if raw.isdigit() and 1 <= int(raw) <= len(parcels):
                chosen = parcels[int(raw) - 1]
                self._show_parcel_detail(chosen)
                confirm = question("  Is this the parcel you want? (yes/no): ").strip().lower()
                if confirm in ("yes", "y"):
                    return chosen
                info(" => No problem — pick again.")
            else:
                warning(f"  Please enter a number between 1 and {len(parcels)}.")

    def _step_tenure(self) -> dict:
        """Step 3 — choose tenure type."""
        _header("STEP 3 OF 5 — Choose How You Want to Hold the Land")

        print(colored("  There are 3 ways to hold crown land:\n", "cyan"))
        for key, t in TENURE_TYPES.items():
            print(f"  {colored(key + '.', 'yellow')} {colored(t['name'], 'white')}")
            print(f"     {t['desc']}\n")

        while True:
            raw = question("  Enter 1, 2 or 3: ").strip()
            if raw in TENURE_TYPES:
                chosen = TENURE_TYPES[raw]
                success(f" => Selected: {chosen['name']}")
                return chosen
            warning("  Please enter 1, 2, or 3.")

    def _step_applicant(self) -> dict:
        """Step 4 — collect applicant details."""
        _header("STEP 4 OF 5 — Your Details")
        info("  We'll use these to prepare your application summary.\n", False)

        name    = question("  Your full name: ").strip()
        email   = question("  Your email address: ").strip()
        phone   = question("  Your phone number: ").strip()
        address = question("  Your mailing address: ").strip()
        purpose = question("  What do you plan to use the land for? (e.g. cabin, farming): ").strip()

        return {
            "name": name,
            "email": email,
            "phone": phone,
            "address": address,
            "intended_purpose": purpose,
        }

    def _step_summary(self, parcel: dict, tenure: dict, applicant: dict) -> None:
        """Step 5 — print a checklist and save a summary file."""
        attrs = parcel["attributes"]
        _header("STEP 5 OF 5 — Your Application Checklist")

        print(colored("\n  WHAT YOU WANT TO APPLY FOR", "cyan"))
        print(f"    Parcel  : {attrs.get('TITLENO', 'N/A')} — {attrs.get('DISTRICT', 'N/A')}")
        print(f"    Area    : {attrs.get('AREA_HA', 'N/A')} ha")
        print(f"    Tenure  : {tenure['name']}")
        print(f"    Purpose : {applicant['intended_purpose']}\n")

        print(colored("  WHAT YOU NEED TO DO NEXT (tick each off):", "cyan"))
        steps = [
            "Visit the NL Crown Lands portal and create an account:\n"
            f"       {colored(APPLICATION_PORTAL, 'blue')}",
            "Fill in the application form with your details above.",
            "Attach a map of the parcel with GPS coordinates, dimensions,\n"
            "       and nearby landmarks (roads, waterbodies, buildings).",
        ]
        if tenure["survey_required"]:
            steps.append(
                "Budget for a land survey — you must hire a surveyor registered\n"
                "       with the Association of Newfoundland Land Surveyors within\n"
                "       12 months of approval."
            )
        else:
            steps.append(
                "No land survey is needed for a Licence to Occupy — but keep\n"
                "       your GPS coordinates handy."
            )
        steps += [
            "If transferring a lease/LTO, pay the $200 assignment fee to the\n"
            "       Central Cashiers Office: (709) 729-3042.",
            "Wait for the referral process — other departments will review\n"
            "       your application before a decision is made.",
            "If approved, arrange your land survey (if required) and pay\n"
            "       the purchase/lease price quoted by Crown Lands.",
        ]

        for i, step in enumerate(steps, 1):
            print(f"\n  {colored(str(i) + '.', 'yellow')} {step}")

        print(colored("\n  NEED HELP? CONTACT CROWN LANDS DIRECTLY:", "cyan"))
        print(f"    Phone : {colored(CONTACT_PHONE, 'yellow')}")
        print(f"    Email : {colored(CONTACT_EMAIL, 'yellow')}")
        print(f"    Web   : {colored(APPLICATION_PORTAL, 'blue')}\n")

        # Save summary to file
        self._save_summary(attrs, tenure, applicant)

    def _save_summary(self, attrs: dict, tenure: dict, applicant: dict) -> None:
        """Save the application summary as a JSON file in the project root."""
        try:
            root = os.path.join(os.path.dirname(__file__), "..", "..", ".mp")
            if not os.path.exists(root):
                root = os.path.expanduser("~")

            filename = f"crown_land_application_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            filepath = os.path.join(root, filename)

            summary = {
                "generated": datetime.now().isoformat(),
                "parcel": {k: v for k, v in attrs.items()},
                "tenure_type": tenure["name"],
                "survey_required": tenure["survey_required"],
                "applicant": applicant,
                "next_steps": {
                    "portal": APPLICATION_PORTAL,
                    "phone": CONTACT_PHONE,
                    "email": CONTACT_EMAIL,
                },
            }

            with open(filepath, "w") as f:
                json.dump(summary, f, indent=2)

            success(f" => Application summary saved to: {filepath}")
        except Exception as exc:
            warning(f" Could not save summary file: {exc}")

    # ------------------------------------------------------------------
    # Main entry points
    # ------------------------------------------------------------------

    def show(self) -> None:
        """Display all available crown land parcels (quick view, no wizard)."""
        parcels = self.fetch_available()
        if not parcels:
            warning("No crown land records found or failed to fetch data.")
            return
        self._show_parcels_table(parcels)
        success(f" => {len(parcels)} Newfoundland crown land parcel(s) listed.")

    def buy_wizard(self) -> None:
        """
        Full guided wizard: browse → select → choose tenure →
        collect your details → generate application checklist.
        """
        _header("NEWFOUNDLAND CROWN LAND — PICK & APPLY WIZARD")
        info("  This wizard will help you find a parcel and prepare your application.", False)
        info("  Note: the final application is submitted through the NL government portal.", False)
        print()

        parcels = self.fetch_available()
        if not parcels:
            error("Could not load crown land data. Check your connection and try again.")
            return

        # Step 1 — browse / filter
        parcels = self._step_browse(parcels)
        if not parcels:
            warning("No parcels matched that filter. Try again with a different district.")
            return

        # Step 2 — pick a parcel
        chosen_parcel  = self._step_select(parcels)

        # Step 3 — tenure type
        chosen_tenure  = self._step_tenure()

        # Step 4 — applicant info
        applicant_info = self._step_applicant()

        # Step 5 — summary + checklist
        self._step_summary(chosen_parcel, chosen_tenure, applicant_info)
