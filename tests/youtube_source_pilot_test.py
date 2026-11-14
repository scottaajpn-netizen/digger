import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("pilot", Path(__file__).resolve().parents[1] / "scripts/youtube-source-pilot.py")
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


class PilotTests(unittest.TestCase):
    def test_cache_is_sanitized_and_offline_never_calls_provider(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder)
            raw = {"videoId": "12345678901", "title": "Title", "artists": [{"name": "Artist"}], "feedbackTokens": {"add": "secret"}, "url": "private-playback"}
            first, status = pilot.cached_call(cache, "test", lambda: [raw])
            self.assertEqual(status, "network")
            self.assertNotIn("secret", next(cache.glob("*.json")).read_text())
            second, status = pilot.cached_call(cache, "test", lambda: self.fail("network called"), True)
            self.assertEqual(status, "cache")
            self.assertEqual(first, second)
            self.assertEqual(pilot.cached_call(cache, "missing", lambda: self.fail("network called"), True), ([], "cache-miss"))

    def test_identity_does_not_choose_homonym_partial_credit_or_remix(self):
        seed = {"title": "Song", "artists": ["Long Artist", "Guest Artist"]}
        def track(title="Song", artists=None, video="12345678901"):
            return pilot.sanitize_track({"videoId": video, "title": title, "artists": [{"name": a} for a in (artists or seed["artists"])]})
        self.assertIsNotNone(pilot.identify(seed, [track()]))
        self.assertIsNone(pilot.identify(seed, [track(artists=["Long Artist"])]))
        self.assertIsNone(pilot.identify(seed, [track(title="Song (Remix)")]))
        self.assertIsNone(pilot.identify(seed, [track(), track(video="12345678902")]))
        self.assertIsNone(pilot.identify({"title": "Song", "artists": ["Mia"]}, [track(artists=["Mia"])]))

    def test_failures_are_not_cached_or_reported_as_missing_music(self):
        class BrokenAPI:
            def search(self, *args, **kwargs):
                raise ConnectionError("secret request detail")
        with tempfile.TemporaryDirectory() as folder:
            results = pilot.run_pilot(BrokenAPI(), Path(folder))
            self.assertTrue(all(row["searchStatus"] == "failed" for row in results))
            self.assertTrue(all(row["error"] == "ConnectionError" for row in results))
            self.assertNotIn("secret", str(results))
            self.assertFalse((Path(folder) / "cache").exists())


if __name__ == "__main__":
    unittest.main()
