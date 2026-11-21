# Sukotto Digger / SAMPLE DECK 03. Independent MPC skin (sampler 90s + audio lab).
# Drawn with generic Pillow/MPC TUI primitives, NOT the upstream Crate Digger
# faceplate, keys, lettering, layout or branded artwork.
# Injected after the upstream TUI helpers by mpc/patch_sukotto.py.

def sukotto_bg():
    c = M.C.__new__(M.C)
    c.im = Image.new("RGB", (M.W * S, M.H * S), (62, 65, 64))
    c.d = ImageDraw.Draw(c.im, "RGBA")
    # Warm ivory/chassis composite and dark anodized 19-inch rack rails.
    M.vgrad(c, (0, 0, 1280, 628), (51, 56, 55), (30, 33, 35))
    M.vgrad(c, (27, 13, 1253, 619), (190, 187, 173), (153, 153, 148), 12)
    c.r((28, 15, 1252, 618), 12, outline=(235, 231, 212, 175), width=2)
    for x in (17, 1263):
        c.r((x - 9, 0, x + 9, 627), 3, fill=(37, 41, 43))
        for y in (44, 575):
            c.ell(x, y, 5, 5, fill=(16, 17, 18), outline=(120, 120, 112), width=1)
            c.line([(x - 3, y - 1), (x + 3, y + 1)], (99, 99, 96), 1)

    # Small printed service marks, engraved status strip, display serial.
    M.vgrad(c, (41, 24, 1239, 96), (66, 74, 73), (40, 45, 46), 5)
    c.line([(45, 25), (1234, 25)], (136, 138, 124), 1)
    c.t((63, 47), "SUKOTTO", 28, (231, 228, 208), "lm", "m")
    c.t((63, 79), "DIGGER  /  SAMPLE DECK", 11, (160, 182, 160), "lm", "m")
    c.t((328, 45), "SD-03", 10, (206, 171, 100), "lm", "m")
    c.ell(1222, 44, 4, 4, fill=(246, 146, 73), outline=(102, 62, 27))
    c.t((1230, 66), "ARM32", 8, (196, 197, 183), "rm", "m")

    # Main CRT-like audio viewport: phosphor-green wave on smoked glass.
    c.shadow((42, 104, 1238, 418), 8, 5, 4, 140)
    M.vgrad(c, (42, 104, 1238, 418), (35, 40, 39), (17, 22, 22), 6)
    c.r((42, 104, 1238, 418), 6, outline=(18, 19, 20), width=3)
    M.vgrad(c, (57, 118, 1223, 406), (26, 45, 36), (13, 34, 27), 3)
    c.r((57, 118, 1223, 406), 3, outline=(100, 117, 92, 110), width=1)
    # Subtle digital reticle, ruler and screen grid.
    for x in range(78, 1210, 32):
        c.line([(x, 222), (x, 298)], (61, 112, 76, 45), 1)
    c.line([(81, 260), (1192, 260)], (133, 181, 129, 135), 1)
    for x in range(82, 1187, 96):
        c.line([(x, 217), (x, 224)], (159, 193, 135), 1)
        c.line([(x, 296), (x, 302)], (159, 193, 135), 1)
    c.line([(82, 315), (1198, 315)], (96, 139, 106, 105), 1)
    c.t((84, 143), "TRACK / SOURCE", 11, (156, 184, 148), "lm", "m")
    c.t((1045, 143), "POSITION", 11, (156, 184, 148), "lm", "m")
    c.t((85, 212), "SIGNAL MEMORY  /  LIVE ENVELOPE", 10, (122, 167, 126), "lm", "m")
    c.t((85, 336), "PLAYBACK", 10, (122, 167, 126), "lm", "m")
    c.t((640, 336), "CAPTURE / WAV", 10, (201, 164, 93), "lm", "m")
    c.line([(626, 326), (626, 393)], (90, 104, 83, 105), 1)

    # Transport strip and capture bay have deliberately different tactile surfaces.
    M.vgrad(c, (42, 427, 1238, 514), (137, 141, 139), (102, 107, 106), 6)
    c.r((42, 427, 1238, 514), 5, outline=(57, 61, 62, 165), width=1)
    c.t((63, 445), "TRANSPORT   /   DISCOVERY", 9, (231, 230, 216), "lm", "m")
    M.vgrad(c, (42, 523, 1238, 614), (65, 72, 71), (41, 46, 45), 6)
    c.r((42, 523, 1238, 614), 5, outline=(30, 33, 34), width=1)
    c.t((62, 539), "SAMPLING BAY  /  44.1 kHz 16-bit STEREO", 10, (218, 208, 179), "lm", "m")
    c.t((1218, 539), "USB / SD  >  SUKOTTO SAMPLES", 9, (142, 168, 153), "rm", "m")

    # Bottom serial strip makes this feel like a standalone industrial instrument.
    c.t((635, 620), "SUKOTTO LABS  •  MPC ONE  •  UNIT 003", 8, (70, 71, 68), "mm", "m")
    return c


