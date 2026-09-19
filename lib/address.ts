export type VenueAddress = {
  street: string | null;
  city: string | null;
  state: string | null;
};

export type Placemark = {
  street?: string | null;
  streetNumber?: string | null;
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
  isoCountryCode?: string | null;
};

// The catalog stores states as postal codes, which is what iOS returns and
// Android does not: a placemark there names the state in full.
const STATE_CODES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'puerto rico': 'PR',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toStateCode(region: string | null): string | null {
  if (!region) return null;
  if (/^[A-Z]{2}$/.test(region)) return region;

  return STATE_CODES[region.toLowerCase()] ?? region;
}

/**
 * The address the catalog would have carried had the venue been imported:
 * "214 Lexington St", "Waltham", "MA". Every part is optional — a placemark
 * over a strip mall often has no street, and a venue is still worth adding
 * without one.
 */
export function toVenueAddress(place: Placemark | undefined): VenueAddress {
  if (!place) return { street: null, city: null, state: null };

  const name = clean(place.street);
  const number = clean(place.streetNumber);
  // Android hands back the number inside the street on some devices; adding
  // it again reads "214 214 Lexington St".
  const street =
    name && number && !name.startsWith(number) ? `${number} ${name}` : (name ?? null);

  return {
    street,
    city: clean(place.city) ?? clean(place.subregion),
    state: toStateCode(clean(place.region)),
  };
}
