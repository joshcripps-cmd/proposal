#!/usr/bin/env python3
"""
Roccabella Yachts — Charter Proposal PDF Generator v2
Brand-aligned: Lora serif headlines, Poppins sans labels, cream backgrounds,
red accent color for display headings, editorial luxury feel.

Typography mapping:
  SangBleu OG Sans → Lora (elegant serif) — Headlines
  IvyJournal → Lora (serif) — Body copy
  Sohne Breit Kraftig → Poppins Medium/Bold — Labels, subheadings, specs
"""

import os
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Register Brand Fonts ──
pdfmetrics.registerFont(TTFont('Lora', '/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf'))
pdfmetrics.registerFont(TTFont('Lora-Italic', '/usr/share/fonts/truetype/google-fonts/Lora-Italic-Variable.ttf'))
pdfmetrics.registerFont(TTFont('Poppins', '/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Poppins-Medium', '/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf'))
pdfmetrics.registerFont(TTFont('Poppins-Bold', '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Poppins-Light', '/usr/share/fonts/truetype/google-fonts/Poppins-Light.ttf'))

# ── Brand Colours ──
NAVY = HexColor("#0f1d2f")
NAVY_LIGHT = HexColor("#1a2d45")
RED = HexColor("#c43a2b")
CREAM = HexColor("#f5f1eb")
WARM_WHITE = HexColor("#faf8f4")
WHITE = HexColor("#ffffff")
DARK = HexColor("#1a1a2e")
SLATE = HexColor("#6b6b7b")
LIGHT_GREY = HexColor("#b0afa8")
DIVIDER = HexColor("#d8d4cc")
DIVIDER_LIGHT = HexColor("#e8e4dc")

# ── Page Setup ──
PAGE_W, PAGE_H = landscape(A4)
M = 50  # Main margin
M_TOP = 45
M_BOT = 40

# ── Logo image ──
LOGO_PATH = "/home/claude/logo_white_alpha.png"


# ══════════════════════════════════════════════════
# DEMO DATA
# ══════════════════════════════════════════════════
PROPOSAL = {
    "client_name": "Mr. & Mrs. Richardson",
    "title": "Eastern Mediterranean — Summer 2026",
    "destination": "Turkey & Greek Islands",
    "discount": 7,
    "broker_friendly": False,
    "created_at": "27 February 2026",
    "message": "Following our conversation, I've curated a selection of exceptional yachts perfectly suited to your Mediterranean voyage this summer.",
}

YACHTS = [
    {"name": "AMALYA", "length_m": "77.7", "builder": "Admiral", "cabins": 6,
     "cabin_config": "6 Double Cabins", "guests": 12, "crew": 21,
     "year_built": 2025, "year_refit": None,
     "summer_port": "Mediterranean", "winter_port": "Middle East & Indian Ocean",
     "price_high": 1100000, "price_low": 1100000,
     "features": ["Steel hull", "Helipad", "Beach club", "Infinity pool", "Cinema room"]},
    {"name": "SOUNDWAVE", "length_m": "63", "builder": "Benetti", "cabins": 6,
     "cabin_config": "4 Double, 2 Convertible", "guests": 12, "crew": 15,
     "year_built": 2015, "year_refit": 2025,
     "summer_port": "Athens", "winter_port": "St. Maarten",
     "price_high": 650000, "price_low": 550000,
     "features": ["Full refit 2025", "Jacuzzi", "Gym", "Zero-speed stabilisers", "Tender garage"]},
    {"name": "QUINTA ESSENTIA", "length_m": "55", "builder": "Admiral", "cabins": 6,
     "cabin_config": "6 Double Cabins", "guests": 12, "crew": 13,
     "year_built": 2016, "year_refit": 2025,
     "summer_port": "Eastern Mediterranean", "winter_port": "Genova",
     "price_high": 360000, "price_low": 360000,
     "features": ["Recently refitted", "Expansive sun deck", "Water toys", "Al fresco dining"]},
    {"name": "YAZZ", "length_m": "56", "builder": "Aegean Yachts", "cabins": 5,
     "cabin_config": "4 Double, 1 Triple", "guests": 11, "crew": 13,
     "year_built": 2007, "year_refit": 2022,
     "summer_port": "Greece", "winter_port": "Didim",
     "price_high": 150000, "price_low": 150000,
     "features": ["Sailing yacht", "Classic elegance", "Shallow draft", "BBQ on deck"]},
    {"name": "HALAS 71", "length_m": "52.3", "builder": "Classic Build", "cabins": 12,
     "cabin_config": "10 Double, 2 Twin", "guests": 24, "crew": 16,
     "year_built": 1914, "year_refit": 2016,
     "summer_port": "Bodrum", "winter_port": "Istanbul",
     "price_high": 112000, "price_low": 112000,
     "features": ["Historic gulet", "24 guests capacity", "Traditional charm", "Expansive deck space"]},
]

