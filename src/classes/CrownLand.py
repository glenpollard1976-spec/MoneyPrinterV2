"""
Crown Land module for fetching and displaying available crown land parcels
from the British Columbia government open data API.
"""
import requests

from status import *
from prettytable import PrettyTable
from termcolor import colored


CROWN_LAND_API = (
    "https://openmaps.gov.bc.ca/geo/pub/"
    "WHSE_TANTALIS.TA_CROWN_TENURES_SVW/wfs"
    "?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
    "&outputFormat=application/json"
    "&typeNames=WHSE_TANTALIS.TA_CROWN_TENURES_SVW"
    "&CQL_FILTER=TENURE_STATUS=%27ACCEPTED%27"
    "&count=50"
    "&propertyName=TENURE_TYPE,TENURE_SUBTYPE,TENURE_STATUS,"
    "TENURE_STAGE,INTRID_SID,TENURE_AREA_IN_HECTARES,"
    "RESPONSIBLE_BUSINESS_UNIT"
)


class CrownLand:
    """Fetches and displays available crown land data from the BC open data API."""

    def fetch_available(self) -> list:
        """Fetch available crown land parcels from the BC government WFS API.

        Returns:
            list: A list of crown land feature dicts, or empty list on failure.
        """
        try:
            info(" => Fetching available crown land data...")
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
        """Display available crown land parcels in a formatted table."""
        features = self.fetch_available()

        if not features:
            warning("No crown land records found or failed to fetch data.")
            return

        table = PrettyTable()
        table.field_names = [
            "ID", "Parcel ID", "Type", "Subtype", "Status",
            "Stage", "Area (ha)", "Business Unit"
        ]
        table.max_width = 25

        for idx, feature in enumerate(features, start=1):
            props = feature.get("properties", {})
            table.add_row([
                idx,
                colored(str(props.get("INTRID_SID", "N/A")), "cyan"),
                colored(str(props.get("TENURE_TYPE", "N/A")), "yellow"),
                colored(str(props.get("TENURE_SUBTYPE", "N/A")), "magenta"),
                colored(str(props.get("TENURE_STATUS", "N/A")), "green"),
                colored(str(props.get("TENURE_STAGE", "N/A")), "blue"),
                colored(str(props.get("TENURE_AREA_IN_HECTARES", "N/A")), "white"),
                colored(str(props.get("RESPONSIBLE_BUSINESS_UNIT", "N/A")), "white"),
            ])

        print(table)
        success(f" => Showing {len(features)} available crown land parcel(s).")
