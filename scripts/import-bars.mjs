#!/usr/bin/env node
/**
 * Imports the US bar catalog from OpenStreetMap into the `bars` table.
 *
 * Overpass rejects a single query for the whole country, so the run is split
 * into per-state queries and each state is upserted in batches. Reruns are
 * idempotent: rows are keyed on (osm_type, osm_id).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import-bars
 *   npm run import-bars -- --states CA,NY   # subset, useful for a first run
 */
import { createClient } from '@supabase/supabase-js';

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const BATCH_SIZE = 500;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

// Overpass answers 406 to Node's default user agent, and asks clients to
// identify themselves.
const USER_AGENT = 'at-the-bar-importer/1.0 (+https://github.com/camschriefer-arch/at-the-bar)';

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = { states: Object.keys(STATES) };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--states') {
      const value = argv[i + 1];
      if (!value) throw new Error('--states needs a comma separated list, e.g. --states CA,NY');
      args.states = value.split(',').map((code) => code.trim().toUpperCase());
      i += 1;
    }
  }

  const unknown = args.states.filter((code) => !(code in STATES));
  if (unknown.length > 0) throw new Error(`Unknown state codes: ${unknown.join(', ')}`);

  return args;
}

// Selected by ISO code rather than name: US state relations no longer carry
// `is_in:country_code`, and matching on the name alone would also pick up
// same-named areas elsewhere in the world.
function overpassQuery(stateCode) {
  return `
    [out:json][timeout:600];
    area["ISO3166-2"="US-${stateCode}"]["admin_level"="4"]->.state;
    (
      node["amenity"~"^(bar|pub)$"](area.state);
      way["amenity"~"^(bar|pub)$"](area.state);
      relation["amenity"~"^(bar|pub)$"](area.state);
    );
    out center tags;
  `;
}

async function fetchState(stateCode, stateName) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({ data: overpassQuery(stateCode) }),
    });

    if (response.ok) return response.json();

    if (attempt >= RETRY_DELAYS_MS.length) {
      throw new Error(`Overpass failed for ${stateName}: ${response.status} ${response.statusText}`);
    }

    // Overpass returns 429/504 when it is busy; backing off is expected.
    console.warn(`  ${stateName}: ${response.status}, retrying`);
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

function toBarRows(elements, stateCode) {
  const rows = [];

  for (const element of elements) {
    const name = element.tags?.name?.trim();
    if (!name) continue;

    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const houseNumber = element.tags['addr:housenumber'];
    const street = element.tags['addr:street'];

    rows.push({
      osm_type: element.type,
      osm_id: element.id,
      name,
      street: [houseNumber, street].filter(Boolean).join(' ') || null,
      city: element.tags['addr:city'] ?? null,
      state: element.tags['addr:state'] ?? stateCode,
      postcode: element.tags['addr:postcode'] ?? null,
      lat,
      lng,
      location: `SRID=4326;POINT(${lng} ${lat})`,
      updated_at: new Date().toISOString(),
    });
  }

  return rows;
}

async function main() {
  const { states } = parseArgs(process.argv.slice(2));

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the import.');
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  let total = 0;

  for (const code of states) {
    const stateName = STATES[code];
    process.stdout.write(`${code} …`);

    const payload = await fetchState(code, stateName);
    const rows = toBarRows(payload.elements ?? [], code);

    // A state that returns nothing means the area lookup missed, not that the
    // state has no bars — fail loudly instead of importing a silent gap.
    if (rows.length === 0) {
      throw new Error(`No bars found for ${stateName}; the Overpass area lookup likely failed.`);
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('bars')
        .upsert(batch, { onConflict: 'osm_type,osm_id' });

      if (error) throw new Error(`Upsert failed for ${code}: ${error.message}`);
    }

    total += rows.length;
    console.log(` ${rows.length} bars`);

    // Overpass asks clients to stay under roughly one query at a time.
    await sleep(5_000);
  }

  console.log(`Imported ${total} bars across ${states.length} states.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