BROKER = {
    "name": "Josh Cripps",
    "email": "josh.cripps@roccabellayachts.com",
    "phone": "+34 603 74 77 41",
    "bio": "Josh's maritime journey began at just six years old, and by 20, he launched his professional yachting career. Over the years, Josh has worked on some of the world's most prestigious yachts, ranging from 30 to 100 meters. With over 12 years of experience and 150+ charters since 2022, Josh has honed his expertise across the luxury yachting industry — from managing a fleet of 15 charter vessels to chartering out some of the world's most luxurious vessels to clients worldwide.",
}


# ── Helpers ──
def fmt_price(p, discount=0):
    if not p or p == "TBC": return "POA"
    v = int(p) if isinstance(p, (int, float)) else 0
    if discount > 0: v = int(v * (1 - discount / 100))
    return f"€{v:,}"

def m_to_ft(m):
    try: return f"{float(m) * 3.28084:.0f}ft"
    except: return ""

def year_str(y):
    s = str(y["year_built"])
    if y.get("year_refit"): s += f" / {y['year_refit']}"
    return s

def draw_bottom_rule(c):
    """Thin rule across bottom of page — brand element from presentation."""
    c.setStrokeColor(DIVIDER)
    c.setLineWidth(0.4)
    c.line(M, M_BOT - 10, PAGE_W - M, M_BOT - 10)

def draw_brand_header(c, broker_friendly=False):
    """Red dot + ROCCABELLAYACHTS.COM top-left — brand element from presentation."""
    if not broker_friendly:
        # Red dot
        c.setFillColor(RED)
        c.circle(M + 4, PAGE_H - M_TOP + 5, 3, fill=1, stroke=0)
        # URL
        c.setFont("Poppins-Medium", 7)
        c.setFillColor(DARK)
        c.drawString(M + 14, PAGE_H - M_TOP + 2, "ROCCABELLAYACHTS.COM")

def draw_page_num(c, num):
    """Page number bottom-right."""
    c.setFont("Poppins-Light", 8)
    c.setFillColor(LIGHT_GREY)
    c.drawRightString(PAGE_W - M, M_BOT - 6, f"{num:02d}")

def wrap_text(c, text, x, y, font, size, max_w, color=None, line_h=None):
    """Simple word-wrap text drawer. Returns final y position."""
    if color: c.setFillColor(color)
    c.setFont(font, size)
    if not line_h: line_h = size * 1.6
    words = text.split()
    line = ""
    for word in words:
        test = f"{line} {word}".strip()
        if pdfmetrics.stringWidth(test, font, size) < max_w:
            line = test
        else:
            c.drawString(x, y, line)
            y -= line_h
            line = word
    if line:
        c.drawString(x, y, line)
        y -= line_h
    return y


