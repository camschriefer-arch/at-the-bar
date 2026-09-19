#!/usr/bin/env python3
"""Fills in the address of venues that were added from the app before the app
started reverse-geocoding them.

Venues imported from Overture arrive with an address; one a user added from
"Add this place" only had coordinates, so it read as a bare name. Newer app
builds geocode on the phone, but rows added before that stay blank until
someone adds them again. This walks those rows and asks Nominatim for the
street, city and state at their coordinates.

Only null fields are written, so a venue that already has an address is left
alone, and a rerun only covers what is still missing.

Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/backfill_venue_addresses.py
  python3 scripts/backfill_venue_addresses.py --dry-run   # print, change nothing
  python3 scripts/backfill_venue_addresses.py --limit 20
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
# Nominatim's usage policy: at most one request a second, and a real contact in
# the user agent.
SECONDS_BETWEEN_LOOKUPS = 1.1
USER_AGENT = "at-the-bar-venue-backfill/1.0 (https://github.com/camschriefer-arch/at-the-bar)"
RETRY_DELAYS_SECONDS = [5, 15, 30, 60]
PAGE_SIZE = 200

STATE_CODES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT",
    "delaware": "DE", "district of columbia": "DC", "florida": "FL",
    "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY",
    "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT",
    "nebraska": "NE", "nevada": "NV", "new hampshire": "NH",
    "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "puerto rico": "PR", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}


def send(request: urllib.request.Request) -> str:
    for attempt in range(len(RETRY_DELAYS_SECONDS) + 1):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read().decode(errors="replace")
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            if error.code < 500 or attempt == len(RETRY_DELAYS_SECONDS):
                raise SystemExit(f"{request.full_url} failed: {error.code} {detail}")
        except urllib.error.URLError as error:
            if attempt == len(RETRY_DELAYS_SECONDS):
                raise SystemExit(f"{request.full_url} failed: {error}")

        time.sleep(RETRY_DELAYS_SECONDS[attempt])

    raise SystemExit("unreachable")


def request_json(request: urllib.request.Request) -> object:
    return json.loads(send(request))


def patch_venue(url: str, key: str, venue_id: str, patch: dict[str, str]) -> None:
    send(
        urllib.request.Request(
            f"{url.rstrip('/')}/rest/v1/bars?id=eq.{venue_id}",
            data=json.dumps(patch).encode(),
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            method="PATCH",
        )
    )


def blank_venues(url: str, key: str, limit: int | None) -> list[dict[str, object]]:
    """Every user-added venue still missing a city or a state."""

    found: list[dict[str, object]] = []
    offset = 0

    while True:
        page_size = PAGE_SIZE if limit is None else min(PAGE_SIZE, limit - len(found))
        query = urllib.parse.urlencode(
            {
                "select": "id,name,lat,lng,street,city,state",
                "source": "eq.user",
                "or": "(city.is.null,state.is.null)",
                "order": "updated_at.asc",
                "offset": offset,
                "limit": page_size,
            }
        )

        page = request_json(
            urllib.request.Request(
                f"{url.rstrip('/')}/rest/v1/bars?{query}",
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Accept": "application/json",
                },
                method="GET",
            )
        )

        if not isinstance(page, list):
            raise SystemExit(f"Unexpected response listing venues: {page}")

        found.extend(row for row in page if isinstance(row, dict))
        offset += len(page)

        if len(page) < page_size or (limit is not None and len(found) >= limit):
            return found


def state_code(region: str | None) -> str | None:
    if not region:
        return None

    trimmed = region.strip()
    if len(trimmed) == 2:
        return trimmed.upper()

    return STATE_CODES.get(trimmed.lower(), trimmed)


def address_at(lat: float, lng: float) -> dict[str, str | None]:
    query = urllib.parse.urlencode(
        {"lat": lat, "lon": lng, "format": "jsonv2", "zoom": 18, "addressdetails": 1}
    )

    payload = request_json(
        urllib.request.Request(
            f"{NOMINATIM}?{query}",
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            method="GET",
        )
    )

    address = payload.get("address") if isinstance(payload, dict) else None
    if not isinstance(address, dict):
        return {"street": None, "city": None, "state": None}

    road = address.get("road")
    number = address.get("house_number")
    street = f"{number} {road}" if road and number else road

    # Nominatim names the settlement differently depending on how the place is
    # administered, so take the first one that exists.
    city = None
    for field in ("city", "town", "village", "hamlet", "suburb", "county"):
        if address.get(field):
            city = address[field]
            break

    return {
        "street": street,
        "city": city,
        "state": state_code(address.get("state")),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="print what would change")
    parser.add_argument("--limit", type=int, help="stop after this many venues")
    arguments = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before backfilling.")

    venues = blank_venues(url, key, arguments.limit)
    print(f"{len(venues)} user-added venues without an address")

    filled = 0
    for index, venue in enumerate(venues):
        if index:
            time.sleep(SECONDS_BETWEEN_LOOKUPS)

        found = address_at(float(venue["lat"]), float(venue["lng"]))
        patch = {
            field: found[field]
            for field in ("street", "city", "state")
            if venue.get(field) is None and found[field]
        }

        if not patch:
            print(f"{venue['name']}: nothing found")
            continue

        label = ", ".join(str(value) for value in patch.values())
        if arguments.dry_run:
            print(f"{venue['name']}: would set {label}")
            continue

        patch_venue(url, key, str(venue["id"]), patch)
        filled += 1
        print(f"{venue['name']}: {label}")

    if arguments.dry_run:
        print(f"Dry run over {len(venues)} venues, nothing written.")
        return

    print(f"Filled in {filled} of {len(venues)} venues.")


if __name__ == "__main__":
    main()
