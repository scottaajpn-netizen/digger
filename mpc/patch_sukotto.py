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
    params_path.write_text(json.dumps(params, indent=2, ensure_ascii=False) + "\n")
    lock_path.write_text("\n".join(old_lock + ["next_track"]) + "\n")

    cpp = cpp_path.read_text()
    cpp = replace_once(
        cpp,
        "    int page = 0;\n",
        "    int page = 0;\n"
        "    bool sukottoAutoPlay = false; // start first result when a new dig completes\n"
        "    bool sukottoSawSearch = false; // avoid replaying an old result after SEARCH\n",
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
        """        else if (i == P_NEXT_TRACK)
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
            for (int i = 0; i < NPARAMS; ++i)
""",
        "uiPass autoplay",
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
def build_sukotto():
    c = base_canvas("SUKOTTO DIGGER")
    p = Page("DIG", 0)
    M.lcd(c, (40, 82, 1240, 430))
    M.lt(c, (75, 123), "NOW PLAYING", 14, dim=True)
    p.lcd_text("now_playing", 78, 190, 1090, size=33, h=54)
    M.lt(c, (75, 260), "STATUS", 13, dim=True)
    p.lcd_text("status", 75, 300, 740, size=24, h=38)
    M.lt(c, (980, 260), "TIME", 13, dim=True)
    p.lcd_text("time", 1055, 300, 150, size=23, h=38)
    M.lt(c, (75, 360), "DIGGING", 13, dim=True)
    p.lcd_text("search_status", 75, 397, 1090, size=19, h=38)

    M.brushed(c, (40, 440, 1240, 544))
    M.bracket(c, 65, 1212, 451, "LISTEN  /  DISCOVER")
    p.key("play_pause", "PLAY / PAUSE", "cream", 180, 497, 210, 56, size=14)
    p.key("next_track", "NEXT RECORD", "red", 490, 497, 260, 66, size=19)
    p.key("search", "NEW DIG", "cream", 800, 497, 190, 56, size=15)
    p.key("transport_sync", "SYNC", "cream", 1070, 497, 150, 56, size=15, toggle=True, lamp="amber")

    M.brushed(c, (40, 548, 1240, 616))
    for name, x in (("genre", 175), ("decade", 478), ("region", 781), ("country", 1084)):
        M.lt(c, (x, 558), name.upper(), 11, dim=True)
        p.lcd_text(name, x - 88, 589, 176, size=18, h=28,
                   just="horizontallyCentred verticallyCentred", colour="ff202326")
        arrow(p, name + "_prev", "◄", x - 115, 589, w=26, h=24, size=12, pad=5)
        arrow(p, name + "_next", "►", x + 115, 589, w=26, h=24, size=12, pad=5)

    add_master(p)
    p.qgroup((40, 440, 1240, 544), ["play_pause", "next_track", "search", "transport_sync"])
    p.qgroup((40, 548, 1240, 616), ["genre", "decade", "region", "country"])
    p.qgroup((700, 6, 1240, 78), ["gain"])
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
