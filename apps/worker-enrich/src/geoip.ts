import geoip from 'geoip-lite';

export interface Geo {
  country: string;
  city: string;
  latitude: number;
  longitude: number;
}

/** Offline GeoIP lookup. Returns null for private/unroutable IPs. */
export function lookupGeo(ip: string): Geo | null {
  const g = geoip.lookup(ip);
  if (!g) return null;
  return {
    country: g.country,
    city: g.city,
    latitude: g.ll[0],
    longitude: g.ll[1],
  };
}
