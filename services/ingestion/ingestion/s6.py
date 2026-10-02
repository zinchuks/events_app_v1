"""Original bounded adapters. Licensed public text only, never images/contact fields.

Madrid CC BY 4.0; Helsinki CC BY 4.0; Toronto Open Government Licence.
No guessed sessions, prices, coordinates, event language, or cancellations.
"""

import argparse
import codecs
import hashlib
import html
import ipaddress
import json
import math
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from zoneinfo import ZoneInfo

from .madrid import normalize as madrid_base

TORONTO_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/9201059e-43ed-4369-885e-0b867652feac/resource/8900fdb2-7f6c-4f50-8581-b463311ff05d/download/file.json"
HOSTS = {"datos.madrid.es", "api.hel.fi", "ckan0.cf.opendata.inter.prod-toronto.ca"}


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        if tag in {"p", "br", "li", "div"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def text(value, limit=20000):
    parser = TextParser()
    parser.feed(str(value or ""))
    return re.sub(r"[ \t]+", " ", html.unescape("".join(parser.parts))).strip()[:limit]


def point(lon, lat):
    try:
        if isinstance(lon, bool) or isinstance(lat, bool):
            return None
        lon, lat = float(lon), float(lat)
        if math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90:
            return [lon, lat]
    except (ValueError, TypeError):
        pass
    return None


def iso_time(value):
    result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Explicit offset required")
    return result.astimezone(timezone.utc)


def original_url(value, fallback):
    """Explicit public HTTPS organizer link only; never fetched by this worker."""
    if not isinstance(value, str) or len(value) > 3000:
        return fallback
    try:
        parsed = urllib.parse.urlsplit(value.strip())
        host = parsed.hostname or ""
        if (
            parsed.scheme != "https"
            or parsed.username
            or parsed.password
            or parsed.port not in {None, 443}
            or "." not in host
        ):
            return fallback
        try:
            ipaddress.ip_address(host)
            return fallback
        except ValueError:
            pass
        if host.endswith((".local", ".localhost", ".invalid", ".internal", ".test")):
            return fallback
        if not re.fullmatch(r"[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", host) or re.search(r"\s", value):
            return fallback
        return urllib.parse.urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, parsed.fragment)
        )
    except ValueError:
        return fallback


