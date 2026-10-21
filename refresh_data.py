"""Refresh public Firebase data while preserving reviewed SMTA corrections."""
from urllib.request import urlopen
import json
from scripts.apply_route_updates import apply_reviewed_updates, save_snapshot

BASE = "https://busprojectmmd-default-rtdb.firebaseio.com"

def get(name):
    with urlopen(f"{BASE}/{name}.json", timeout=30) as response:
        return json.load(response)

def main():
    before = get("db_version")
    if type(before) is not int or before < 0:
        raise ValueError("Invalid online snapshot version")
    routes, stops, mapping = (get(name) for name in ("route_list", "stop_list", "stops_on_a_route"))
    if not isinstance(routes, list) or not isinstance(stops, list) or not isinstance(mapping, dict):
        raise ValueError("Invalid online snapshot; existing data retained")
    if len(routes) < 30 or len(stops) < 300 or get("db_version") != before:
        raise ValueError("Incomplete or changing online snapshot; existing data retained")
    result = apply_reviewed_updates(routes, stops, mapping)
    save_snapshot(result)
    print(f"Refreshed {len(result['routes'])} routes and {len(result['stops'])} stops/areas; reviewed SMTA corrections retained.")

if __name__ == "__main__":
    main()
