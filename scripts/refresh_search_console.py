
import json
import os
from datetime import date, timedelta
from pathlib import Path

import google.auth
from googleapiclient.discovery import build

SITE_URL = "sc-domain:twocraftygays.com"
OUTPUT = Path("data/search_console.json")

SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly"
]

credentials, _ = google.auth.default(scopes=SCOPES)

service = build(
    "searchconsole",
    "v1",
    credentials=credentials,
    cache_discovery=False,
)

# Search Console data can take several days to finalize.
end_date = date.today() - timedelta(days=3)
start_date = end_date - timedelta(days=364)


def fetch_rows(dimensions, row_limit=25000):
    rows = []
    start_row = 0

    while True:
        request = {
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "dimensions": dimensions,
            "rowLimit": row_limit,
            "startRow": start_row,
            "dataState": "final",
            "type": "web",
        }

        response = (
            service.searchanalytics()
            .query(siteUrl=SITE_URL, body=request)
            .execute()
        )

        batch = response.get("rows", [])
        rows.extend(batch)

        if len(batch) < row_limit:
            break

        start_row += row_limit

    return rows


def summarize(rows):
    clicks = sum(row.get("clicks", 0) for row in rows)
    impressions = sum(
        row.get("impressions", 0) for row in rows
    )

    weighted_position = sum(
        row.get("position", 0) * row.get("impressions", 0)
        for row in rows
    )

    return {
        "clicks": clicks,
        "impressions": impressions,
        "ctr": clicks / impressions if impressions else 0,
        "position": (
            weighted_position / impressions
            if impressions else 0
        ),
    }


daily = fetch_rows(["date"])

data = {
    "site": SITE_URL,
    "startDate": start_date.isoformat(),
    "endDate": end_date.isoformat(),
    "lastUpdated": date.today().isoformat(),
    "summary": summarize(daily),
    "daily": daily,
    "queries": fetch_rows(["query"]),
    "pages": fetch_rows(["page"]),
    "devices": fetch_rows(["device"]),
    "countries": fetch_rows(["country"]),
    "searchAppearance": fetch_rows(["searchAppearance"]),
}

OUTPUT.parent.mkdir(parents=True, exist_ok=True)

with OUTPUT.open("w", encoding="utf-8") as file:
    json.dump(data, file, indent=2)

print(
    f"Search Console refresh complete: "
    f"{len(daily)} daily records, "
    f"{len(data['queries'])} queries, "
    f"{len(data['pages'])} pages."
)
