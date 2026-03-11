"""
Crown Land module for fetching and displaying available crown land parcels
from the Newfoundland and Labrador government Land Use Atlas ArcGIS REST API.

Source: https://www.gov.nl.ca/landuseatlasmaps/rest/services/LandUseDetails/MapServer
Crown Titles layer ID: 3
"""
import requests

from status import *
from prettytable import PrettyTable
from termcolor import colored


# NL Land Use Atlas — Crown Titles (Layer 3) ArcGIS REST query endpoint
CROWN_LAND_API = (
    "https://www.gov.nl.ca/landuseatlasmaps/rest/services/"
    "LandUseDetails/MapServer/3/query"
    "?f=json"
    "&where=1%3D1"
    "&outFields=TITLENO,TITLETYPE,TITLESTATUS,APPLICANT,AREA_HA,DISTRICT,PURPOSE"
    "&returnGeometry=false"
    "&resultRecordCount=50"
)


class CrownLand:
    """Fetches and displays crown land title data from the NL Land Use Atlas API."""

    def fetch_available(self) -> list:
        """Fetch crown land titles from the NL government ArcGIS REST API.

        Returns:
            list: A list of feature attribute dicts, or empty list on failure.
        """
        try:
            info(" => Fetching Newfoundland crown land data...")
            response = requests.get(CROWN_LAND_API, timeout=15)
            response.raise_for_status()
            data = response.json()
            features = data.get("features", [])
            success(f" => Retrieved {len(features)} crown land record(s).")
            return features
        except requests.exceptions.Timeout:
            error("Request timed out while fetching crown land data.")
        except requests.exceptions.ConnectionError:
            error("Network error while fetching crown land data.")
        except Exception as e:
            error(f"Error fetching crown land data: {str(e)}")
        return []

    def show(self) -> None:
        """Display Newfoundland crown land titles in a formatted table."""
        features = self.fetch_available()

        if not features:
            warning("No crown land records found or failed to fetch data.")
            return

        table = PrettyTable()
        table.field_names = [
            "ID", "Title No.", "Type", "Status",
            "Applicant", "Area (ha)", "District", "Purpose"
        ]
        table.max_width = 22

        for idx, feature in enumerate(features, start=1):
            attrs = feature.get("attributes", {})
            table.add_row([
                idx,
                colored(str(attrs.get("TITLENO", "N/A")), "cyan"),
                colored(str(attrs.get("TITLETYPE", "N/A")), "yellow"),
                colored(str(attrs.get("TITLESTATUS", "N/A")), "green"),
                colored(str(attrs.get("APPLICANT", "N/A")), "magenta"),
                colored(str(attrs.get("AREA_HA", "N/A")), "white"),
                colored(str(attrs.get("DISTRICT", "N/A")), "blue"),
                colored(str(attrs.get("PURPOSE", "N/A")), "white"),
            ])

        print(table)
        success(f" => Showing {len(features)} Newfoundland crown land title(s).")
