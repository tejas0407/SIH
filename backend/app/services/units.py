"""Regional unit normalisation.

Indian land records are recorded in units whose value changes across district
lines: a Bigha in Meerut is not a Bigha in Patna. Conversions are therefore
resolved against the record's state/district before any arithmetic is done,
and every conversion carries the authority it came from so a Tehsildar can
audit why a number changed.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

# Devanagari digit -> ASCII digit. Marathi and Hindi records mix both freely.
_INDIC_DIGITS = {
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
    "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
}


@dataclass(frozen=True)
class UnitDefinition:
    key: str
    sqm: Decimal
    aliases: tuple[str, ...]
    region_scope: str
    authority: str


# Canonical conversion table. `region_scope` is matched against the village's
# state (and district for split-state units such as Bigha in Uttar Pradesh).
UNIT_TABLE: tuple[UnitDefinition, ...] = (
    UnitDefinition(
        "hectare", Decimal("10000"),
        ("hectare", "hect", "ha", "हेक्टेयर", "हेक्टर", "हे"),
        "*", "SI / DILRMP standard",
    ),
    UnitDefinition(
        "acre", Decimal("4046.8564224"),
        ("acre", "एकड़", "एकर"), "*", "International acre",
    ),
    UnitDefinition(
        "sqm", Decimal("1"),
        ("sqm", "sq m", "m2", "square metre", "square meter", "वर्ग मीटर"),
        "*", "SI base",
    ),
    UnitDefinition(
        "bigha_western_up", Decimal("2529.3"),
        ("bigha", "बीघा", "पक्का बीघा", "pucca bigha"),
        "UTTAR PRADESH:WEST", "UP Board of Revenue (Western zone)",
    ),
    UnitDefinition(
        "bigha_eastern_up", Decimal("1618.7"),
        ("bigha", "बीघा", "कच्चा बीघा", "kaccha bigha"),
        "UTTAR PRADESH:EAST|BIHAR|JHARKHAND", "UP/Bihar Revenue (Eastern zone)",
    ),
    UnitDefinition(
        "guntha", Decimal("101.17"),
        ("guntha", "gunta", "गुंठा", "ಗುಂಟೆ"),
        "MAHARASHTRA|KARNATAKA", "Maharashtra Land Revenue Code",
    ),
    UnitDefinition(
        "cent", Decimal("40.46"),
        ("cent", "సెంటు", "சென்ட்", "ಸೆಂಟ್"),
        "TAMIL NADU|KERALA|ANDHRA PRADESH|TELANGANA|KARNATAKA",
        "South India survey standard",
    ),
    UnitDefinition(
        "biswa_western_up", Decimal("126.465"),
        ("biswa", "बिस्वा"), "UTTAR PRADESH:WEST", "1/20 Bigha (Western UP)",
    ),
    UnitDefinition(
        "are", Decimal("100"), ("are", "आर"), "*", "SI derived",
    ),
)

# Western-zone UP districts; anything else in UP falls to the eastern Bigha.
WESTERN_UP_DISTRICTS = {
    "MEERUT", "SAHARANPUR", "MUZAFFARNAGAR", "BAGHPAT", "GHAZIABAD",
    "GAUTAM BUDDHA NAGAR", "BULANDSHAHR", "ALIGARH", "HATHRAS", "AGRA",
    "MATHURA", "FIROZABAD", "ETAH", "KASGANJ", "SHAMLI", "BIJNOR", "MORADABAD",
}


class UnitResolutionError(ValueError):
    """Raised when a vernacular unit cannot be mapped for the given region."""


def normalise_digits(text: str) -> str:
    """Fold Devanagari numerals to ASCII and strip zero-width joiners."""
    text = unicodedata.normalize("NFC", text)
    return "".join(_INDIC_DIGITS.get(ch, ch) for ch in text if ch not in "\u200b\u200c\u200d")


def _zone_for(state: str | None, district: str | None) -> str:
    state_u = (state or "").strip().upper()
    district_u = (district or "").strip().upper()
    if state_u == "UTTAR PRADESH":
        return "UTTAR PRADESH:WEST" if district_u in WESTERN_UP_DISTRICTS else "UTTAR PRADESH:EAST"
    return state_u


def resolve_unit(
    unit_text: str, state: str | None = None, district: str | None = None
) -> UnitDefinition:
    """Map a vernacular unit string to a definition, disambiguated by region."""
    token = normalise_digits(unit_text).strip().lower().rstrip(".")
    if not token:
        raise UnitResolutionError("empty unit string")

    zone = _zone_for(state, district)
    candidates = [u for u in UNIT_TABLE if token in {a.lower() for a in u.aliases}]
    if not candidates:
        raise UnitResolutionError(f"unknown land unit: {unit_text!r}")

    if len(candidates) == 1:
        return candidates[0]

    for unit in candidates:
        scopes = unit.region_scope.split("|")
        if zone in scopes or any(zone.startswith(s.split(":")[0]) and s == zone for s in scopes):
            return unit

    ambiguous = ", ".join(u.key for u in candidates)
    raise UnitResolutionError(
        f"unit {unit_text!r} is region-dependent ({ambiguous}); "
        f"no rule for state={state!r} district={district!r}"
    )


_AREA_RE = re.compile(
    r"(?P<value>\d+(?:[.,]\d+)?(?:\s*/\s*\d+)?)\s*(?P<unit>[^\d\s,;]+(?:\s[^\d\s,;]+)?)"
)


def to_sqm(
    value: Decimal | float | str,
    unit_text: str,
    state: str | None = None,
    district: str | None = None,
) -> tuple[Decimal, UnitDefinition]:
    """Convert a declared area into square metres, returning the rule applied."""
    unit = resolve_unit(unit_text, state, district)
    raw = normalise_digits(str(value)).replace(",", "").strip()
    try:
        if "/" in raw:
            num, den = raw.split("/", 1)
            quantity = Decimal(num.strip()) / Decimal(den.strip())
        else:
            quantity = Decimal(raw)
    except (InvalidOperation, ZeroDivisionError) as exc:
        raise UnitResolutionError(f"unparseable area quantity: {value!r}") from exc

    return (quantity * unit.sqm).quantize(Decimal("0.0001")), unit


def parse_area_expression(
    text: str, state: str | None = None, district: str | None = None
) -> Decimal:
    """Parse compound areas as printed in registers, e.g. '2 बीघा 10 बिस्वा'
    or '1 hectare 25 are'. Every component is converted and summed."""
    cleaned = normalise_digits(text)
    total = Decimal("0")
    matched = False
    for match in _AREA_RE.finditer(cleaned):
        try:
            sqm, _ = to_sqm(match.group("value"), match.group("unit"), state, district)
        except UnitResolutionError:
            continue
        total += sqm
        matched = True
    if not matched:
        raise UnitResolutionError(f"no recognisable area component in {text!r}")
    return total.quantize(Decimal("0.0001"))


def supported_units() -> list[dict]:
    """Exposed via the API so the reviewer UI can render a unit picker."""
    return [
        {
            "key": u.key,
            "sqm": float(u.sqm),
            "aliases": list(u.aliases),
            "region": u.region_scope,
            "authority": u.authority,
        }
        for u in UNIT_TABLE
    ]