def key_images(name, label, color, w, h, size=13, lamp=None, toggle=False):
    """Fresh industrial keycaps, with inset labels and a physical actuator lip."""
    sw, sh = w + 2 * PAD_X, h + PAD_TOP + PAD_BOT
    tones = {
        "cream": ((237, 231, 207), (177, 170, 148), (45, 46, 43)),
        "red": ((224, 93, 75), (142, 41, 35), (255, 236, 220)),
        "amber": ((223, 166, 81), (146, 87, 39), (44, 31, 19)),
        "dark": ((112, 123, 119), (64, 71, 70), (243, 236, 212)),
    }
    top, bottom, ink = tones.get(color, tones["cream"])
    out = []
    for active in (True, False):
        s = Sprite(sw, sh)
        x0, x1, y0, y1 = PAD_X, PAD_X + w, PAD_TOP, PAD_TOP + h
        s.shadow((x0, y0, x1, y1), 5, 3, 3, 120)
        M.vgrad(s, (x0, y0 + 3, x1, y1 + 3), tuple(int(v * 0.40) for v in bottom),
                tuple(int(v * 0.33) for v in bottom), 5)
        M.vgrad(s, (x0, y0 + (2 if active else 0), x1, y1 + (2 if active else 0)),
                bottom if active else top, bottom, 5)
        s.r((x0 + 1, y0 + (2 if active else 0) + 1,
             x1 - 1, y1 - 1), 5, outline=(39, 43, 41, 120), width=1)
        s.line([(x0 + 7, y0 + (3 if active else 2)),
                (x1 - 7, y0 + (3 if active else 2))], (255, 250, 222, 130), 1)
        s.t((sw / 2, PAD_TOP + h / 2 + (2 if active else 0)), label,
            min(size, 18), ink, "mm", "m")
        if lamp or color == "red":
            light = (224, 152, 65) if lamp == "amber" else (208, 70, 54)
            s.ell(sw / 2, 12, 4, 3,
                  fill=light if (active and (toggle or color == "red")) else (72, 62, 54),
                  outline=(32, 33, 33), width=1)
        out.append(save(s.image(), "sd3_%s_%s.png" % (name, "on" if active else "off")))
    return out[0], out[1], sw, sh


def sukotto_wave_strip():
    # Filmstrip shows discovered signal ONLY; no fake full-track waveform.
    strip = Image.new("RGBA", (24, 70 * 11), (0, 0, 0, 0))
    for level in range(11):
        s = Sprite(24, 70)
        s.r((11, 29, 13, 40), 1, fill=(45, 86, 61, 200))
        if level:
            half = round(3 + (level / 10) ** 0.72 * 29)
            s.r((7, 35 - half, 17, 35 + half), 2, fill=(33, 113, 61, 245))
            s.r((10, 35 - half, 13, 35 + half), 1, fill=(151, 243, 148, 245))
        strip.paste(s.image(), (0, level * 70))
    return save(strip, "sukotto_wave_strip.png")


