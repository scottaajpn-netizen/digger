#!/usr/bin/env python3
"""Build-time adapter: upstream Crate Digger 2.2 -> a one-track Sukotto MPC skin.

This deliberately patches a clean checkout instead of modifying the installed
Crate Digger VST.  It keeps upstream's MIT sources and audio engine, adds one
append-only VST trigger, and builds a DIFFERENT plugin name and UID.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

NAME = "Sukotto Digger"
UID = "SkDg"


def replace_once(text: str, old: str, new: str, where: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{where}: expected exactly one patch anchor, found {count}: {old[:90]!r}")
    return text.replace(old, new, 1)


def patch(root: Path) -> None:
    params_path = root / "vst/params.json"
    lock_path = root / "vst/params.lock"
    cpp_path = root / "src/sdk/CrateDiggerPlugin.cpp"
    skin_path = root / "tools/make_tui.py"
    build_path = root / "build-sdk.sh"
    pack_path = root / "tools/package.py"
    meta_path = root / "plugin.json"

    for path in (params_path, lock_path, cpp_path, skin_path, build_path, pack_path, meta_path):
        if not path.is_file():
            raise RuntimeError(f"Missing upstream file: {path}")

    meta = json.loads(meta_path.read_text())
    if meta.get("uid") != "CrDg" or meta.get("name") != "Crate Digger":
        raise RuntimeError("Expected a fresh upstream Crate Digger source checkout")
    meta.update({
        "name": NAME,
        "uid": UID,
        "format": "vst2",
        "description": "Single-record digging on MPC; adapted from sd88me Crate Digger.",
        "url": "https://github.com/scottaajpn-netizen/digger",
    })
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")

    params = json.loads(params_path.read_text())
    keys = [p["key"] for p in params["params"]]
    old_lock = [x.strip() for x in lock_path.read_text().splitlines() if x.strip()]
    if keys != old_lock or "next_track" in keys:
        raise RuntimeError("Unexpected upstream parameter table: do not reorder VST parameters")
    params["name"], params["uid"] = NAME, UID
    params["params"].append({"key": "next_track", "name": "Next Record", "type": "trigger"})
    params["params"].append({"key": "start_track", "name": "Back to Start", "type": "trigger"})
    for k in range(32):
        params["params"].append({"key": f"wave_{k:02d}", "name": f"Waveform {k+1}", "type": "level"})
    params_path.write_text(json.dumps(params, indent=2, ensure_ascii=False) + "\n")
    lock_path.write_text("\n".join(old_lock + ["next_track", "start_track"] + [f"wave_{k:02d}" for k in range(32)]) + "\n")

    cpp = cpp_path.read_text()
    cpp = replace_once(
        cpp,
        "    int page = 0;\n",
        "    int page = 0;\n"
        "    bool sukottoAutoPlay = false; // start first result when a new dig completes\n"
        "    bool sukottoSawSearch = false; // avoid replaying an old result after SEARCH\n"
        "    unsigned char sukottoWave[32] = {}; // cached, progressive track peak envelope\n"
        "    int sukottoWaveResult = -1;\n",
        "Engine state",
    )
    cpp = replace_once(
        cpp,
        "    p->page = 0;\n    p->searched_source = src;\n",
        "    p->page = 0;\n"
        "    p->sukottoAutoPlay = true;\n"
        "    p->sukottoSawSearch = false;\n"
        "    p->searched_source = src;\n",
        "do_search",
    )
    cpp = replace_once(
        cpp,
        "        else if (i == P_PAGE_PREV || i == P_PAGE_NEXT)\n",
        """        else if (i == P_START_TRACK)
        {
            if (!core_get(p, "stream_url").empty())
                core_set(p, "seek_to_seconds", "0");
        }
        else if (i == P_NEXT_TRACK)
        {
            // One press means one NEW record, not an eight-item results page.
            const int n = result_count(p);
            if (n <= 0) do_search(p, false);
            else
            {
                int next = current_result(p) + 1;
                if (next >= n) do_search(p, false);  // a fresh random crate
                else
                {
                    while (next < n && !play_result(p, next)) ++next;
                    if (next >= n) do_search(p, false);
                }
            }
        }
        else if (i == P_PAGE_PREV || i == P_PAGE_NEXT)
