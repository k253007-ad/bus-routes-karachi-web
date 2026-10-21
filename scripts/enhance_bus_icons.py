"""Reproduce the earlier detail pass in the archive, preserving current user artwork."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ORIGINALS = ROOT / "design-backup" / "original-bus-art"
OUTPUT = ROOT / "design-backup" / "generated-detail-pass"


def modern_bus(accent: str, label: str) -> str:
    return f"""
<g id="vehicle-details" pointer-events="none">
  <path d="M27 80 38 75m5 5 7-4M104 85l14 3m15 3 13 2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".34"/>
  <path d="M100 109 158 111" fill="none" stroke="#fff" stroke-width="1.1" opacity=".5"/>
  <path d="M96 111 93 126m28-16-1 16m20-18-1 15m21-17-1 15" fill="none" stroke="#0d2030" stroke-width=".8" opacity=".42"/>
  <path d="M21 128h7m48 10h6" stroke="#fff8c5" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M37 141h21" stroke="#f6f8f9" stroke-width="1.3" opacity=".55"/>
  <circle cx="126" cy="136" r="3.7" fill="#dbe6e9"/><circle cx="126" cy="136" r="1.5" fill="#718791"/>
  <circle cx="174" cy="123" r="2.2" fill="#dbe6e9"/>
  <rect x="119" y="67.3" width="17" height="5.2" rx="1" fill="{accent}"/>
  <text x="127.5" y="71.2" text-anchor="middle" font-family="Arial,sans-serif" font-size="3.8" font-weight="700" fill="#14202c">{label}</text>
</g>"""


def metro_bus(label: str) -> str:
    return f"""
<g id="vehicle-details" pointer-events="none">
  <path d="M25 82 37 76m7 5 8-4M99 83l15 3m15 3 14 3" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity=".42"/>
  <path d="M98 111 163 112" fill="none" stroke="#f7fff4" stroke-width="1.5" opacity=".72"/>
  <path d="M113 84v25m21-20v21m20-17v19" fill="none" stroke="#162a25" stroke-width=".7" opacity=".48"/>
  <path d="M22 125h8m48 10h6" stroke="#f6fbde" stroke-width="2.7" stroke-linecap="round"/>
  <circle cx="114" cy="140" r="3.2" fill="#d9e6dc"/><circle cx="114" cy="140" r="1.4" fill="#5e7467"/>
  <circle cx="169" cy="125" r="2.1" fill="#d9e6dc"/>
  <rect x="39" y="64" width="34" height="6.2" rx="1.4" fill="#142823"/>
  <text x="56" y="68.7" text-anchor="middle" font-family="Arial,sans-serif" font-size="4.5" font-weight="700" fill="#f7f7de">{label}</text>
</g>"""


DETAILS = {
    "ic_red.svg": modern_bus("#ffe59c", "KHI"),
    "ic_pink.svg": modern_bus("#ffe59c", "KHI"),
    "ic_ev.svg": modern_bus("#c9f7f2", "EV"),
    "ic_metro.svg": metro_bus("METRO"),
    "ic_greenline.svg": metro_bus("GREEN LINE"),
    "ic_orangeline.svg": metro_bus("ORANGE LINE"),
    "ic_double_decker.svg": """
<g id="vehicle-details" pointer-events="none">
  <path d="M440 278 475 246m84 66 31-18m130 72 28-14m104 55 20-9M400 490l14-11m178 37 16-13m204 45 12-12" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" opacity=".17"/>
  <path d="M552 646 903 651" fill="none" stroke="#ffdbd3" stroke-width="8" opacity=".65"/>
  <circle cx="676" cy="750" r="19" fill="#e3e5e4"/><circle cx="676" cy="750" r="9" fill="#8b999c"/>
  <circle cx="1041" cy="692" r="6" fill="#d9dddc"/>
  <rect x="233" y="661" width="28" height="18" rx="5" fill="#fff3cc"/>
  <rect x="300" y="671" width="28" height="17" rx="5" fill="#fff3cc"/>
  <rect x="263" y="704" width="43" height="15" rx="3" fill="#f2eee8"/>
  <path d="M235 733h91" stroke="#801a18" stroke-width="9" stroke-linecap="round"/>
</g>""",
    "ic_rickshaw.svg": """
<g id="vehicle-details" pointer-events="none">
  <path d="M91 90h248" fill="none" stroke="#aabec7" stroke-width="5" stroke-linecap="round" opacity=".45"/>
  <path d="M207 147v87m7-87v87M346 148l33 8" fill="none" stroke="#f8faf8" stroke-width="4" opacity=".4"/>
  <path d="M189 312h122" fill="none" stroke="#fff5c9" stroke-width="5" stroke-linecap="round" opacity=".65"/>
  <path d="M251 345h41" stroke="#e88937" stroke-width="4" stroke-linecap="round"/>
  <circle cx="66" cy="397" r="12" fill="#f8faf8"/><circle cx="66" cy="397" r="5" fill="#87969b"/>
  <circle cx="423" cy="397" r="12" fill="#f8faf8"/><circle cx="423" cy="397" r="5" fill="#87969b"/>
  <rect x="337" y="76" width="50" height="11" rx="3" fill="#f4ca67"/>
</g>""",
}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, details in DETAILS.items():
        source = (ORIGINALS / name).read_text(encoding="utf-8")
        if source.count("</svg>") != 1:
            raise ValueError(f"Unexpected SVG structure: {name}")
        (OUTPUT / name).write_text(source.replace("</svg>", details + "</svg>"), encoding="utf-8")
        print(name)


if __name__ == "__main__":
    main()
