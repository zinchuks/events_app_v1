"""Synthetic adapter edge cases; these are not proof of live-source quality."""

import copy
import io
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from .s6 import helsinki, madrid, original_url, point, text, toronto, toronto_prefix, validate_url

NOW = datetime(2026, 10, 2, 12, tzinfo=timezone.utc)
TORONTO = {
    "id": "fixture-session-1",
    "calendar_id": "fixture-series",
    "calendar_date": "2026-10-04T10:00:00-04:00",
    "calendar_time_of_day": "Day Event",
    "event_status": "Approved",
    "event_name": "Fixture exhibition",
    "event_description": "<p>Fixture text</p><script>ignore</script>",
    "event_category": ["Arts/Exhibits"],
    "free_event": "Yes",
    "event_locations": [
        {
            "location_name": "Fixture venue",
            "location_address": "Toronto M5V 1H2 Canada",
            "location_gps": '[{"gps_lat":"43.64","gps_lng":"-79.38"}]',
        }
    ],
}
HELSINKI = {
    "id": "fixture:session-1",
    "event_status": "EventScheduled",
    "name": {"fi": "Fixture fi", "en": "Fixture en"},
    "description": {"fi": "Original fixture", "en": "Provider translation fixture"},
    "start_time": "2026-10-04T17:00:00Z",
    "end_time": "2026-10-04T18:00:00Z",
    "location": {
        "name": {"fi": "Fixture venue"},
        "position": {"coordinates": [24.93, 60.17]},
        "divisions": [{"ocd_id": "ocd-division/country:fi/kunta:helsinki"}],
    },
    "keywords": [{"name": {"en": "concerts"}}],
    "offers": [{"is_free": False, "price": "24–54 EUR"}],
}
MADRID = {
    "id": "fixture-1",
    "title": "Fixture",
    "description": "<p>Hello</p>",
    "link": "https://www.madrid.es/fixture",
    "dtstart": "2026-10-04",
    "dtend": "2026-10-04",
    "time": "19:00",
    "free": 1,
    "address": {"area": {"locality": "MADRID"}},
    "location": {"longitude": -3.7, "latitude": 40.4},
}