def sukotto_arrow(p, param, char, x, y):
    p.key(param, char, "dark", x, y, 24, 22, size=12, nm="sd3_arrow_" + param)


def build_sukotto():
    c = sukotto_bg()
    p = Page("SAMPLE DECK", 0)
    # Search steppers share one compact row in the hardware header.
    # Each field keeps two arrow buttons: tactile and 4-in-1 Q-Link friendly.
    for key, cx, title in (("genre", 510, "GENRE"), ("decade", 725, "DECADE"),
                           ("region", 930, "REGION"), ("country", 1125, "COUNTRY")):
        c.t((cx, 41), title, 9, (213, 208, 187), "mm", "m")
        p.lcd_text(key, cx - 62, 73, 124, size=15, h=25,
                   just="horizontallyCentred verticallyCentred", colour="ffbed7b5")
        sukotto_arrow(p, key + "_prev", "<", cx - 83, 68)
        sukotto_arrow(p, key + "_next", ">", cx + 83, 68)

    p.lcd_text("now_playing", 82, 182, 937, size=27, h=44, colour="ffc4f2b4")
    p.lcd_text("time", 1052, 182, 135, size=24, h=38, colour="ffe6b76e")
    waveform = sukotto_wave_strip()
    for k in range(32):
        p.kids.append(entry("wave %02d" % k, "Image",
            {"version": 2, "imageType": "FilmStrip", "colour": "0",
             "image": waveform, "numFrames": 11, "handleName": "Data"},
            "%d 229 24 70" % (93 + k * 34), remap=P("wave_%02d" % k)))
    p.lcd_text("status", 90, 369, 494, size=21, h=30, colour="ffc4f2b4")
    p.lcd_text("capture_status", 644, 369, 540, size=20, h=30, colour="ffffd99b")

    # Row 1: quick digging, previous-record recall, transport.
    p.key("prev_track", "PREV", "cream", 144, 477, 154, 47, size=16)
    p.key("start_track", "TO START", "cream", 335, 477, 158, 47, size=14)
    p.key("play_pause", "PLAY/PAUSE", "cream", 532, 477, 166, 47, size=14)
    p.key("next_track", "NEXT RECORD", "red", 793, 477, 236, 54, size=17)
    p.key("search", "NEW DIG", "amber", 1096, 477, 166, 47, size=16)

    # Row 2: every button has a concrete function; no dummy "Send to MPC".
    p.key("mark_in", "MARK IN", "cream", 175, 578, 170, 44, size=14)
    p.key("mark_out", "MARK OUT", "cream", 402, 578, 170, 44, size=14)
    p.key("capture_rec", "REC / STOP", "red", 634, 578, 184, 44, size=14)
    p.key("save_last_30", "LAST 30 SEC", "amber", 888, 578, 174, 44, size=13)
    p.key("transport_sync", "SYNC", "dark", 1131, 578, 133, 44,
          size=14, toggle=True, lamp="amber")

    # One tab, 4 rows of hardware Q-Links. Search is always tappable.
    p.qgroup((42, 427, 1238, 514), ["prev_track", "start_track", "play_pause", "next_track"])
    p.qgroup((42, 523, 1238, 614), ["mark_in", "mark_out", "capture_rec", "save_last_30"])
    p.qgroup((380, 25, 1215, 95), ["genre", "decade", "region", "country"])
    p.qgroup((1035, 435, 1238, 614), ["search", "transport_sync", "rewind_15", "forward_15"])
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
             "info": {"version": 1, "type": "CompleteDescription"}, "tabs": [tab]}}
    open(os.path.join(OUT, "TUI.json"), "w").write(dump(tui) + "\n")
    open(os.path.join(OUT, "Q-Links.json"), "w").write(dump(qlinks_for([p])) + "\n")
    print("Sukotto 03 skin: original 90s sampler x lab chassis, one tab, real capture controls")


if __name__ == "__main__":
    main()