""",
        "NEXT trigger",
    )
    cpp = replace_once(
        cpp,
        "            load_channels(&e_);\n            for (int i = 0; i < NPARAMS; ++i)\n",
        """            load_channels(&e_);
            // Search/streaming run on the worker thread, never on the audio callback.
            if (e_.sukottoAutoPlay && e_.core)
            {
                const std::string st = core_get(&e_, "search_status");
                if (st == "searching" || st == "queued") e_.sukottoSawSearch = true;
                else if (st == "done" && e_.sukottoSawSearch)
                {
                    for (int j = 0, n = result_count(&e_); j < n; ++j)
                        if (play_result(&e_, j)) break;
                    e_.sukottoAutoPlay = false;
                }
                else if (st == "error" || st == "no_results")
                    e_.sukottoAutoPlay = false;
            }
            // Build the waveform gradually from streamed audio already heard.
            // No audio-thread allocation or network prefetch required.
            {
                const int current = current_result(&e_);
                if (current != e_.sukottoWaveResult)
                {
                    std::memset(e_.sukottoWave, 0, sizeof(e_.sukottoWave));
                    e_.sukottoWaveResult = current;
                }
                if (current >= 0 && core_get(&e_, "stream_status") == "streaming")
                {
                    const int duration = clock_seconds(core_get_idx(&e_, "search_result_duration_%d", current));
                    const int at = clock_seconds(core_get(&e_, "playback_time"));
                    if (duration > 0 && at >= 0 && at <= duration)
                    {
                        const int bin = std::min(31, at * 32 / duration);
                        const float peak = std::max(peakL_.load(), peakR_.load());
                        if (peak > 0.006f)
                        {
                            const int level = std::max(1, std::min(10, (int)std::ceil(peak * 12.0f)));
                            e_.sukottoWave[bin] = (unsigned char)std::max((int)e_.sukottoWave[bin], level);
                        }
                    }
                }
            }
            for (int i = 0; i < NPARAMS; ++i)
