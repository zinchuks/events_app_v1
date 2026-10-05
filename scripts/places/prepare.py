"""GeoNames full dump -> bounded-memory local COPY files. No network or DB writes."""

import argparse
import csv
import hashlib
import io
import json
import re
import sqlite3
import unicodedata
import zipfile
from pathlib import Path

EXCLUDED = {"PPLH", "PPLCH", "PPLQ", "PPLW"}
ADM = {f"ADM{i}" for i in range(1, 6)}


def normalized(value):
    value = value.casefold().translate(
        str.maketrans({"æ": "ae", "œ": "oe", "ø": "o", "ł": "l"})
    )
    return "".join(
        c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)
    )


def parse_place(fields):
    if len(fields) != 19:
        raise ValueError("Expected 19 GeoNames fields")
    if not re.fullmatch(r"[A-Z]{2}", fields[8]):
        return None
    code = fields[7]
    if fields[6] == "P" and code not in EXCLUDED:
        kind = "city"  # Legacy rule area type; feature_code preserves settlement semantics.
    elif fields[6] == "A" and code in ADM:
        kind = "admin"
    else:
        return None
    gid, lat, lon, population = (
        int(fields[0]),
        float(fields[4]),
        float(fields[5]),
        int(fields[14]),
    )
    if (
        gid <= 0
        or not fields[1]
        or not -90 <= lat <= 90
        or not -180 <= lon <= 180
        or population < 0
    ):
        raise ValueError("Invalid place facts")
    return [
        gid,
        kind,
        code,
        fields[8],
        fields[1],
        lat,
        lon,
        population,
        fields[17],
        fields[10:14],
        fields[18],
    ]


def zip_rows(path, member):
    with zipfile.ZipFile(path) as archive:
        info = archive.getinfo(member)
        if info.file_size > 8 * 1024**3:
            raise ValueError("Unexpectedly large dump")
        with archive.open(member) as stream:
            for line in io.TextIOWrapper(stream, encoding="utf-8"):
                yield line.rstrip("\r\n").split("\t")


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prepare(directory):
    directory = Path(directory)
    sqlite_path = directory / "localized.sqlite"
    db = sqlite3.connect(sqlite_path)
    db.execute(
        "CREATE TABLE IF NOT EXISTS names(gid INTEGER,lang TEXT,name TEXT,score INTEGER,PRIMARY KEY(gid,lang))"
    )
    db.execute("DELETE FROM names")
    batch = []
    for row in zip_rows(directory / "alternateNamesV2.zip", "alternateNamesV2.txt"):
        if len(row) < 8:
            raise ValueError("Invalid alternate name")
        if (
            row[2] not in {"uk", "en", "es"}
            or row[7] == "1"
            or row[6] == "1"
            or not row[3]
        ):
            continue
        # Prefer preferred current names; deterministic smallest alternate ID tie.
        score = (0 if row[4] == "1" else 1) * 10**12 + int(row[0])
        batch.append((int(row[1]), row[2], row[3], score))
        if len(batch) >= 5000:
            db.executemany(
                "INSERT INTO names VALUES(?,?,?,?) ON CONFLICT(gid,lang) DO UPDATE SET name=excluded.name,score=excluded.score WHERE excluded.score<names.score",
                batch,
            )
            batch.clear()
    db.executemany(
        "INSERT INTO names VALUES(?,?,?,?) ON CONFLICT(gid,lang) DO UPDATE SET name=excluded.name,score=excluded.score WHERE excluded.score<names.score",
        batch,
    )
    db.commit()
    countries = {}
    for line in (directory / "countryInfo.txt").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        f = line.split("\t")
        if len(f) < 17 or not re.fullmatch(r"[A-Z]{2}", f[0]):
            raise ValueError("Invalid country info")
        if f[16]:
            countries[f[0]] = (int(f[16]), f[4])
    admins = {}
    ambiguous = set()
    count, inspected, country_count = 0, 0, 0
    code_counts = {}
    with (directory / "places.csv").open("w", newline="") as output:
        writer = csv.writer(output, lineterminator="\n")
        for f in zip_rows(directory / "allCountries.zip", "allCountries.txt"):
            inspected += 1
            row = parse_place(f)
            if f[8] in countries and int(f[0]) == countries[f[8]][0]:
                row = [
                    int(f[0]),
                    "country",
                    f[7],
                    f[8],
                    countries[f[8]][1],
                    float(f[4]),
                    float(f[5]),
                    int(f[14]),
                    f[17],
                    [],
                    f[18],
                ]
                country_count += 1
            if row is None:
                continue
            gid, kind, code, country, name, lat, lon, pop, zone, path, modified = row
            names = {
                "und": name,
                **dict(db.execute("SELECT lang,name FROM names WHERE gid=?", (gid,))),
            }
            # Main dump aliases include names in many languages, not a fabricated translation.
            search = normalized(" ".join([name, f[2], f[3], *names.values(), country]))
            writer.writerow(
                [
                    gid,
                    kind,
                    code,
                    country,
                    name,
                    json.dumps(names, ensure_ascii=False),
                    lat,
                    lon,
                    pop,
                    zone or None,
                    json.dumps(path),
                    search,
                    modified,
                ]
            )
            if kind == "admin":
                depth = int(code[-1])
                key = (country, *path[:depth])
                if key in admins and admins[key] != gid:
                    ambiguous.add(key)
                    admins[key] = None
                elif key not in ambiguous:
                    admins[key] = gid
            count += 1
            code_counts[code] = code_counts.get(code, 0) + 1
            if count % 250000 == 0:
                print(
                    json.dumps({"prepared": count, "inspected": inspected}), flush=True
                )
    db.close()
    if count < 1000000 or country_count < 200:
        raise ValueError("Not a full worldwide populated-place dump")
    # Parent refs resolved from source admin codes, never nearest-place inference.
    with (directory / "parents.csv").open("w", newline="") as output:
        writer = csv.writer(output, lineterminator="\n")
        for f in zip_rows(directory / "allCountries.zip", "allCountries.txt"):
            row = parse_place(f)
            if row is None:
                continue
            gid, kind, code, country, _, _, _, _, _, path, _ = row
            depth = int(code[-1]) - 1 if kind == "admin" else 4
            parent = next(
                (
                    admins[(country, *path[:d])]
                    for d in range(depth, 0, -1)
                    if all(path[:d]) and admins.get((country, *path[:d])) is not None
                ),
                countries.get(country, (None,))[0],
            )
            if parent == gid:
                raise ValueError("Cyclic parent")
            writer.writerow([gid, parent])
    evidence = {
        "provider": "GeoNames",
        "license": "CC BY 4.0",
        "full_dump": True,
        "population_threshold": None,
        "excluded_codes": sorted(EXCLUDED),
        "inspected": inspected,
        "places": count,
        "countries": country_count,
        "feature_codes": code_counts,
        "ambiguous_admin_keys": len(ambiguous),
        "files": {
            name: sha(directory / name)
            for name in ["allCountries.zip", "alternateNamesV2.zip", "countryInfo.txt"]
        },
    }
    (directory / "manifest.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    prepare(parser.parse_args().directory)
