import unittest

from prepare import normalized, parse_place


def row(code="PPL", population="0"):
    return [
        "123",
        "Село",
        "Selo",
        "Село,Village",
        "49",
        "24",
        "P",
        code,
        "UA",
        "",
        "01",
        "02",
        "",
        "",
        population,
        "",
        "",
        "Europe/Kyiv",
        "2026-10-05",
    ]


class PrepareTests(unittest.TestCase):
    def test_zero_population_village_is_included_without_invented_city_type(self):
        result = parse_place(row())
        self.assertEqual(result[2], "PPL")
        self.assertEqual(result[7], 0)

    def test_missing_feature_code_preserves_source_point_without_invented_subtype(self):
        result = parse_place(row(""))
        self.assertEqual(result[1], "city")
        self.assertEqual(result[2], "")

    def test_inactive_historical_places_excluded(self):
        for code in ["PPLQ", "PPLW", "PPLH", "PPLCH"]:
            self.assertIsNone(parse_place(row(code)))

    def test_active_capital_and_section_are_preserved(self):
        for code in ["PPLC", "PPLX", "PPLA", "PPLR"]:
            self.assertEqual(parse_place(row(code))[2], code)

    def test_unknown_country_not_invented(self):
        data = row()
        data[8] = ""
        self.assertIsNone(parse_place(data))

    def test_invalid_coordinates_and_population_rejected(self):
        for index, value in [(4, "91"), (5, "nan"), (14, "-1"), (0, "0")]:
            data = row()
            data[index] = value
            with self.assertRaises(ValueError):
                parse_place(data)

    def test_admin_keeps_hierarchy(self):
        data = row("ADM2")
        data[6] = "A"
        result = parse_place(data)
        self.assertEqual(result[1], "admin")
        self.assertEqual(result[9], ["01", "02", "", ""])

    def test_other_geographic_features_not_mislabeled_as_settlements(self):
        data = row("MT")
        data[6] = "T"
        self.assertIsNone(parse_place(data))

    def test_accent_cyrillic_and_case_normalization(self):
        self.assertEqual(normalized("São Łódź КиЇв"), "sao lodz киів")


if __name__ == "__main__":
    unittest.main()
