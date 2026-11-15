#!/usr/bin/env python3
"""Imports a country's venue catalog from Overture Maps into the `bars` table.

Overture publishes its places theme as GeoParquet on S3, so a whole country is
one DuckDB query with no per-region throttling. Reruns are idempotent: rows are
keyed on (source, source_id).

Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/import_places.py
  python3 scripts/import_places.py --states MA,NY   # subset, useful for a first run
  python3 scripts/import_places.py --country ES     # every venue in Spain
  python3 scripts/import_places.py --bbox -0.51,51.28,0.33,51.69   # Greater London
  python3 scripts/import_places.py --keep-osm       # leave the old OSM rows in place

A bbox is minLng,minLat,maxLng,maxLat and takes whatever falls inside it,
whatever country an address claims, which is how a city rather than a country
gets imported.

Needs `pip install duckdb`, and an Overture release from 2026-09 onwards, where the
category of a place lives in `taxonomy` rather than the older `categories`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ElementTree

BUCKET = "overturemaps-us-west-2"
BATCH_SIZE = 500
PRUNE_BATCH_SIZE = 2000
RETRY_DELAYS_SECONDS = [5, 15, 30, 60, 120]

STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI",
    "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
    "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
    "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
    "WV", "WI", "WY",
]

# Overture's category vocabulary is flat and enormous, so the mapping is by rule
# with the false friends listed out: "salad_bar" and "barber" are not drinking.
PUB_CATEGORIES = {
    "pub", "irish_pub", "gastropub", "brewery", "brewpub", "beer_garden",
    "distillery", "winery", "wine_tasting_room", "taproom", "cidery", "meadery",
}
BAR_CATEGORIES = {"bar", "lounge", "speakeasy", "nightclub", "cabaret"}
RESTAURANT_CATEGORIES = {
    "restaurant", "diner", "steakhouse", "bistro", "brasserie", "eatery",
    "pizzeria", "cafeteria", "food_court", "buffet",
}
NOT_A_VENUE = {
    "salad_bar", "smoothie_juice_bar", "juice_bar", "milk_bar", "snack_bar",
    "oxygen_bar", "bar_crawl", "drive_thru_bar", "barre_classes", "bartender",
    "bartending_school", "restaurant_equipment_and_supply", "restaurant_wholesale",
    "restaurant_management", "restaurant_supply_store", "airport_lounge",
    "nail_salon_bar", "blow_dry_bar", "brow_bar", "lash_bar",
}


def category_for(value: str | None) -> str | None:
    """Maps an Overture category onto the three the app knows about."""
    if not value or value in NOT_A_VENUE:
        return None
    if value in PUB_CATEGORIES:
        return "pub"
    if value in BAR_CATEGORIES or value.endswith("_bar"):
        return "bar"
    if value in RESTAURANT_CATEGORIES or value.endswith("_restaurant"):
        return "restaurant"
    return None


def latest_release() -> str:
    """The newest `release/<version>/` directory Overture has published."""
    url = f"https://{BUCKET}.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/"
    with urllib.request.urlopen(url, timeout=60) as response:
        tree = ElementTree.fromstring(response.read())

    namespace = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    releases = [
        prefix.text.split("/")[1]
        for prefix in tree.findall("s3:CommonPrefixes/s3:Prefix", namespace)
        if prefix.text and re.fullmatch(r"release/\d{4}-\d{2}-\d{2}\.\d+/", prefix.text)
    ]

    if not releases:
        raise SystemExit("Overture published no releases at the expected path.")

    return sorted(releases)[-1]


def rows_for(
    release: str,
    country: str,
    states: list[str] | None,
    bbox: tuple[float, float, float, float] | None = None,
):
    """Streams a country's venues, already mapped to `bars` rows.

    `states` narrows the import to those regions; None takes the whole country.
    `bbox` replaces the country filter with a geographic one, for a single city.
    """
    import duckdb

    connection = duckdb.connect()
    connection.execute("install httpfs; load httpfs; set s3_region='us-west-2';")

    # The category filter runs in SQL only as a coarse sieve; `category_for`
    # makes the real decision, so a new Overture category cannot silently import
    # a barber shop as a bar.
    # The lists are the script's own constants, and the country and region codes
    # are checked before they get here.
    if bbox is not None:
        min_lng, min_lat, max_lng, max_lat = bbox
        place_filter = (
            f"bbox.xmin between {min_lng} and {max_lng}"
            f" and bbox.ymin between {min_lat} and {max_lat}"
        )
    else:
        place_filter = f"addresses[1].country = '{country}'"

    region_filter = ""
    if states is not None:
        state_list = ", ".join(f"'{code}'" for code in states)
        region_filter = f"and addresses[1].region in ({state_list})"

    category_list = ", ".join(
        f"'{name}'" for name in sorted(PUB_CATEGORIES | BAR_CATEGORIES | RESTAURANT_CATEGORIES)
    )

    connection.execute(
        f"""
        select
          id,
          names.primary as name,
          taxonomy.primary as category,
          bbox.ymin as lat,
          bbox.xmin as lng,
          addresses[1].freeform as street,
          addresses[1].locality as city,
          addresses[1].region as state,
          addresses[1].postcode as postcode
        from read_parquet(
          's3://{BUCKET}/release/{release}/theme=places/type=place/*'
        )
        where {place_filter}
          {region_filter}
          and names.primary is not null
          and (
            regexp_matches(taxonomy.primary, '_(bar|restaurant)$')
            or taxonomy.primary in ({category_list})
          )
        -- Overture carries the odd duplicate of the same venue: City Works in
        -- Watertown is in there twice, 2 m apart. Keep whichever Overture is
        -- most sure of, so the picker does not offer the same bar twice.
        qualify row_number() over (
          partition by lower(names.primary), round(bbox.xmin, 4), round(bbox.ymin, 4)
          order by confidence desc
        ) = 1
        """
    )

    while True:
        batch = connection.fetchmany(BATCH_SIZE)
        if not batch:
            return

        rows = []
        for place_id, name, category, lat, lng, street, city, state, postcode in batch:
            mapped = category_for(category)
            if mapped is None or not name.strip():
                continue

            rows.append(
                {
                    "source": "overture",
                    "source_id": place_id,
                    "name": name.strip(),
                    "street": street,
                    "city": city,
                    "state": state,
                    "postcode": postcode,
                    "category": mapped,
                    "lat": lat,
                    "lng": lng,
                    "location": f"SRID=4326;POINT({lng} {lat})",
                }
            )

        if rows:
            yield rows


def post(url: str, key: str, body: object, prefer: str) -> str:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
        method="POST",
    )

    for attempt in range(len(RETRY_DELAYS_SECONDS) + 1):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read().decode(errors="replace")
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            # 4xx is a bad payload and will not fix itself.
            if error.code < 500 or attempt == len(RETRY_DELAYS_SECONDS):
                raise SystemExit(f"{url} failed: {error.code} {detail}")
        except urllib.error.URLError as error:
            if attempt == len(RETRY_DELAYS_SECONDS):
                raise SystemExit(f"{url} failed: {error}")

        import time

        time.sleep(RETRY_DELAYS_SECONDS[attempt])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--states", help="comma separated US state codes, e.g. MA,NY")
    parser.add_argument(
        "--country",
        default="US",
        help="ISO country code to import, e.g. ES (default: US)",
    )
    parser.add_argument(
        "--bbox",
        help="minLng,minLat,maxLng,maxLat to import one city instead of a country",
    )
    parser.add_argument("--release", help="Overture release, e.g. 2026-08-19.0")
    parser.add_argument(
        "--keep-osm",
        action="store_true",
        help="do not delete the OpenStreetMap rows Overture has replaced",
    )
    arguments = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.")

    country = arguments.country.strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", country):
        raise SystemExit(f"Expected a two letter country code, got {arguments.country!r}.")

    # Only the US catalog is imported region by region; elsewhere the whole
    # country is one query, so there is no list of region codes to check against.
    states: list[str] | None = STATES if country == "US" else None
    if arguments.states:
        if country != "US":
            raise SystemExit("--states only applies to --country US.")
        states = [code.strip().upper() for code in arguments.states.split(",")]
        unknown = [code for code in states if code not in STATES]
        if unknown:
            raise SystemExit(f"Unknown state codes: {', '.join(unknown)}")

    bbox: tuple[float, float, float, float] | None = None
    if arguments.bbox:
        if arguments.states:
            raise SystemExit("--bbox and --states cannot both be given.")
        try:
            west, south, east, north = (float(part) for part in arguments.bbox.split(","))
        except ValueError:
            raise SystemExit("Expected --bbox as minLng,minLat,maxLng,maxLat.") from None
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise SystemExit(f"--bbox {arguments.bbox!r} is not a west,south,east,north box.")
        bbox = (west, south, east, north)
        states = None

    release = arguments.release or latest_release()
    if bbox is not None:
        scope = f"bbox {arguments.bbox}"
    elif states is not None:
        scope = f"{country}, {len(states)} states"
    else:
        scope = f"{country}, all regions"
    print(f"Overture release {release}, {scope}")

    upsert_url = f"{url.rstrip('/')}/rest/v1/bars?on_conflict=source,source_id"
    total = 0

    for rows in rows_for(release, country, states, bbox):
        post(upsert_url, key, rows, "resolution=merge-duplicates,return=minimal")
        total += len(rows)
        print(f"\r{total} venues", end="", flush=True)

    print()

    if total == 0:
        raise SystemExit("Overture returned nothing; refusing to touch the catalog.")

    # The OSM rows being replaced are all American, so only a full US run has any
    # business deleting them.
    if arguments.keep_osm or country != "US" or states != STATES:
        print(f"Imported {total} venues, left the OSM rows alone.")
        return

    # One statement deleting every replaced OSM row runs past the database's
    # statement timeout, so walk it a batch at a time until nothing is left.
    prune_url = f"{url.rstrip('/')}/rest/v1/rpc/prune_unused_osm_bars"
    pruned = 0
    while True:
        removed = int(post(prune_url, key, {"batch_size": PRUNE_BATCH_SIZE}, "return=representation"))
        if removed == 0:
            break
        pruned += removed
        print(f"\rpruned {pruned} OSM rows", end="", flush=True)

    print()
    print(f"Imported {total} venues and pruned {pruned} replaced OSM rows.")


if __name__ == "__main__":
    sys.exit(main())
