"""Bhu-Aadhaar (ULPIN) generation.

A ULPIN is a permanent 14-character identifier for a parcel. This implementation
derives it from the parcel's geometry so the identifier is reproducible from the
land itself rather than from a database sequence:

    [ 11 chars geohash of centroid ] + [ 2 chars state code ] + [ 1 check char ]

An 11-character geohash resolves to roughly 15 cm, which is finer than cadastral
survey tolerance, so two distinct parcels cannot collide. The trailing character
is a Damm-style check symbol over the base32 alphabet, letting a Patwari catch a
mistyped ULPIN at the counter without a database round-trip.
"""

from __future__ import annotations

# Geohash base32 ("Ghash" alphabet): digits plus lowercase minus a, i, l, o.
_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
_DECODE = {c: i for i, c in enumerate(_BASE32)}

# LGD-aligned two-character state prefixes used by the DILRMP ULPIN spec.
STATE_CODES = {
    "ANDHRA PRADESH": "AP", "ASSAM": "AS", "BIHAR": "BR", "CHHATTISGARH": "CG",
    "GOA": "GA", "GUJARAT": "GJ", "HARYANA": "HR", "HIMACHAL PRADESH": "HP",
    "JHARKHAND": "JH", "KARNATAKA": "KA", "KERALA": "KL", "MADHYA PRADESH": "MP",
    "MAHARASHTRA": "MH", "MANIPUR": "MN", "MEGHALAYA": "ML", "MIZORAM": "MZ",
    "NAGALAND": "NL", "ODISHA": "OD", "PUNJAB": "PB", "RAJASTHAN": "RJ",
    "SIKKIM": "SK", "TAMIL NADU": "TN", "TELANGANA": "TS", "TRIPURA": "TR",
    "UTTAR PRADESH": "UP", "UTTARAKHAND": "UK", "WEST BENGAL": "WB",
    "DELHI": "DL", "JAMMU AND KASHMIR": "JK", "LADAKH": "LA", "PUDUCHERRY": "PY",
}

GEOHASH_PRECISION = 11
ULPIN_LENGTH = 14


class UlpinError(ValueError):
    pass


def encode_geohash(latitude: float, longitude: float, precision: int = GEOHASH_PRECISION) -> str:
    """Standard interleaved-bit geohash encoding."""
    if not -90.0 <= latitude <= 90.0:
        raise UlpinError(f"latitude out of range: {latitude}")
    if not -180.0 <= longitude <= 180.0:
        raise UlpinError(f"longitude out of range: {longitude}")

    lat_range, lon_range = [-90.0, 90.0], [-180.0, 180.0]
    out: list[str] = []
    bit, ch, even = 0, 0, True

    while len(out) < precision:
        if even:
            mid = (lon_range[0] + lon_range[1]) / 2
            if longitude > mid:
                ch = (ch << 1) | 1
                lon_range[0] = mid
            else:
                ch <<= 1
                lon_range[1] = mid
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if latitude > mid:
                ch = (ch << 1) | 1
                lat_range[0] = mid
            else:
                ch <<= 1
                lat_range[1] = mid
        even = not even
        bit += 1
        if bit == 5:
            out.append(_BASE32[ch])
            bit, ch = 0, 0

    return "".join(out)


def decode_geohash(geohash: str) -> tuple[float, float]:
    """Return the centre of the cell a geohash refers to."""
    lat_range, lon_range = [-90.0, 90.0], [-180.0, 180.0]
    even = True
    for char in geohash:
        try:
            value = _DECODE[char]
        except KeyError as exc:
            raise UlpinError(f"invalid geohash character {char!r}") from exc
        for mask in (16, 8, 4, 2, 1):
            target = lon_range if even else lat_range
            mid = (target[0] + target[1]) / 2
            if value & mask:
                target[0] = mid
            else:
                target[1] = mid
            even = not even
    return (sum(lat_range) / 2, sum(lon_range) / 2)


def _check_character(payload: str) -> str:
    """Weighted modulo-32 checksum over the base32 alphabet. Positional weights
    make transpositions (the commonest counter-desk typo) detectable."""
    total = 0
    for index, char in enumerate(payload.lower()):
        value = _DECODE.get(char, (ord(char) - 55) % 32)
        total += value * (index + 2)
    return _BASE32[total % 32]


def generate_ulpin(
    latitude: float,
    longitude: float,
    state: str | None = None,
    state_code: str | None = None,
) -> str:
    """Build the 14-character ULPIN for a parcel centroid."""
    code = (state_code or STATE_CODES.get((state or "").strip().upper()) or "IN").upper()
    if len(code) != 2:
        raise UlpinError(f"state code must be two characters, got {code!r}")

    geohash = encode_geohash(latitude, longitude, GEOHASH_PRECISION)
    payload = f"{code}{geohash}"
    ulpin = f"{payload}{_check_character(payload)}".upper()

    if len(ulpin) != ULPIN_LENGTH:
        raise UlpinError(f"generated ULPIN has length {len(ulpin)}, expected {ULPIN_LENGTH}")
    return ulpin


def validate_ulpin(ulpin: str) -> bool:
    """Verify length and check character without touching the database."""
    if not ulpin or len(ulpin) != ULPIN_LENGTH:
        return False
    body, check = ulpin[:-1], ulpin[-1].lower()
    if not all(c.lower() in _DECODE or c.isalpha() for c in body):
        return False
    return _check_character(body) == check


def ulpin_to_centroid(ulpin: str) -> tuple[float, float]:
    """Recover the approximate parcel centroid encoded in a ULPIN."""
    if not validate_ulpin(ulpin):
        raise UlpinError(f"ULPIN failed check-character validation: {ulpin}")
    return decode_geohash(ulpin[2:-1].lower())
