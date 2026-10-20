"""Refresh the public route snapshot after validating every download."""

from pathlib import Path
import json
from urllib.request import urlopen

BASE = "https://busprojectmmd-default-rtdb.firebaseio.com"
NAMES = {
    "route_list": "routes",
    "stop_list": "stops",
    "stops_on_a_route": "stops_on_a_route",
    "routes_on_a_stop": "routes_on_a_stop",
    "routes_btw_stops": "routes_btw_stops",
}
DATA = Path(__file__).parent / "public" / "data"


def main():
    downloaded = {}
    for remote, local in NAMES.items():
        with urlopen(f"{BASE}/{remote}.json", timeout=30) as response:
            value = json.load(response)
        if not isinstance(value, (list, dict)) or not value:
            raise ValueError(f"{remote} returned no usable data; existing files were kept")
        downloaded[local] = value

    routes = [entry for entry in downloaded["routes"] if entry]
    stops = [entry for entry in downloaded["stops"] if entry]
    if len(routes) < 30 or len(stops) < 300:
        raise ValueError("The new route snapshot is unexpectedly small; existing files were kept")
    DATA.mkdir(exist_ok=True)
    for name, value in downloaded.items():
        path = DATA / f"{name}.json"
        path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Updated {path.name}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