# ══════════════════════════════════════════════════
# PAGE 1: COVER
# ══════════════════════════════════════════════════
def draw_cover(c, proposal):
    """Clean white cover: logo centred, offices below, thin bottom rule.
    Matches Roccabella presentation cover page exactly."""
    # Warm white background
    c.setFillColor(WARM_WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    cx = PAGE_W / 2
    cy = PAGE_H / 2

    # Actual logo PNG (navy text with red dot on transparent bg)
    logo_navy = "/home/claude/logo_navy_reddot.png"
    if os.path.exists(logo_navy):
        # Logo is 752x173px, render at ~220pt wide to match presentation
        logo_w_pt = 220
        logo_h_pt = logo_w_pt * (173 / 752)
        c.drawImage(logo_navy, cx - logo_w_pt / 2, cy + 10,
                    width=logo_w_pt, height=logo_h_pt,
                    preserveAspectRatio=True, mask='auto')
    else:
        # Fallback text
        c.setFont("Poppins-Medium", 28)
        c.setFillColor(DARK)
        c.drawCentredString(cx, cy + 40, "ROCCABELLA")

    # Offices
    offices = "LONDON     DUBAI     GENEVA     PALMA     MIAMI"
    c.setFont("Poppins-Light", 9)
    c.setFillColor(SLATE)
    c.drawCentredString(cx, cy - 20, offices)

    # Bottom rule
    draw_bottom_rule(c)
    c.showPage()


# ══════════════════════════════════════════════════
# PAGE 2: PROPOSAL INTRO (client-facing only)
# ══════════════════════════════════════════════════
def draw_intro(c, proposal, page_num):
    """Title page with destination heading + personal message."""
    c.setFillColor(WARM_WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    draw_brand_header(c, proposal.get("broker_friendly"))

    cx = PAGE_W / 2

    # Prepared for
    c.setFont("Poppins-Light", 9)
    c.setFillColor(SLATE)
    c.drawCentredString(cx, PAGE_H - 130, f"Prepared for {proposal['client_name']}")

    # Main title in RED (brand display heading style)
    c.setFont("Lora", 36)
    c.setFillColor(RED)
    # Split title if long
    title = proposal["title"]
    if pdfmetrics.stringWidth(title, "Lora", 36) > PAGE_W - 200:
        parts = title.split("—")
        if len(parts) == 2:
            c.drawCentredString(cx, PAGE_H - 200, parts[0].strip())
            c.drawCentredString(cx, PAGE_H - 245, parts[1].strip())
        else:
            c.setFont("Lora", 28)
            c.drawCentredString(cx, PAGE_H - 200, title)
    else:
        c.drawCentredString(cx, PAGE_H - 200, title)

    # Destination
    c.setFont("Poppins-Light", 12)
    c.setFillColor(SLATE)
    c.drawCentredString(cx, PAGE_H - 270, proposal["destination"])

    # Date
    c.setFont("Poppins-Light", 10)
    c.setFillColor(LIGHT_GREY)
    c.drawCentredString(cx, PAGE_H - 296, proposal["created_at"])

    # Discount badge
    if proposal.get("discount", 0) > 0:
        badge_y = PAGE_H - 340
        badge_text = f"{proposal['discount']}% EXCLUSIVE DISCOUNT APPLIED"
        badge_w = pdfmetrics.stringWidth(badge_text, "Poppins-Medium", 9) + 30
        c.setFillColor(HexColor("#fef5f3"))
        c.rect(cx - badge_w / 2, badge_y - 6, badge_w, 24, fill=1, stroke=0)
        c.setStrokeColor(RED)
        c.setLineWidth(0.5)
        c.rect(cx - badge_w / 2, badge_y - 6, badge_w, 24, fill=0, stroke=1)
        c.setFont("Poppins-Medium", 9)
        c.setFillColor(RED)
        c.drawCentredString(cx, badge_y, badge_text)

    # Personal message
    if proposal.get("message") and not proposal.get("broker_friendly"):
        msg_y = PAGE_H - 400
        c.setFont("Lora-Italic", 11)
        c.setFillColor(SLATE)
        msg_w = 420
        wrap_text(c, f'"{proposal["message"]}"', cx - msg_w / 2, msg_y,
                  "Lora-Italic", 11, msg_w, SLATE, 18)

    draw_bottom_rule(c)
    draw_page_num(c, page_num)
    c.showPage()


# ══════════════════════════════════════════════════
# PAGE 3: YACHT SELECTION OVERVIEW
# ══════════════════════════════════════════════════
def draw_selection(c, yachts, proposal, page_num):
    """3-across grid: image placeholder, yacht name, builder/year, rate."""
    c.setFillColor(WARM_WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    draw_brand_header(c, proposal.get("broker_friendly"))

    # Section title
    c.setFont("Lora", 26)
    c.setFillColor(RED)
    c.drawString(M, PAGE_H - M_TOP - 42, "Yacht Selection")

    # Grid
    cols = 3
    gap = 24
    usable_w = PAGE_W - 2 * M - (cols - 1) * gap
    col_w = usable_w / cols
    img_h = 130
    card_h = 210
    y_start = PAGE_H - M_TOP - 80

    discount = proposal.get("discount", 0)

    for i, yacht in enumerate(yachts):
        row = i // cols
        col = i % cols
        x = M + col * (col_w + gap)
        y = y_start - row * (card_h + 10)

        # Image placeholder
        c.setFillColor(CREAM)
        c.rect(x, y - img_h, col_w, img_h, fill=1, stroke=0)
        c.setFont("Poppins-Light", 8)
        c.setFillColor(LIGHT_GREY)
        c.drawCentredString(x + col_w / 2, y - img_h / 2 - 3, "Exterior Image")

        # Yacht name (Lora serif)
        ny = y - img_h - 20
        c.setFont("Lora", 15)
        c.setFillColor(DARK)
        c.drawString(x, ny, yacht["name"])

        # Subtitle
        c.setFont("Poppins-Light", 9)
        c.setFillColor(SLATE)
        c.drawString(x, ny - 16, f"{yacht['length_m']}m  |  {yacht['builder']}  |  {year_str(yacht)}")

        # Rate
        price_lo = fmt_price(yacht["price_low"], discount)
        price_hi = fmt_price(yacht["price_high"], discount)
        c.setFont("Poppins", 9)
        c.setFillColor(DARK)
        c.drawString(x, ny - 38, f"Low {price_lo}     High {price_hi}")

        # Red underline accent
        c.setStrokeColor(RED)
        c.setLineWidth(1.5)
        c.line(x, ny - 48, x + 25, ny - 48)

    draw_bottom_rule(c)
    draw_page_num(c, page_num)
    c.showPage()


# ══════════════════════════════════════════════════
# INDIVIDUAL YACHT DETAIL PAGES
# ══════════════════════════════════════════════════
def draw_yacht_detail(c, yacht, proposal, page_num):
    """Left: hero + gallery. Right: name, specs table, features, rate.
    Brand-aligned with Lora headings, Poppins labels, red dividers."""
    c.setFillColor(WARM_WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    draw_brand_header(c, proposal.get("broker_friendly"))

    discount = proposal.get("discount", 0)
    mid_x = PAGE_W * 0.50

    # ── LEFT: Images ──
    hero_x = M
    hero_y_top = PAGE_H - M_TOP - 20
    hero_w = mid_x - M - 30
    hero_h = 310

    # Hero image placeholder
    c.setFillColor(CREAM)
    c.rect(hero_x, hero_y_top - hero_h, hero_w, hero_h, fill=1, stroke=0)
    c.setFont("Poppins-Light", 9)
    c.setFillColor(LIGHT_GREY)
    c.drawCentredString(hero_x + hero_w / 2, hero_y_top - hero_h / 2, "Hero Exterior Image")

    # Gallery row (3x2 grid)
    gallery_y = hero_y_top - hero_h - 8
    gw = (hero_w - 10) / 3
    gh = 72
    for row in range(2):
        for col in range(3):
            gx = hero_x + col * (gw + 5)
            gy = gallery_y - row * (gh + 5) - gh
            c.setFillColor(HexColor("#ece8e0"))
            c.rect(gx, gy, gw, gh, fill=1, stroke=0)

    # ── RIGHT: Specs ──
    sx = mid_x
    sw = PAGE_W - mid_x - M

    # Yacht name
    ny = PAGE_H - M_TOP - 18
    c.setFont("Lora", 26)
    c.setFillColor(DARK)
    c.drawString(sx, ny, yacht["name"])

    # Subtitle
    c.setFont("Poppins-Light", 10)
    c.setFillColor(SLATE)
    c.drawString(sx, ny - 24, f"{yacht['length_m']}m  |  {yacht['builder']}  |  {year_str(yacht)}")

    # Red divider
    c.setStrokeColor(RED)
    c.setLineWidth(2)
    c.line(sx, ny - 42, sx + 30, ny - 42)

    # Specs table
    specs = [
        ("LENGTH", f"{yacht['length_m']}m / {m_to_ft(yacht['length_m'])}"),
        ("BUILDER", yacht["builder"]),
        ("YEAR", year_str(yacht)),
        ("GUESTS", str(yacht["guests"])),
        ("CABINS", str(yacht["cabins"])),
        (None, yacht["cabin_config"]),  # continuation
        ("CREW", str(yacht["crew"])),
        ("SUMMER BASE", yacht.get("summer_port", "—")),
        ("WINTER BASE", yacht.get("winter_port", "—")),
    ]

    sy = ny - 65
    for label, value in specs:
        if label:
            # Divider line above each spec
            c.setStrokeColor(DIVIDER_LIGHT)
            c.setLineWidth(0.3)
            c.line(sx, sy + 12, sx + sw, sy + 12)

            c.setFont("Poppins-Bold", 7.5)
            c.setFillColor(DARK)
            c.drawString(sx, sy, label)
            c.setFont("Poppins", 10)
            c.setFillColor(SLATE)
            c.drawString(sx + 110, sy, value)
        else:
            c.setFont("Poppins-Light", 9)
            c.setFillColor(SLATE)
            c.drawString(sx + 110, sy, value)
        sy -= 22

    # Key features
    if yacht.get("features"):
        sy -= 6
        c.setStrokeColor(RED)
        c.setLineWidth(2)
        c.line(sx, sy + 8, sx + 30, sy + 8)
        sy -= 10

        c.setFont("Poppins-Bold", 7.5)
        c.setFillColor(DARK)
        c.drawString(sx, sy, "KEY FEATURES")
        sy -= 18

        for feat in yacht["features"][:5]:
            c.setFont("Poppins-Light", 9)
            c.setFillColor(SLATE)
            c.drawString(sx + 8, sy, f"•  {feat}")
            sy -= 16

    # Weekly charter rate
    sy -= 12
    c.setStrokeColor(RED)
    c.setLineWidth(2)
    c.line(sx, sy + 8, sx + 30, sy + 8)
    sy -= 10

    c.setFont("Poppins-Bold", 7.5)
    c.setFillColor(DARK)
    c.drawString(sx, sy, "WEEKLY CHARTER RATE")
    sy -= 22

    c.setFont("Poppins-Light", 10)
    c.setFillColor(SLATE)
    c.drawString(sx, sy, "Low Season")
    c.setFont("Lora", 14)
    c.setFillColor(DARK)
    c.drawString(sx + 110, sy - 1, fmt_price(yacht["price_low"], discount))
    sy -= 22

    c.setFont("Poppins-Light", 10)
    c.setFillColor(SLATE)
    c.drawString(sx, sy, "High Season")
    c.setFont("Lora", 14)
    c.setFillColor(DARK)
    c.drawString(sx + 110, sy - 1, fmt_price(yacht["price_high"], discount))

    if discount > 0:
        sy -= 22
        c.setFont("Poppins-Light", 7.5)
        c.setFillColor(RED)
        c.drawString(sx, sy, f"* {discount}% exclusive discount applied")

    # E-Brochure button
    sy -= 26
    btn_w = 100
    btn_h = 22
    c.setStrokeColor(DARK)
    c.setLineWidth(0.6)
    c.rect(sx, sy - 2, btn_w, btn_h, fill=0, stroke=1)
    c.setFont("Poppins-Medium", 7.5)
    c.setFillColor(DARK)
    c.drawCentredString(sx + btn_w / 2, sy + 4, "E-BROCHURE")

    draw_bottom_rule(c)
    draw_page_num(c, page_num)
    c.showPage()


# ══════════════════════════════════════════════════
# COMPARISON TABLE
# ══════════════════════════════════════════════════
def draw_comparison(c, yachts, proposal, page_num):
    """Side-by-side spec comparison. Brand typography."""
    c.setFillColor(WARM_WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    draw_brand_header(c, proposal.get("broker_friendly"))

    discount = proposal.get("discount", 0)
    n = len(yachts)

    # Title
    c.setFont("Lora", 26)
    c.setFillColor(RED)
    c.drawString(M, PAGE_H - M_TOP - 42, "Yacht Comparisons")

    # Image row
    label_w = 110
    col_w = (PAGE_W - 2 * M - label_w) / n
    img_y = PAGE_H - M_TOP - 66
    img_h = 58

    for i, yacht in enumerate(yachts):
        x = M + label_w + i * col_w
        c.setFillColor(CREAM)
        c.rect(x + 3, img_y - img_h, col_w - 6, img_h, fill=1, stroke=0)

    # Table rows
    rows = [
        ("YACHT NAME", [y["name"] for y in yachts], True),
        ("BUILDER", [y["builder"] for y in yachts], False),
        ("YEAR / REFIT", [year_str(y) for y in yachts], False),
        ("LENGTH", [f"{y['length_m']}m / {m_to_ft(y['length_m'])}" for y in yachts], False),
        ("GUESTS", [str(y["guests"]) for y in yachts], False),
        ("CABINS", [str(y["cabins"]) for y in yachts], False),
        ("CABIN CONFIG", [y["cabin_config"] for y in yachts], False),
        ("CREW", [str(y["crew"]) for y in yachts], False),
        ("SUMMER BASE", [y.get("summer_port", "—") for y in yachts], False),
        ("WINTER BASE", [y.get("winter_port", "—") for y in yachts], False),
        ("LOW SEASON", [fmt_price(y["price_low"], discount) for y in yachts], False),
        ("HIGH SEASON", [fmt_price(y["price_high"], discount) for y in yachts], False),
    ]

    row_h = 24
    table_y = img_y - img_h - 18

    for ri, (label, values, is_header) in enumerate(rows):
        y = table_y - ri * row_h

        # Divider
        c.setStrokeColor(DIVIDER_LIGHT)
        c.setLineWidth(0.3)
        c.line(M, y - 5, PAGE_W - M, y - 5)

        # Label
        c.setFont("Poppins-Bold", 7.5)
        c.setFillColor(DARK)
        c.drawString(M, y + 3, label)

        # Values
        for i, val in enumerate(values):
            x = M + label_w + i * col_w
            if is_header:
                c.setFont("Lora", 11)
                c.setFillColor(DARK)
            else:
                c.setFont("Poppins", 9)
                c.setFillColor(SLATE)
            # Truncate
            disp = val if len(val) <= 22 else val[:20] + "..."
            c.drawString(x + 4, y + 3, disp)

    # Discount note
    if discount > 0:
        ny = table_y - len(rows) * row_h - 12
        c.setFont("Poppins-Light", 7.5)
        c.setFillColor(RED)
        c.drawString(M, ny, f"* {discount}% exclusive discount applied to all rates")

    draw_bottom_rule(c)
    draw_page_num(c, page_num)
    c.showPage()


# ══════════════════════════════════════════════════
# BROKER BIO
# ══════════════════════════════════════════════════
def draw_broker(c, broker, page_num):
    """Circular photo + bio. Brand typography."""
    c.setFillColor(WARM_WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    draw_brand_header(c)

    # Photo
    photo_cx = M + 140
    photo_cy = PAGE_H / 2 + 30
    photo_r = 95

    photo_path = "/home/claude/josh_img-002.jpg"
    if os.path.exists(photo_path):
        c.saveState()
        path = c.beginPath()
        path.circle(photo_cx, photo_cy, photo_r)
        path.close()
        c.clipPath(path, stroke=0)
        c.drawImage(photo_path,
                    photo_cx - photo_r, photo_cy - photo_r * 1.1,
                    width=photo_r * 2, height=photo_r * 2.2,
                    preserveAspectRatio=True, mask='auto')
        c.restoreState()
    else:
        c.setFillColor(CREAM)
        c.circle(photo_cx, photo_cy, photo_r, fill=1, stroke=0)

    # Name (red display heading — brand style)
    bio_x = PAGE_W / 2 - 40
    c.setFont("Lora", 28)
    c.setFillColor(RED)
    c.drawString(bio_x, PAGE_H - 160, broker["name"])

    # Red divider
    c.setStrokeColor(RED)
    c.setLineWidth(2)
    c.line(bio_x, PAGE_H - 178, bio_x + 30, PAGE_H - 178)

    # Contact
    c.setFont("Poppins-Light", 10)
    c.setFillColor(SLATE)
    c.drawString(bio_x, PAGE_H - 200, broker["email"])
    c.drawString(bio_x, PAGE_H - 216, broker["phone"])

    # Bio
    wrap_text(c, broker["bio"], bio_x, PAGE_H - 250,
              "Poppins-Light", 10, PAGE_W - bio_x - M - 10, DARK, 18)

    draw_bottom_rule(c)
    draw_page_num(c, page_num)
    c.showPage()


# ══════════════════════════════════════════════════
# CLOSING PAGE
# ══════════════════════════════════════════════════
def draw_closing(c, proposal):
    """Split layout: left image area, right navy with logo + offices + socials.
    Matches Roccabella presentation closing page style."""
    bf = proposal.get("broker_friendly", False)

    # Left half — cream
    c.setFillColor(CREAM)
    c.rect(0, 0, PAGE_W / 2, PAGE_H, fill=1, stroke=0)

    # Right half — navy
    c.setFillColor(NAVY)
    c.rect(PAGE_W / 2, 0, PAGE_W / 2, PAGE_H, fill=1, stroke=0)

    # Left side tagline
    lx = PAGE_W / 4
    c.setFont("Lora-Italic", 18)
    c.setFillColor(DARK)
    c.drawCentredString(lx, PAGE_H / 2 + 14, "An Experience")
    c.drawCentredString(lx, PAGE_H / 2 - 14, "Like No Other")

    # Right side
    rx = PAGE_W / 2 + 70
    rcx = PAGE_W * 3 / 4

    if not bf:
        # Actual white logo PNG
        logo_white_path = "/home/claude/logo_white_alpha.png"
        if os.path.exists(logo_white_path):
            logo_w_pt = 200
            logo_h_pt = logo_w_pt * (173 / 752)
            c.drawImage(logo_white_path, rcx - logo_w_pt / 2, PAGE_H - 155,
                        width=logo_w_pt, height=logo_h_pt,
                        preserveAspectRatio=True, mask='auto')

        # Offices
        oy = PAGE_H / 2 + 30
        c.setFont("Poppins-Medium", 8)
        c.setFillColor(HexColor("#ffffffbb"))
        c.drawString(rx, oy, "OFFICES")
        oy -= 22
        for office in ["London", "Dubai", "Geneva", "Palma", "Miami"]:
            c.setFont("Poppins-Light", 10)
            c.setFillColor(WHITE)
            c.drawString(rx, oy, office)
            oy -= 17

        # Connect
        oy -= 16
        c.setFont("Poppins-Medium", 8)
        c.setFillColor(HexColor("#ffffffbb"))
        c.drawString(rx, oy, "CONNECT")
        oy -= 22
        c.setFont("Poppins-Light", 10)
        c.setFillColor(WHITE)
        c.drawString(rx, oy, "roccabellayachts.com")
        c.drawString(rx, oy - 17, "instagram.com/roccabella_yachts")

    # Copyright
    c.setFont("Poppins-Light", 7)
    c.setFillColor(HexColor("#ffffff88"))
    copy = "All rights reserved. © 2026 Roccabella Yachts Ltd." if not bf else "All particulars given in good faith and believed correct but not guaranteed."
    c.drawString(rx, 28, copy)

    c.showPage()


# ══════════════════════════════════════════════════
# GENERATE
# ══════════════════════════════════════════════════
def generate(output, proposal, yachts, broker):
    c = canvas.Canvas(output, pagesize=landscape(A4))
    c.setTitle(f"Roccabella Yachts — {proposal['title']}")
    c.setAuthor("Roccabella Yachts")
    c.setSubject(f"Charter Proposal for {proposal['client_name']}")

    pn = 1

    # 1. Cover
    draw_cover(c, proposal)
    pn += 1

    # 2. Intro (client-facing)
    if not proposal.get("broker_friendly"):
        draw_intro(c, proposal, pn)
        pn += 1

    # 3. Yacht selection overview
    draw_selection(c, yachts, proposal, pn)
    pn += 1

    # 4. Individual details
    for yacht in yachts:
        draw_yacht_detail(c, yacht, proposal, pn)
        pn += 1

    # 5. Comparison table
    draw_comparison(c, yachts, proposal, pn)
    pn += 1

    # 6. Broker bio (client-facing)
    if not proposal.get("broker_friendly"):
        draw_broker(c, broker, pn)
        pn += 1

    # 7. Closing
    draw_closing(c, proposal)

    c.save()
    print(f"Generated: {output} ({pn} pages)")


if __name__ == "__main__":
    generate("/home/claude/roccabella_proposal_v2.pdf", PROPOSAL, YACHTS, BROKER)
