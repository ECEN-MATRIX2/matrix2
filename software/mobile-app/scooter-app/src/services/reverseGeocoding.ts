export type ReverseGeocodeCoordinate = {
  lat: number;
  lng: number;
};

export type ReverseGeocodeResult = {
  label: string;
  provider: string;
};

export interface ReverseGeocoder {
  reverseGeocode: (coordinate: ReverseGeocodeCoordinate) => Promise<ReverseGeocodeResult | null>;
}

type NominatimReverseGeocodeResponse = {
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    neighbourhood?: string;
    suburb?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
  };
};

type CreateNominatimReverseGeocoderOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function compact(parts: Array<string | undefined>): string[] {
  return parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0);
}

function unique(parts: string[]): string[] {
  return Array.from(new Set(parts));
}

function formatReadableAddress(
  response: NominatimReverseGeocodeResponse,
  coordinate: ReverseGeocodeCoordinate
): string {
  const address = response.address ?? {};
  const cityOnly = compact([
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.county,
  ])[0];
  const stateOnly = compact([address.state])[0];

  if (cityOnly && stateOnly) return `${cityOnly}, ${stateOnly}`;
  if (cityOnly) return cityOnly;
  if (stateOnly) return stateOnly;

  void coordinate;
  return "";
}

export function createNominatimReverseGeocoder(
  options: CreateNominatimReverseGeocoderOptions = {}
): ReverseGeocoder {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;

  return {
    reverseGeocode: async (coordinate) => {
      const url =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
        `&lat=${encodeURIComponent(String(coordinate.lat))}` +
        `&lon=${encodeURIComponent(String(coordinate.lng))}` +
        `&addressdetails=1`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "scooter-app/1.0",
        },
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeout);
      });

      if (!response.ok) {
        throw new Error(`Reverse geocoding request failed (${response.status})`);
      }

      const payload = (await response.json()) as NominatimReverseGeocodeResponse;
      const label = formatReadableAddress(payload, coordinate);
      return {
        label,
        provider: "nominatim",
      };
    },
  };
}