""",
        "uiPass autoplay",
    )
    cpp = replace_once(
        cpp,
        '            return lamps(i == P_LEVEL_L ? peakL_.load() : peakR_.load());\n',
        '            if (i >= P_WAVE_00 && i <= P_WAVE_31) return (float)e_.sukottoWave[i - P_WAVE_00];\n'
        '            return lamps(i == P_LEVEL_L ? peakL_.load() : peakR_.load());\n',
        "progressive waveform level readout",
    )
    cpp_path.write_text(cpp)

    # Reuse upstream's existing skin sprites, controls, and vintage faceplate.
    # A single tab replaces PLAY/FILTERS/FIND and hides provider selection.
    skin = skin_path.read_text()
    marker = "\ndef main():\n"
    if skin.count(marker) != 1:
        raise RuntimeError("Upstream TUI generator has changed")
    new_skin = r'''
# ---- Sukotto one-record screen ------------------------------------------------
def sukotto_wave_strip():
    # Audio amplitude, not an invented full-track analysis: columns fill as the stream plays.
    img = Image.new("RGBA", (20, 62 * 11), (0, 0, 0, 0))
    for level in range(11):
        sp = Sprite(20, 62)
        sp.r((9, 28, 11, 34), 1, fill=(39, 112, 49, 190))
        if level:
            half = int(3 + level * 2.4)
            sp.r((6, 31 - half, 14, 31 + half), 3, fill=(8, 38, 14, 255))
            sp.r((7, 31 - half, 9, 31 + half), 2, fill=(16, 83, 23, 255))
        img.paste(sp.image(), (0, level * 62))
    return save(img, "sukotto_wave_strip.png")


def build_sukotto():
    c = base_canvas("SUKOTTO DIGGER")
    p = Page("DIG", 0)
    M.lcd(c, (40, 82, 1240, 430))
    M.lt(c, (75, 115), "NOW PLAYING", 13, dim=True)
    p.lcd_text("now_playing", 78, 167, 940, size=29, h=48)
    M.lt(c, (1050, 117), "TIME", 12, dim=True)
    p.lcd_text("time", 1061, 168, 135, size=25, h=38)

    M.lt(c, (75, 220), "WAVEFORM  /  HEARD SECTIONS", 12, dim=True)
    strip = sukotto_wave_strip()
    for k in range(32):
        x = 83 + k * 34
        p.kids.append(entry("Wave %02d" % (k + 1), "Image",
                            {"version": 2, "imageType": "FilmStrip", "colour": "0",
                             "image": strip, "numFrames": 11, "handleName": "Data"},
                            "%d 236 20 62" % x, remap=P("wave_%02d" % k)))

    M.lt(c, (75, 323), "STATUS", 12, dim=True)
    p.lcd_text("status", 75, 356, 750, size=23, h=34)
    M.lt(c, (75, 389), "DIGGING", 12, dim=True)
    p.lcd_text("search_status", 75, 411, 1120, size=17, h=32)

    M.brushed(c, (40, 440, 1240, 544))
    M.bracket(c, 65, 1212, 451, "LISTEN  /  DISCOVER")
    p.key("start_track", "TO START", "cream", 155, 497, 150, 56, size=13)
    p.key("play_pause", "PLAY / PAUSE", "cream", 365, 497, 190, 56, size=13)
    p.key("next_track", "NEXT RECORD", "red", 650, 497, 255, 66, size=19)
    p.key("search", "NEW DIG", "cream", 938, 497, 180, 56, size=14)
    p.key("transport_sync", "SYNC", "cream", 1132, 497, 122, 56, size=13, toggle=True, lamp="amber")

    M.brushed(c, (40, 548, 1240, 616))
    for name, x in (("genre", 175), ("decade", 478), ("region", 781), ("country", 1084)):
        M.lt(c, (x, 558), name.upper(), 11, dim=True)
        p.lcd_text(name, x - 88, 589, 176, size=18, h=28,
                   just="horizontallyCentred verticallyCentred", colour="ff202326")
        arrow(p, name + "_prev", "◄", x - 115, 589, w=26, h=24, size=12, pad=5)
        arrow(p, name + "_next", "►", x + 115, 589, w=26, h=24, size=12, pad=5)

    add_master(p)
    p.qgroup((40, 440, 1240, 544), ["start_track", "play_pause", "next_track", "search"])
    p.qgroup((40, 548, 1240, 616), ["genre", "decade", "region", "country"])
    p.qgroup((700, 6, 1240, 78), ["gain", "transport_sync", "rewind_15", "forward_15"])
    return p, c


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    p, c = build_sukotto()
    tab = p.tab(save(c.im.resize((1280, 628), Image.LANCZOS).convert("RGB"), "bg_sukotto.png"))
    if "--preview" in sys.argv:
        preview([p], [tab])
    tui = {"pageData": {"version": 1,
                        "componentDefinitions": {"version": 2, "importFiles": [],
                                                 "localComponentDefinitions": overlay_defs() + DEFS},
                        "replacementStrings": [],
                        "info": {"version": 1, "type": "CompleteDescription"},
                        "tabs": [tab]}}
    open(os.path.join(OUT, "TUI.json"), "w").write(dump(tui) + "\n")
    open(os.path.join(OUT, "Q-Links.json"), "w").write(dump(qlinks_for([p])) + "\n")
    print("Sukotto MPC skin: one tab, one record, NEXT RECORD and NEW DIG")


if __name__ == "__main__":
    main()
'''
    skin_path.write_text(skin.split(marker, 1)[0] + "\n" + new_skin.lstrip("\n"))

    build = build_path.read_text()
    build = replace_once(
        build,
        'NAME="Crate Digger"; UID_=',
        'NAME="Sukotto Digger"; UID_=',
        "build name",
    )
    build = replace_once(
        build,
        "UID_=\"'C','r','D','g'\"; UIDS=CrDg; SLUG=cratedigger",
        "UID_=\"'S','k','D','g'\"; UIDS=SkDg; SLUG=sukotto",
        "build identity",
    )
    build = replace_once(
        build,
        'build aarch64 linux/arm64  crate-sdk-arm64 arm64v8/gcc:12-bookworm aarch64 &',
        '# Gen 1 MVP: ARM32 only, do not build an untested 64-bit binary.',
        "arm64 build selection",
    )
    build_path.write_text(build)

    pack = pack_path.read_text()
    pack = replace_once(pack, 'NAME = "sd88me - VST - Crate Digger"',
                        'NAME = "sd88me - VST - Sukotto Digger"', "package folder")
    pack = replace_once(pack, 'for cpu in ("aarch64", "armv7"):',
                        'for cpu in ("armv7",):', "ARM32-only package")
    pack = replace_once(pack, 'out = os.path.join(DIST, "Crate-Digger-%s-VST2-Plugins-%s.zip" % (VER, cpu))',
                        'out = os.path.join(DIST, "Sukotto-Digger-%s-VST2-Plugins-%s.zip" % (VER, cpu))',
                        "package output")
    # Put an explicit user-safe installation note in the zip, not the legacy Force installer instructions.
    pack = replace_once(pack, 'add_file(z, TEXT[cpu], "INSTALL.txt")',
                        'add_file(z, "Sukotto Digger MPC One Gen 1: copy VST2 Plugins/sd88me - VST - Sukotto Digger to your USB or SD VST2 Plugins folder. Enable Enhancements and External Plugin Support, then reboot. DO NOT run install-force.sh. Source and attribution: https://github.com/sd88me/mpc-vst-cratedigger (MIT).\\n", "INSTALL.txt")',
                        "INSTALL text")
    pack_path.write_text(pack)

    print("Patched Sukotto Digger: separate UID, one page, NEXT trigger, search autoplay.")
    print("Next: python3 tools/make_tui.py --preview; MPC_SDK=... ./build-sdk.sh; python3 tools/package.py")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("upstream", type=Path, help="Clean checkout of sd88me/mpc-vst-cratedigger")
    patch(ap.parse_args().upstream.resolve())
