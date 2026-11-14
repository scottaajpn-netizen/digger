"""Read-only, unauthenticated source experiment. Never imported by Digger.

Install the optional dependency: python -m pip install -r scripts/requirements-youtube-pilot.txt
Run from the repository root: python scripts/youtube-source-pilot.py
Use --offline to inspect cached metadata without any network request.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import time
import unicodedata

SEEDS = [
    {"id": "pleine-foret", "title": "Pleine Forêt", "artists": ["Léon Phal", "Jungle Jack"]},
    {"id": "mia", "title": "Love Me Right", "artists": ["Mia"], "album": "Creatures Of The Night"},
    {"id": "junior-jazz", "title": "Rekere Ke Rekere", "artists": ["Junior Jazz"]},
    {"id": "avenoir", "title": "AFTER HOURS", "artists": ["Avenoir"]},
    {"id": "rebe", "title": "Ramito de violetas", "artists": ["Rebe"]},
]
TTL = 7 * 24 * 3600


def normalize(value):
    value = "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^\w]+", " ", value.lower()).split())


def sanitize_track(raw):
    """Keep public metadata only; no playback URL, cookie or feedback token."""
    if not isinstance(raw, dict):
        return None
    video = raw.get("videoId", "")
    title = raw.get("title")
    if not isinstance(video, str) or not re.fullmatch(r"[\w-]{11}", video) or not isinstance(title, str):
        return None
    artists = [{"name": a["name"][:300], "id": a.get("id")}
               for a in raw.get("artists", []) if isinstance(a, dict) and isinstance(a.get("name"), str)]
    album = raw.get("album")
    return {"videoId": video, "title": title[:300], "artists": artists[:12],
            "album": album.get("name") if isinstance(album, dict) else None,
            "durationSeconds": raw.get("duration_seconds"),
            "url": f"https://music.youtube.com/watch?v={video}", "source": "youtube-music-unofficial"}


def identify(seed, tracks):
    expected = {normalize(a) for a in seed["artists"]}
    matches = [t for t in tracks if normalize(t["title"]) == normalize(seed["title"])
               and {normalize(a["name"]) for a in t["artists"]} == expected]
    if seed.get("album"):
        matches = [t for t in matches if normalize(t.get("album") or "") == normalize(seed["album"])]
    if len({t["videoId"] for t in matches}) != 1:
        return None
    # No automatic radio from an uncorroborated short-name homonym.
    if any(len(normalize(a).replace(" ", "")) <= 5 for a in seed["artists"]) and not seed.get("album"):
        return None
    return matches[0]


def cached_call(cache_dir, key, operation, offline=False):
    file = cache_dir / (hashlib.sha256(key.encode()).hexdigest() + ".json")
    if file.exists():
        try:
            cached = json.loads(file.read_text(encoding="utf8"))
            if time.time() - cached["savedAt"] < TTL:
                return cached["tracks"], "cache"
        except (ValueError, KeyError, TypeError):
            pass
    if offline:
        return [], "cache-miss"
    tracks = [t for raw in operation() if (t := sanitize_track(raw)) is not None][:20]
    cache_dir.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps({"savedAt": time.time(), "tracks": tracks}, ensure_ascii=False), encoding="utf8")
    return tracks, "network"


def run_pilot(api, output, offline=False, radio=False):
    output.mkdir(parents=True, exist_ok=True)
    cache_dir = output / "cache"
    results = []
    for seed in SEEDS:
        started = time.monotonic()
        row = {"seed": seed, "search": [], "radio": [], "identity": "unconfirmed",
               "radioStatus": "not-requested", "humanAppreciation": None, "incrementalCandidates": None}
        query = seed["title"] + " " + " ".join(seed["artists"])
        try:
            tracks, cache = cached_call(cache_dir, "search-v1:" + query,
                lambda: api.search(query, filter="songs", limit=10, ignore_spelling=True), offline)
            row.update(search=tracks, searchStatus=cache)
            match = identify(seed, tracks)
            # Metadata agreement is a hypothesis for review, never a verified MBID.
            if match:
                row["identity"] = "metadata-match-for-review"
                row["matchedVideoId"] = match["videoId"]
            if radio and match:
                candidates, status = cached_call(cache_dir, "radio-v1:" + match["videoId"],
                    lambda: api.get_watch_playlist(videoId=match["videoId"], radio=True, limit=10).get("tracks", []), offline)
                seen = {match["videoId"]}
                for track in candidates:
                    if track["videoId"] not in seen:
                        row["radio"].append(track)
                        seen.add(track["videoId"])
                row["radioStatus"] = status
            elif radio:
                row["radioStatus"] = "identity-not-established"
        except Exception as error:
            # Exceptions may contain request details: persist only their class.
            row["error"] = type(error).__name__
            row.setdefault("searchStatus", "failed")
        row["seconds"] = round(time.monotonic() - started, 2)
        results.append(row)
        print(f'{seed["id"]}: {row["searchStatus"]}, {len(row["search"])} results, {row["identity"]}', flush=True)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--radio", action="store_true", help="Also inspect radios for unambiguous metadata matches")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = root / ".digger" / "youtube-source-pilot"
    api, session = None, None
    version = None
    if not args.offline:
        import requests
        from ytmusicapi import YTMusic

        class BoundedSession(requests.Session):
            def __init__(self):
                super().__init__()
                self.calls = 0
                self.deadline = time.monotonic() + 100
                self.last_request = 0

            def request(self, method, url, **kwargs):
                if self.calls >= 16 or time.monotonic() >= self.deadline:
                    raise TimeoutError("Pilot request budget exhausted")
                time.sleep(max(0, 0.5 - (time.monotonic() - self.last_request)))
                self.last_request = time.monotonic()
                self.calls += 1
                kwargs["timeout"] = 8
                return super().request(method, url, **kwargs)

        session = BoundedSession()
        # No OAuth, browser headers or account writes. English is intentional:
        # ytmusicapi parses localized response headings.
        api = YTMusic(requests_session=session, language="en")
        version = importlib.metadata.version("ytmusicapi")
    try:
        results = run_pilot(api, output, args.offline, args.radio)
    finally:
        if session:
            session.close()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    report = {"version": 1, "generatedAt": stamp, "ytmusicapi": version, "offline": args.offline,
              "httpRequests": session.calls if session else 0,
              "productionIntegration": False, "baselineComparison": "not-performed", "results": results}
    (output / "latest.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf8")
    (output / f"run-{stamp}.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf8")
    lines = ["# YouTube Music — essai de source", "",
             "Aucune intégration au moteur. Correspondance de métadonnées ≠ identité certifiée ou découverte appréciée.", "",
             f'Requêtes HTTP : {report["httpRequests"]}. Comparaison au pool Digger : non effectuée.', "",
             "| Départ | Recherche | Résultats | Identité | Radio |", "|---|---|---:|---|---:|"]
    for row in results:
        lines.append(f'| {row["seed"]["id"]} | {row["searchStatus"]} | {len(row["search"])} | {row["identity"]} | {len(row["radio"])} |')
    (output / "latest.md").write_text("\n".join(lines) + "\n", encoding="utf8")
    print(f"Report: {output / 'latest.md'}")


if __name__ == "__main__":
    main()