class S6AdapterTests(unittest.TestCase):
    def test_explicit_cancelled_status(self):
        self.assertEqual(
            helsinki({**HELSINKI, "event_status": "EventCancelled"}, NOW)["status"], "cancelled"
        )

    def test_organizer_link_only_explicit_public_https(self):
        for url in [
            "example.com",
            "javascript:alert(1)",
            "http://example.com/",
            "https://127.0.0.1/",
            "https://user@site.example/",
            "https://site.local/",
        ]:
            self.assertEqual(original_url(url, "fallback"), "fallback")
        self.assertEqual(original_url("https://example.com", "fallback"), "https://example.com/")

    def test_pinned_real_source_extraction(self):
        fixture = json.loads((Path(__file__).parent / "fixtures/s6-extraction.json").read_text())
        now = datetime.fromisoformat(fixture["normalization_clock"])
        for sample in fixture["samples"]:
            with self.subTest(source=sample["source"]):
                actual = (
                    madrid([sample["raw"]])[0]
                    if sample["source"] == "madrid"
                    else toronto(sample["raw"], now)
                    if sample["source"] == "toronto"
                    else helsinki(sample["raw"], now)
                )
                self.assertEqual(actual, sample["expected"])

    def test_actual_fields_madrid(self):
        row = madrid([MADRID])[0]
        self.assertEqual([row["price"], row["currency"], row["location"]], [0, "EUR", [-3.7, 40.4]])
        self.assertEqual(row["occurrences"][0]["start_at"], "2026-10-04T17:00:00+00:00")
        self.assertNotIn("event_language", row)

    def test_unknown_and_range_price(self):
        for price in ["", "from 3 euros", "3–5 euros", "free", "3 euros / person"]:
            row = madrid([{**MADRID, "free": 0, "price": price}])[0]
            self.assertIsNone(row["price"])
        self.assertEqual(madrid([{**MADRID, "free": 0, "price": "3,50 euros"}])[0]["price"], 3.5)
        self.assertIsNone(helsinki(HELSINKI, NOW)["price"])

    def test_boolean_is_not_numeric_price_flag(self):
        self.assertIsNone(madrid([{**MADRID, "free": True}])[0]["price"])

    def test_wgs84_unknown(self):
        for pair in [(181, 0), (0, 91), (float("nan"), 0), (None, 0), (True, 0)]:
            self.assertIsNone(point(*pair))
        self.assertEqual(point(0, 0), [0, 0])

    def test_safe_html_text(self):
        self.assertEqual(
            text("<p>Hello &amp; world</p><script>run()</script><style>evil</style>"),
            "Hello & world",
        )

    def test_separate_toronto_sessions(self):
        a = toronto(TORONTO, NOW)
        b = toronto(
            {**TORONTO, "id": "fixture-session-2", "calendar_date": "2026-10-05T10:00:00-04:00"},
            NOW,
        )
        self.assertNotEqual(a["external_id"], b["external_id"])
        self.assertEqual(a["series_key"], b["series_key"])
        self.assertEqual(a["category_code"], "culture")
        self.assertEqual(a["territory"], "catalog:city:CA:Toronto")

    def test_no_multiple_venues_collapsed(self):
        self.assertIsNone(
            toronto({**TORONTO, "event_locations": TORONTO["event_locations"] * 2}, NOW)
        )

    def test_explicit_timezone_required(self):
        self.assertIsNone(toronto({**TORONTO, "calendar_date": "2026-10-04T10:00:00"}, NOW))

    def test_parent_not_expanded(self):
        for parent in [{"sub_events": [{"@id": "child"}]}, {"super_event_type": "recurring"}]:
            self.assertIsNone(helsinki({**HELSINKI, **parent}, NOW))

    def test_actual_municipality_required(self):
        row = copy.deepcopy(HELSINKI)
        row["location"]["divisions"] = []
        self.assertIsNone(helsinki(row, NOW))

    def test_source_translation_no_inferred_event_language(self):
        row = helsinki(HELSINKI, NOW)
        self.assertEqual(row["translations"][0]["locale"], "en")
        self.assertEqual(row["original_language"], "fi")
        self.assertNotIn("event_language", row)
        self.assertEqual(row["category_code"], "music")

    def test_date_only_today_no_midnight_fabricated(self):
        row = helsinki({**HELSINKI, "start_time": "2026-10-02"}, NOW)
        self.assertEqual(row["occurrences"][0]["time_kind"], "date_only")
        self.assertNotIn("start_at", row["occurrences"][0])

    def test_refresh_stable_hash_ignores_contact(self):
        self.assertEqual(
            toronto(TORONTO, NOW)["hash"],
            toronto({**TORONTO, "event_email": "fixture-only@example.invalid"}, NOW)["hash"],
        )
        self.assertNotEqual(
            toronto(TORONTO, NOW)["hash"],
            toronto({**TORONTO, "event_name": "Changed"}, NOW)["hash"],
        )

    def test_feed_complete_and_bounded(self):
        payload = json.dumps({"value": [TORONTO, TORONTO]}).encode()
        rows, metrics = toronto_prefix(io.BytesIO(payload), NOW)
        self.assertEqual(len(rows), 2)
        self.assertFalse(metrics["bounded_subset"])
        rows, metrics = toronto_prefix(io.BytesIO(payload), NOW, row_cap=1)
        self.assertEqual(len(rows), 1)
        self.assertTrue(metrics["bounded_subset"])

    def test_unexpected_truncation_is_failure(self):
        payload = json.dumps({"value": [TORONTO]}).encode()[:-2]
        with self.assertRaises(ValueError):
            toronto_prefix(io.BytesIO(payload), NOW)

    def test_redirect_hosts_allowlist(self):
        for url in [
            "http://api.hel.fi/x",
            "https://localhost/x",
            "https://api.hel.fi.evil/x",
            "https://user@api.hel.fi/x",
            "https://api.hel.fi:8443/x",
        ]:
            with self.assertRaises(ValueError):
                validate_url(url)
        validate_url("https://api.hel.fi/linkedevents/v1/")


if __name__ == "__main__":
    unittest.main()
