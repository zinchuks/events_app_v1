import unittest

from ingestion.madrid import normalize


class MadridTests(unittest.TestCase):
    def row(self, date="2026-10-01", time="18:00"):
        return {
            "id": "1",
            "title": "Real source test",
            "link": "https://www.madrid.es/event",
            "dtstart": date + " 00:00:00",
            "dtend": date + " 23:59:00",
            "time": time,
        }

    def test_timezone_and_unknown_price(self):
        item = normalize([self.row()])[0]
        self.assertEqual(item["occurrence"]["start_at"], "2026-10-01T16:00:00+00:00")
        self.assertNotIn("price", item)

    def test_missing_time_preserves_date(self):
        item = normalize([self.row(time="")])[0]["occurrence"]
        self.assertEqual(item["time_kind"], "date_only")
        self.assertNotIn("start_at", item)

    def test_dst_ambiguity_and_gap_are_not_invented(self):
        self.assertEqual(normalize([self.row("2026-10-25", "02:30")]), [])
        self.assertEqual(normalize([self.row("2026-03-29", "02:30")]), [])

    def test_series_and_ranges_are_skipped(self):
        series = self.row()
        series["recurrence"] = {"days": "MO"}
        interval = self.row()
        interval["dtend"] = "2026-10-02 23:59:00"
        self.assertEqual(normalize([series, interval]), [])

    def test_categories_use_provider_type_and_unknown_is_other(self):
        row = self.row()
        row["@type"] = "https://datos.madrid.es/egob/kos/actividades/Musica"
        row["address"] = {"area": {"locality": "MADRID"}}
        row["title"] = "A&amp;J"
        item = normalize([row])[0]
        self.assertEqual(item["category_code"], "music")
        self.assertEqual(item["locality"], "MADRID")
        self.assertEqual(item["title"], "A&J")
        row["@type"] = "unknown"
        self.assertEqual(normalize([row])[0]["category_code"], "other")