def seal(row):
    # Hash only the normalized public facts; fetch clocks/contact/images are excluded.
    row["hash"] = hashlib.sha256(
        json.dumps(row, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    return row


def madrid(records):
    originals = {str(r.get("id")): r for r in records}
    result = []
    for base in madrid_base(records):
        raw = originals[base["external_id"]]
        base.pop("hash")
        location = raw.get("location") or {}
        base["location"] = point(location.get("longitude"), location.get("latitude"))
        base["territory"] = "madrid:municipio:Madrid" if base.pop("locality") == "MADRID" else None
        # Numeric free flag is an explicit provider statement, not an empty-price guess.
        price = text(raw.get("price"), 500)
        exact = re.fullmatch(r"(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|€)", price, re.IGNORECASE)
        base["price"] = (
            0
            if type(raw.get("free")) is int and raw["free"] == 1
            else float(exact[1].replace(",", "."))
            if exact
            else None
        )
        base["currency"] = "EUR" if base["price"] is not None else None
        base["description"] = text(base["description"]) or None
        base["occurrences"] = [base.pop("occurrence")]
        result.append(seal(base))
    return result


TORONTO_CATEGORIES = {
    "Music": "music",
    "Arts/Exhibits": "culture",
    "Theatre": "theatre",
    "Film": "cinema",
    "Sports": "sport",
    "Family/Children": "family",
    "Education": "learning",
    "Festivals": "festivals",
}
HELSINKI_CATEGORIES = {
    "concerts": "music",
    "music": "music",
    "organ music": "music",
    "theatre": "theatre",
    "dance (performing arts)": "theatre",
    "cinema": "cinema",
    "films": "cinema",
    "sports": "sport",
    "exhibitions": "culture",
    "cultural events": "culture",
    "festivals": "festivals",
    "courses": "learning",
    "lectures": "learning",
}


def toronto(raw, now):
    if raw.get("event_status") != "Approved" or not raw.get("id") or not raw.get("event_name"):
        return None
    locations = raw.get("event_locations") or []
    # Multiple venues are not silently collapsed into one session/location.
    if len(locations) != 1:
        return None
    location = locations[0]
    try:
        start = iso_time(raw["calendar_date"])
        if raw.get(
            "calendar_time_of_day"
        ) != "All Day Event" and not now <= start <= now + timedelta(days=60):
            return None
    except (ValueError, TypeError, KeyError):
        return None
    occurrence = {"external_id": str(raw["id"]), "timezone": "America/Toronto"}
    if raw.get("calendar_time_of_day") == "All Day Event":
        date = str(raw.get("calendar_date_group", ""))
        try:
            parsed = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            return None
        if (
            not now.astimezone(ZoneInfo("America/Toronto")).date()
            <= parsed
            <= (now + timedelta(days=60)).date()
        ):
            return None
        occurrence.update(time_kind="date_only", local_date=date)
    else:
        occurrence.update(time_kind="known", start_at=start.isoformat())
    gps = location.get("location_gps") or "[]"
    try:
        gps = json.loads(gps) if isinstance(gps, str) else gps
        position = point(gps[0].get("gps_lng"), gps[0].get("gps_lat")) if len(gps) == 1 else None
    except (ValueError, TypeError, KeyError):
        position = None
    address = str(location.get("location_address") or "")
    city = bool(re.search(r"\bM\d[A-Z]\s?\d[A-Z]\d\b", address, re.IGNORECASE))
    # City identification from provider postal address; no reverse geocoding/inferred boundary.
    territory = "catalog:city:CA:Toronto" if city else "iso3166:CA" if "Canada" in address else None
    category = next(
        (TORONTO_CATEGORIES[c] for c in raw.get("event_category", []) if c in TORONTO_CATEGORIES),
        "other",
    )
    return seal(
        {
            "external_id": str(raw["id"]),
            "series_key": raw.get("calendar_id"),
            "title": text(raw["event_name"], 400),
            "description": text(raw.get("event_description")) or None,
            "category_code": category,
            "venue": text(location.get("location_name"), 400) or None,
            "territory": territory,
            "location": position,
            # The public dataset is the original; do not invent an unverified event deep link.
            "url": original_url(
                raw.get("event_website"), "https://open.toronto.ca/dataset/festivals-events/"
            ),
            "price": 0 if raw.get("free_event") == "Yes" else None,
            "currency": "CAD" if raw.get("free_event") == "Yes" else None,
            "occurrences": [occurrence],
        }
    )


def helsinki(raw, now):
    if (
        raw.get("deleted")
        or raw.get("replaced_by")
        or raw.get("event_status") not in {"EventScheduled", "EventCancelled"}
        or raw.get("sub_events")
        or raw.get("super_event_type")
    ):
        return None
    location = raw.get("location") or {}
    if not isinstance(location, dict) or not any(
        d.get("ocd_id") == "ocd-division/country:fi/kunta:helsinki"
        for d in location.get("divisions", [])
    ):
        return None
    names = raw.get("name") or {}
    locale = next((lang for lang in ["fi", "en", "sv"] if names.get(lang)), None)
    if not locale or not raw.get("id"):
        return None
    occurrence = {"external_id": raw["id"], "timezone": "Europe/Helsinki"}
    value = str(raw.get("start_time") or "")
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            start = datetime.fromisoformat(value).replace(tzinfo=ZoneInfo("Europe/Helsinki"))
            occurrence.update(time_kind="date_only", local_date=value)
        else:
            start = iso_time(value)
            occurrence.update(time_kind="known", start_at=start.isoformat())
            if raw.get("end_time") and "T" in raw["end_time"]:
                end = iso_time(raw["end_time"])
                if end < start:
                    return None
                occurrence["end_at"] = end.isoformat()
        if occurrence["time_kind"] == "date_only":
            if (
                not now.astimezone(ZoneInfo("Europe/Helsinki")).date()
                <= start.date()
                <= (now + timedelta(days=60)).date()
            ):
                return None
        elif start < now or start > now + timedelta(days=60):
            return None
    except (ValueError, TypeError):
        return None
    tags = [
        k.get("name", {}).get("en", "").lower()
        for k in raw.get("keywords", [])
        if isinstance(k, dict)
    ]
    category = next(
        (HELSINKI_CATEGORIES[tag] for tag in tags if tag in HELSINKI_CATEGORIES), "other"
    )
    coords = (location.get("position") or {}).get("coordinates") or []
    offers = raw.get("offers") or []
    free = bool(offers) and all(o.get("is_free") is True for o in offers)
    native = []
    for language in ["en", "es", "uk"]:
        if (
            language != locale
            and names.get(language)
            and (raw.get("description") or {}).get(language)
        ):
            native.append(
                {
                    "locale": language,
                    "title": text(names[language], 400),
                    "description": text(raw["description"][language]),
                    "summary": text((raw.get("short_description") or {}).get(language), 600)
                    or None,
                }
            )
    parent = raw.get("super_event")
    row = {
        "external_id": raw["id"],
        "series_key": parent.get("@id") if isinstance(parent, dict) else parent,
        "title": text(names[locale], 400),
        "status": "cancelled" if raw.get("event_status") == "EventCancelled" else "scheduled",
        "original_language": locale,
        "description": text((raw.get("description") or {}).get(locale)) or None,
        "venue": text((location.get("name") or {}).get(locale), 400) or None,
        "url": original_url(
            (raw.get("info_url") or {}).get(locale),
            "https://api.hel.fi/linkedevents/v1/event/"
            + urllib.parse.quote(raw["id"], safe=":")
            + "/",
        ),
        "category_code": category,
        "territory": "catalog:city:FI:Helsinki",
        "location": point(*coords) if len(coords) == 2 else None,
        "price": 0 if free else None,
        "currency": "EUR" if free else None,
        "occurrences": [occurrence],
        "translations": native,
    }
    return seal(row)


class AllowlistedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def validate_url(url):
    p = urllib.parse.urlsplit(url)
    if (
        p.scheme != "https"
        or p.hostname not in HOSTS
        or p.port not in {None, 443}
        or p.username
        or p.password
    ):
        raise ValueError("Unapproved source URL")


def open_source(url):
    validate_url(url)
    return urllib.request.build_opener(AllowlistedRedirect()).open(
        urllib.request.Request(
            url, headers={"User-Agent": "EventRadar-development/0.1", "Accept": "application/json"}
        ),
        timeout=25,
    )


def json_source(url, limit):
    with open_source(url) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Source exceeds byte cap")
    return json.loads(data), len(data)


def toronto_prefix(response, now, byte_cap=32 * 1024 * 1024, row_cap=5000, import_cap=400):
    # Incremental array extraction intentionally stops at declared caps. Not a whole-feed claim.
    decoder = json.JSONDecoder()
    buffer = ""
    started = False
    size = 0
    inspected = 0
    result = []
    utf8 = codecs.getincrementaldecoder("utf-8")()
    while size < byte_cap and inspected < row_cap and len(result) < import_cap:
        chunk = response.read(min(65536, byte_cap - size))
        if not chunk:
            utf8.decode(b"", final=True)
            raise ValueError("Truncated Toronto array")
        size += len(chunk)
        buffer += utf8.decode(chunk)
        if not started:
            marker = re.search(r'"value"\s*:\s*\[', buffer)
            if not marker:
                if len(buffer) > 1024:
                    raise ValueError("Unexpected Toronto envelope")
                continue
            buffer = buffer[marker.end() :]
            started = True
        while True:
            buffer = buffer.lstrip(" \r\n\t,")
            if buffer.startswith("]"):
                return result, {"bytes": size, "inspected": inspected, "bounded_subset": False}
            try:
                row, length = decoder.raw_decode(buffer)
            except ValueError:
                break
            inspected += 1
            normalized = toronto(row, now)
            if normalized:
                result.append(normalized)
            buffer = buffer[length:]
            if inspected >= row_cap or len(result) >= import_cap:
                break
        if len(buffer) > 1024 * 1024:
            raise ValueError("Toronto item exceeds buffer cap")
    if not started:
        raise ValueError("Empty source response")
    return result, {"bytes": size, "inspected": inspected, "bounded_subset": True}


def fetch(source):
    now = datetime.now(timezone.utc)
    started = time.monotonic()
    if source == "madrid":
        payload, size = json_source(
            "https://datos.madrid.es/egob/catalogo/300107-0-agenda-actividades-eventos.json",
            8 * 1024 * 1024,
        )
        batch = madrid(payload["@graph"])
        metrics = {"bytes": size, "inspected": len(payload["@graph"]), "bounded_subset": True}
    elif source == "toronto":
        with open_source(TORONTO_URL) as response:
            batch, metrics = toronto_prefix(response, now)
    else:
        end = (now + timedelta(days=60)).date().isoformat()
        url = "https://api.hel.fi/linkedevents/v1/event/?" + urllib.parse.urlencode(
            {
                "start": now.date().isoformat(),
                "end": end,
                "sort": "-last_modified_time",
                "page_size": 100,
                "include": "location,keywords",
            }
        )
        batch, size, inspected = [], 0, 0
        for _ in range(3):
            payload, count = json_source(url, 4 * 1024 * 1024)
            size += count
            inspected += len(payload["data"])
            batch.extend(row for raw in payload["data"] if (row := helsinki(raw, now)))
            url = payload["meta"].get("next")
            if not url or time.monotonic() - started > 75:
                break
        metrics = {"bytes": size, "inspected": inspected, "bounded_subset": bool(url)}
    # Collapse only identical stable IDs; conflicting duplicate records fail the whole source.
    unique = {}
    for row in batch:
        key = row["external_id"]
        if key in unique and unique[key]["hash"] != row["hash"]:
            raise ValueError("Conflicting provider identity")
        unique[key] = row
    if not unique or len(unique) > 2000:
        raise ValueError("Empty/oversized normalized source batch")
    metrics["normalized"] = len(unique)
    metrics["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    return {"batch": list(unique.values()), "metrics": metrics}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", choices=["madrid", "toronto", "helsinki"])
    args = parser.parse_args()
    print(json.dumps(fetch(args.source), ensure_ascii=False))
