"""Conservative Madrid adapter: only single-day, non-recurring records.

Ayuntamiento de Madrid, CC BY 4.0. No images, inferred language or prices.
Multi-day/recurring series require a dedicated expansion adapter.
"""

import hashlib
import html
import json
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Explicit provider taxonomy, not title/AI guesses. Unmapped values stay "other".
CATEGORY_TYPES = {
    "music": {
        "Musica",
        "Flamenco",
        "JazzSoulFunkySwingReagge",
        "CantautorFolkCountry",
        "CoroGospel",
        "LatinaEspanola",
        "Clasica",
        "RockPop",
        "Zarzuela",
    },
    "theatre": {"TeatroPerformance", "DanzaBaile", "ComediaMonologo", "CircoMagia"},
    "cinema": {"CineActividadesAudiovisuales"},
    "sport": {
        "ActividadesDeportivas",
        "Ciclismo",
        "CarrerasMaratones",
        "Skateboarding",
        "Golf",
        "Triatlon",
    },
    "family": {"CuentacuentosTiteresMarionetas"},
    "learning": {"CursosTalleres", "ConferenciasColoquios", "Idiomas", "CapacitacionDigital"},
    "culture": {
        "Exposiciones",
        "RecitalesPresentacionesActosLiterarios",
        "ClubesLectura",
        "Historia",
        "Arte",
        "Literatura",
        "ActividadesCalleArteUrbano",
    },
    "festivals": {"Fiestas"},
}


def normalize(records):
    result = []
    zone = ZoneInfo("Europe/Madrid")
    for row in records:
        start = row.get("dtstart", "")[:10]
        if not start or start != row.get("dtend", "")[:10] or row.get("recurrence"):
            continue
        if (
            not row.get("id")
            or not row.get("title")
            or not row.get("link", "").startswith(("https://", "http://"))
        ):
            continue
        try:
            datetime.strptime(start, "%Y-%m-%d")
        except ValueError:
            continue
        time = row.get("time", "").strip()
        occurrence = {
            "external_id": str(row["id"]),
            "timezone": "Europe/Madrid",
            "time_kind": "date_only",
            "local_date": start,
        }
        if time:
            try:
                naive = datetime.strptime(start + " " + time, "%Y-%m-%d %H:%M")
                a, b = naive.replace(tzinfo=zone, fold=0), naive.replace(tzinfo=zone, fold=1)
                if (
                    a.utcoffset() != b.utcoffset()
                    or a.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != naive
                ):
                    continue
                occurrence = {
                    "external_id": str(row["id"]),
                    "timezone": "Europe/Madrid",
                    "time_kind": "known",
                    "start_at": a.astimezone(timezone.utc).isoformat(),
                }
            except ValueError:
                continue
        result.append(
            {
                "external_id": str(row["id"]),
                "category_code": next(
                    (
                        code
                        for code, types in CATEGORY_TYPES.items()
                        if row.get("@type", "").rsplit("/", 1)[-1] in types
                    ),
                    "other",
                ),
                "locality": row.get("address", {}).get("area", {}).get("locality"),
                "hash": hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest(),
                "title": html.unescape(row["title"]),
                "description": html.unescape(row.get("description") or "") or None,
                "url": row["link"],
                "venue": html.unescape(row.get("event-location") or "") or None,
                "occurrence": occurrence,
            }
        )
    return result


if __name__ == "__main__":
    print(json.dumps(normalize(json.load(sys.stdin)["@graph"]), ensure_ascii=False))
