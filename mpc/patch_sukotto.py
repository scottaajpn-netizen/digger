#!/usr/bin/env python3
"""Build-time adapter: upstream Crate Digger 2.2 -> Sukotto 03 sampler interface.

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
        "description": "Retro MPC digging and stereo WAV sampling; based on MIT Crate Digger audio engine.",
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
    # V3 appends only; V1 and V2 indices remain stable for existing MPC projects.
    new_actions = [
        ("prev_track", "Previous Record", "trigger"),
        ("capture_rec", "Capture / Stop", "trigger"),
        ("mark_in", "Mark In / Rec", "trigger"),
        ("mark_out", "Mark Out / Save", "trigger"),
        ("save_last_30", "Save Last 30s", "trigger"),
        ("capture_status", "Capture Status", "readout"),
    ]
    for key, label, typ in new_actions:
        params["params"].append({"key": key, "name": label, "type": typ})
    params_path.write_text(json.dumps(params, indent=2, ensure_ascii=False) + "\n")
    lock_path.write_text("\n".join(
        old_lock + ["next_track", "start_track"] + [f"wave_{k:02d}" for k in range(32)]
        + [k for k, _, _ in new_actions]) + "\n")

    cpp = cpp_path.read_text()
    cpp = replace_once(cpp, '#include "varispeed.h"\n',
                       '#include "varispeed.h"\n#include "sukotto_capture.h"\n',
                       "capture class include")
    cpp = replace_once(
        cpp,
        "    int page = 0;\n",
        "    int page = 0;\n"
        "    bool sukottoAutoPlay = false; // start first result when a new dig completes\n"
        "    bool sukottoSawSearch = false; // avoid replaying an old result after SEARCH\n"
        "    unsigned char sukottoWave[32] = {}; // cached, progressive track peak envelope\n"
        "    int sukottoWaveResult = -1;\n"
        "    struct SukottoRecord { std::string url, provider, title, duration; };\n"
        "    std::vector<SukottoRecord> sukottoHistory;\n"
        "    int sukottoHistoryAt = -1, sukottoCurrentSearchIndex = -1, sukottoTrackSerial = 0;\n"
        "    std::string sukottoNowPlaying, sukottoDuration, sukottoCaptureStatus = \"READY / WAITING FOR AUDIO\";\n",
        "Engine state",
    )
    cpp = replace_once(
        cpp,
        "    p->page = 0;\n    p->searched_source = src;\n",
        "    p->page = 0;\n"
        "    p->sukottoAutoPlay = true;\n"
        "    p->sukottoSawSearch = false;\n"
        "    p->sukottoCurrentSearchIndex = -1;\n"
        "    p->searched_source = src;\n",
        "do_search",
    )
    cpp = replace_once(
        cpp,
        "        else if (i == P_PAGE_PREV || i == P_PAGE_NEXT)\n",
        """        else if (i == P_PREV_TRACK)
        {
            // Recall even after NEW DIG changed the search results.
            if (p->sukottoHistoryAt > 0)
                sukotto_restore_history(p, p->sukottoHistoryAt - 1);
        }
        else if (i == P_START_TRACK)
        {
            if (!core_get(p, "stream_url").empty())
                core_set(p, "seek_to_seconds", "0");
        }
        else if (i == P_NEXT_TRACK)
        {
            if (p->sukottoHistoryAt >= 0 &&
                p->sukottoHistoryAt + 1 < (int)p->sukottoHistory.size())
            {
                sukotto_restore_history(p, p->sukottoHistoryAt + 1);
            }
            else
            {
                // Continue the last search; when exhausted dig a fresh crate.
                int next = p->sukottoCurrentSearchIndex + 1;
                const int n = result_count(p);
                if (n <= 0 || next >= n) do_search(p, false);
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
                const int current = e_.sukottoTrackSerial;
                if (current != e_.sukottoWaveResult)
                {
                    std::memset(e_.sukottoWave, 0, sizeof(e_.sukottoWave));
                    e_.sukottoWaveResult = current;
                    capture_.command(SukottoCapture::CLEAR); // prevent cross-record samples
                }
                if (current > 0 && core_get(&e_, "stream_status") == "streaming")
                {
                    const int duration = clock_seconds(e_.sukottoDuration);
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
    # History captures the source URI before a new DIG overwrites the result list.
    cpp = replace_once(
        cpp,
        '    core_set(p, "cratedig_result_index", s);\n    return true;\n',
        """    core_set(p, "cratedig_result_index", s);
    Plugin::SukottoRecord record {
        url, prov.empty() ? "youtube" : prov,
        core_get_idx(p, "search_result_title_%d", idx),
        core_get_idx(p, "search_result_duration_%d", idx)
    };
    if (p->sukottoHistoryAt + 1 < (int)p->sukottoHistory.size())
        p->sukottoHistory.erase(p->sukottoHistory.begin() + p->sukottoHistoryAt + 1,
                                p->sukottoHistory.end());
    p->sukottoHistory.push_back(record);
    if (p->sukottoHistory.size() > 12) p->sukottoHistory.erase(p->sukottoHistory.begin());
    p->sukottoHistoryAt = (int)p->sukottoHistory.size() - 1;
    p->sukottoCurrentSearchIndex = idx;
    p->sukottoNowPlaying = record.title;
    p->sukottoDuration = record.duration;
    ++p->sukottoTrackSerial;
    return true;
""", "play_result appends history",
    )
    cpp = replace_once(
        cpp,
        "static int current_result(Plugin *p) {\n",
        """static bool sukotto_restore_history(Plugin *p, int i) {
    if (i < 0 || i >= (int)p->sukottoHistory.size()) return false;
    const auto rec = p->sukottoHistory[(size_t)i];
    if (rec.url.empty()) return false;
    p->hold = p->sync;
    p->sync_started = false;
    core_set(p, "hold_start", p->hold ? "1" : "0");
    core_set(p, "stream_provider", rec.provider.c_str());
    core_set(p, "stream_url", rec.url.c_str());
    core_set(p, "cratedig_result_index", "-1");
    p->sukottoHistoryAt = i;
    p->sukottoNowPlaying = rec.title;
    p->sukottoDuration = rec.duration;
    ++p->sukottoTrackSerial;
    return true;
}
static int current_result(Plugin *p) {
""", "history restore helper",
    )
    cpp = replace_once(
        cpp,
        '        if (i == P_NOW_PLAYING) {\n            int c = current_result(p);\n',
        '        if (i == P_CAPTURE_STATUS) return p->sukottoCaptureStatus;\n'
        '        if (i == P_NOW_PLAYING) {\n'
        '            if (!p->sukottoNowPlaying.empty()) return p->sukottoNowPlaying;\n'
        '            int c = current_result(p);\n',
        "history / capture status readout",
    )
    cpp = replace_once(
        cpp,
        '        e_.rpos.store(r + used);\n',
        '        capture_.push(l, rr, n); // lock-free; dedicated thread writes WAVs\n'
        '        e_.rpos.store(r + used);\n',
        "realtime PCM tap",
    )
    cpp = replace_once(
        cpp,
        '        else if (i == P_STOP) core_set(p, "stop_step", "trigger");\n',
        """        else if (i == P_CAPTURE_REC) capture_.command(SukottoCapture::REC);
        else if (i == P_MARK_IN) capture_.command(SukottoCapture::MARK_IN);
        else if (i == P_MARK_OUT) capture_.command(SukottoCapture::MARK_OUT);
        else if (i == P_SAVE_LAST_30) capture_.command(SukottoCapture::LAST_30);
        else if (i == P_STOP) core_set(p, "stop_step", "trigger");
""", "capture buttons",
    )
    cpp = replace_once(
        cpp,
        '            load_channels(&e_);\n',
        """            load_channels(&e_);
            switch (capture_.state()) {
            case SukottoCapture::RECORDING:
                e_.sukottoCaptureStatus = "REC  " + std::to_string(capture_.elapsedSeconds()) + "S / MARK OUT TO SAVE";
                break;
            case SukottoCapture::SAVED:
                e_.sukottoCaptureStatus = "WAV SAVED / SUKOTTO SAMPLES";
                break;
            case SukottoCapture::DISK_ERROR:
                e_.sukottoCaptureStatus = "SAVE ERROR / CHECK USB";
                break;
            case SukottoCapture::NOTHING_TO_SAVE:
                e_.sukottoCaptureStatus = "NO AUDIO YET";
                break;
            case SukottoCapture::CAPTURE_LIMIT:
                e_.sukottoCaptureStatus = "SAVED / 3 MIN LIMIT";
                break;
            case SukottoCapture::DROPPED_AUDIO:
                e_.sukottoCaptureStatus = "REC / USB TOO SLOW";
                break;
            default:
                e_.sukottoCaptureStatus = "READY / MARK IN OR REC";
            }
""", "live recorder status",
    )
    cpp = replace_once(
        cpp,
        '    std::atomic<float> peakL_{0.0f}, peakR_{0.0f};\n',
        '    std::atomic<float> peakL_{0.0f}, peakR_{0.0f};\n'
        '    SukottoCapture capture_{mpc::pluginFolder()};\n',
        "capture member",
    )
    cpp = replace_once(
        cpp,
        '        if (coverThread_.joinable()) coverThread_.join();\n'
        '        if (e_.core) e_.api->destroy_instance(e_.core);\n',
        '        if (coverThread_.joinable()) coverThread_.join();\n'
        '        capture_.shutdown();\n'
        '        if (e_.core) e_.api->destroy_instance(e_.core);\n',
        "capture cleanup",
    )
    cpp_path.write_text(cpp)

    # A custom Sukotto facade, controls and palette replace Crate Digger's artwork.
    skin = skin_path.read_text()
    marker = "\ndef main():\n"
    if skin.count(marker) != 1:
        raise RuntimeError("Upstream TUI generator has changed")
    new_skin = (Path(__file__).resolve().parent / "skin_v3.py").read_text()
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
