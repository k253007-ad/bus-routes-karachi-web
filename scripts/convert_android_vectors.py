"""Convert the app's original VectorDrawable bus artwork to web SVG files."""

from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "BusRoutesKarachi/app/src/main/res/drawable"
DEST = ROOT / "website/public/images"
NAMES = (
    "ic_double_decker", "ic_greenline", "ic_orangeline", "ic_metro",
    "ic_red", "ic_pink", "ic_ev", "ic_mini", "ic_coach", "ic_bus",
    "ic_rickshaw", "img_busses_banner", "img_buses_on_route",
    "start_stop_poll",
)
# The app vectors were drawn on roomy square canvases. Frame the artwork itself
# so the vehicles remain legible in small website cards.
FRAMES = {
    "ic_bus": (4, 37, 190, 130),
    "ic_coach": (4, 35, 192, 140),
    "ic_double_decker": (140, 130, 1040, 740),
    "ic_ev": (4, 35, 192, 132),
    "ic_greenline": (4, 36, 190, 128),
    "ic_metro": (4, 36, 190, 128),
    "ic_mini": (1, 17, 140, 108),
    "ic_orangeline": (4, 36, 190, 128),
    "ic_pink": (4, 36, 190, 128),
    "ic_red": (4, 36, 190, 128),
    "ic_rickshaw": (0, 50, 512, 420),
}
ANDROID = "{http://schemas.android.com/apk/res/android}"
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)


def attr(element, name, default=None):
    return element.get(ANDROID + name, default)


def color(value):
    if not value:
        return None, 1.0
    if len(value) == 9 and value.startswith("#"):
        return "#" + value[3:], int(value[1:3], 16) / 255
    return value, 1.0


def make_gradient(source, defs, gradient_id):
    kind = attr(source, "type", "linear")
    if kind == "radial":
        target = ET.SubElement(defs, f"{{{SVG}}}radialGradient", {
            "id": gradient_id,
            "gradientUnits": "userSpaceOnUse",
            "cx": attr(source, "centerX", "0"),
            "cy": attr(source, "centerY", "0"),
            "r": attr(source, "gradientRadius", "1"),
        })
    else:
        target = ET.SubElement(defs, f"{{{SVG}}}linearGradient", {
            "id": gradient_id,
            "gradientUnits": "userSpaceOnUse",
            "x1": attr(source, "startX", "0"),
            "y1": attr(source, "startY", "0"),
            "x2": attr(source, "endX", "0"),
            "y2": attr(source, "endY", "0"),
        })
    for item in source:
        value, opacity = color(attr(item, "color"))
        ET.SubElement(target, f"{{{SVG}}}stop", {
            "offset": attr(item, "offset", "0"),
            "stop-color": value or "#000000",
            "stop-opacity": str(round(opacity, 5)),
        })


def convert(source_path, name):
    source = ET.parse(source_path).getroot()
    width = attr(source, "viewportWidth")
    height = attr(source, "viewportHeight")
    svg = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": f"0 0 {width} {height}", "width": width, "height": height,
        "role": "img",
    })
    defs = ET.SubElement(svg, f"{{{SVG}}}defs")
    gradient_number = 0

    def add_element(element, parent):
        nonlocal gradient_number
        tag = element.tag.rsplit("}", 1)[-1]
        if tag == "group":
            transforms = []
            tx, ty = attr(element, "translateX", "0"), attr(element, "translateY", "0")
            sx, sy = attr(element, "scaleX", "1"), attr(element, "scaleY", "1")
            if tx != "0" or ty != "0":
                transforms.append(f"translate({tx} {ty})")
            if sx != "1" or sy != "1":
                transforms.append(f"scale({sx} {sy})")
            group = ET.SubElement(parent, f"{{{SVG}}}g", {"transform": " ".join(transforms)})
            for child in element:
                add_element(child, group)
            return
        if tag != "path":
            return
        data = {"d": attr(element, "pathData", "")}
        fill, fill_opacity = color(attr(element, "fillColor"))
        for child in element:
            gradient = next((part for part in child if part.tag.endswith("gradient")), None)
            if gradient is not None:
                gradient_number += 1
                gradient_id = f"g{gradient_number}"
                make_gradient(gradient, defs, gradient_id)
                fill = f"url(#{gradient_id})"
        data["fill"] = fill or "none"
        data["fill-opacity"] = str(round(fill_opacity * float(attr(element, "fillAlpha", "1")), 5))
        stroke, stroke_opacity = color(attr(element, "strokeColor"))
        if stroke:
            data["stroke"] = stroke
            data["stroke-opacity"] = str(round(stroke_opacity * float(attr(element, "strokeAlpha", "1")), 5))
            data["stroke-width"] = attr(element, "strokeWidth", "1")
        if attr(element, "fillType") == "evenOdd":
            data["fill-rule"] = "evenodd"
        for android_name, svg_name in (("strokeLineCap", "stroke-linecap"), ("strokeLineJoin", "stroke-linejoin")):
            if attr(element, android_name):
                data[svg_name] = attr(element, android_name)
        ET.SubElement(parent, f"{{{SVG}}}path", data)

    for child in source:
        add_element(child, svg)
    if not list(defs):
        svg.remove(defs)
    if name in FRAMES:
        x, y, framed_width, framed_height = FRAMES[name]
        svg.set("viewBox", f"{x} {y} {framed_width} {framed_height}")
        svg.set("width", str(framed_width))
        svg.set("height", str(framed_height))
    if name in ("ic_red", "ic_pink"):
        # Glass glints, a small route display, and body trim sit on the
        # original silhouettes without replacing the app's familiar artwork.
        ET.SubElement(svg, f"{{{SVG}}}path", {"d": "M36 68 49 59 58 59 42 80Z", "fill": "#ffffff", "opacity": "0.16"})
        ET.SubElement(svg, f"{{{SVG}}}path", {"d": "M101 75 127 80 125 83 99 79Z", "fill": "#ffffff", "opacity": "0.17"})
        ET.SubElement(svg, f"{{{SVG}}}rect", {"x": "119", "y": "67", "width": "17", "height": "5", "rx": "1", "fill": "#ffe49b", "opacity": "0.92"})
        ET.SubElement(svg, f"{{{SVG}}}path", {"d": "M99 109 161 111", "fill": "none", "stroke": "#ffffff", "stroke-width": "1.4", "opacity": "0.32"})
    if name == "ic_ev":
        ET.SubElement(svg, f"{{{SVG}}}path", {"d": "M32 73 46 59 53 59 39 80Z", "fill": "#ffffff", "opacity": "0.22"})
        ET.SubElement(svg, f"{{{SVG}}}path", {"d": "M101 116 158 111", "fill": "none", "stroke": "#45c6cd", "stroke-width": "2.6", "opacity": "0.9"})
    if name in ("ic_metro", "ic_greenline", "ic_orangeline"):
        ET.SubElement(svg, f"{{{SVG}}}path", {"d": "M28 73 42 59 49 59 36 78Z", "fill": "#ffffff", "opacity": "0.16"})
        ET.SubElement(svg, f"{{{SVG}}}path", {"d": "M105 112 170 117", "fill": "none", "stroke": "#ffffff", "stroke-width": "1.7", "opacity": "0.5"})
    return ET.tostring(svg, encoding="unicode")


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        (DEST / f"{name}.svg").write_text(convert(SOURCE / f"{name}.xml", name), encoding="utf-8")
    print(f"Converted {len(NAMES)} original Android images to {DEST}")


if __name__ == "__main__":
    main()
