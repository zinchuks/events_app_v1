"""Local-only atomic gazetteer replacement; stable rule territory IDs are never deleted."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

CONTAINER = "supabase_db_event-radar-local"


def psql(sql):
    result = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            CONTAINER,
            "psql",
            "-X",
            "-q",
            "-t",
            "-A",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
        ],
        input=sql,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout.strip()


def run(directory):
    status = json.loads(
        subprocess.run(
            ["supabase", "status", "-o", "json"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    if status.get("API_URL") != "http://127.0.0.1:54321":
        raise ValueError("Own local stack required")
    directory = Path(directory)
    evidence = json.loads((directory / "manifest.json").read_text())
    if not evidence.get("full_dump") or evidence["places"] < 1000000:
        raise ValueError("Full preparation required")
    fingerprint = hashlib.sha256(
        json.dumps(evidence["files"], sort_keys=True).encode()
    ).hexdigest()
    if (
        psql(
            f"select exists(select 1 from public.place_imports where fingerprint='{fingerprint}');"
        )
        == "t"
    ):
        print(json.dumps({"already_imported": True, "fingerprint": fingerprint}))
        return
    # No shell interpolation/COPY file access in the container. CSV streamed via stdin.
    with (directory / "import.log").open("w") as log:
        proc = subprocess.Popen(
            [
                "docker",
                "exec",
                "-i",
                CONTAINER,
                "psql",
                "-X",
                "-q",
                "-U",
                "postgres",
                "-d",
                "postgres",
                "-v",
                "ON_ERROR_STOP=1",
            ],
            stdin=subprocess.PIPE,
            stdout=log,
            stderr=log,
        )

        def write(value):
            proc.stdin.write(value.encode())

        try:
            write(
                "BEGIN;select pg_advisory_xact_lock(hashtextextended('global-geonames-import',0));SET LOCAL statement_timeout='0';SET LOCAL work_mem='256MB';SET LOCAL maintenance_work_mem='256MB';\n"
            )
            write(
                "CREATE TEMP TABLE stage_places(gid bigint primary key,kind text,code text,country text,name text,names jsonb,lat double precision,lon double precision,pop bigint,zone text,path jsonb,search text,modified date) ON COMMIT DROP;\nCOPY stage_places FROM STDIN WITH(FORMAT csv);\n"
            )
            with (directory / "places.csv").open("rb") as data:
                while chunk := data.read(1024 * 1024):
                    proc.stdin.write(chunk)
            write(
                "\\.\nCREATE TEMP TABLE stage_parents(gid bigint primary key,parent bigint) ON COMMIT DROP;\nCOPY stage_parents FROM STDIN WITH(FORMAT csv);\n"
            )
            with (directory / "parents.csv").open("rb") as data:
                while chunk := data.read(1024 * 1024):
                    proc.stdin.write(chunk)
            write("\\.\n")
            write(
                "DO $$ BEGIN IF (select count(*) from stage_places)<1000000 THEN RAISE EXCEPTION 'Incomplete worldwide dump'; END IF; IF EXISTS(select 1 from stage_parents p left join stage_places s on s.gid=p.parent where p.parent is not null and s.gid is null) THEN RAISE EXCEPTION 'Missing parent'; END IF; END $$;\n"
            )
            # Atomic rebuild; readers can wait for the table lock until commit.
            write(
                "DROP INDEX public.place_search_idx;\nINSERT INTO public.place_catalog(geoname_id,kind,feature_code,country_code,name,names,latitude,longitude,population,timezone,admin_path,parent_geoname_id,search_text,modified_on) SELECT s.gid,s.kind,coalesce(s.code,''),s.country,s.name,s.names,s.lat,s.lon,s.pop,nullif(s.zone,''),array(select jsonb_array_elements_text(s.path)),CASE WHEN parent.code='PCLH' THEN NULL ELSE p.parent END,s.search,s.modified FROM stage_places s LEFT JOIN stage_parents p on p.gid=s.gid LEFT JOIN stage_places parent ON parent.gid=p.parent WHERE s.code IS DISTINCT FROM 'PCLH' ON CONFLICT(geoname_id) DO UPDATE SET name=excluded.name,names=excluded.names,kind=excluded.kind,feature_code=excluded.feature_code,country_code=excluded.country_code,latitude=excluded.latitude,longitude=excluded.longitude,population=excluded.population,timezone=excluded.timezone,admin_path=excluded.admin_path,parent_geoname_id=excluded.parent_geoname_id,search_text=excluded.search_text,modified_on=excluded.modified_on,active=true WHERE (public.place_catalog.name,public.place_catalog.names,public.place_catalog.kind,public.place_catalog.feature_code,public.place_catalog.country_code,public.place_catalog.latitude,public.place_catalog.longitude,public.place_catalog.population,public.place_catalog.timezone,public.place_catalog.admin_path,public.place_catalog.parent_geoname_id,public.place_catalog.search_text,public.place_catalog.modified_on,public.place_catalog.active) IS DISTINCT FROM (excluded.name,excluded.names,excluded.kind,excluded.feature_code,excluded.country_code,excluded.latitude,excluded.longitude,excluded.population,excluded.timezone,excluded.admin_path,excluded.parent_geoname_id,excluded.search_text,excluded.modified_on,true);\nUPDATE public.place_catalog c SET active=false WHERE c.active AND NOT EXISTS(select 1 FROM stage_places s WHERE s.gid=c.geoname_id AND s.code IS DISTINCT FROM 'PCLH');\nCREATE INDEX place_search_idx ON public.place_catalog USING gin(search_text extensions.gin_trgm_ops);\n"
            )
            # Explicit existing city crosswalk, validated against source country and source names.
            write(
                "DO $$ DECLARE link record; BEGIN FOR link IN SELECT * FROM (VALUES ('madrid:municipio:Madrid',3117735,'ES','Madrid'),('catalog:city:ES:Barcelona',3128760,'ES','Barcelona'),('catalog:city:UA:Kyiv',703448,'UA','Kyiv'),('catalog:city:FR:Paris',2988507,'FR','Paris'),('catalog:city:CA:Toronto',6167865,'CA','Toronto'),('catalog:city:FI:Helsinki',658225,'FI','Helsinki')) x(external_id,gid,country,name) LOOP IF NOT EXISTS(select 1 from public.place_catalog c where c.geoname_id=link.gid and c.kind='city' and c.country_code=link.country and c.search_text like '%'||public.place_normalize(link.name)||'%') THEN RAISE EXCEPTION 'Crosswalk source identity mismatch'; END IF; UPDATE public.territories SET geoname_id=link.gid,place_feature_code=(select feature_code from public.place_catalog where geoname_id=link.gid) WHERE external_id=link.external_id and country_code=link.country and not is_demo; END LOOP; END $$;\n"
            )
            write(
                "UPDATE public.territories t SET geoname_id=c.geoname_id,place_feature_code=c.feature_code FROM public.place_catalog c WHERE c.kind='country' AND t.external_id='iso3166:'||c.country_code AND t.kind='country' AND NOT t.is_demo;\n"
            )
            literal = json.dumps(evidence).replace("'", "''")
            write(
                f"INSERT INTO public.place_imports(fingerprint,evidence) VALUES('{fingerprint}','{literal}'::jsonb);\nANALYZE public.place_catalog;COMMIT;\n"
            )
            proc.stdin.close()
            if proc.wait() != 0:
                raise RuntimeError(
                    "Atomic import failed; inspect local import.log (no credentials)"
                )
        except BaseException:
            try:
                if not proc.stdin.closed:
                    proc.stdin.close()
            except BrokenPipeError:
                pass
            proc.wait()
            raise
    print(
        json.dumps(
            {
                "imported": True,
                "fingerprint": fingerprint,
                "places": int(
                    psql("select count(*) from public.place_catalog where active;")
                ),
                "owner_rows_deleted": False,
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    run(parser.parse_args().directory)
