"""Apply reviewed SMTA corrections and rebuild bundled lookup indexes."""
from pathlib import Path
from itertools import combinations
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'


def apply_reviewed_updates(routes, stops, mapping):
    updates = json.loads((ROOT / 'src/routeUpdates2026.json').read_text(encoding='utf-8'))
    route_rows = {row.split('@')[0]: row for row in routes}
    stop_rows = {row.split('@')[0]: row for row in stops}
    mapping = dict(mapping)
    if len(route_rows) != len(routes) or len(stop_rows) != len(stops):
        raise ValueError('Duplicate identifiers in base snapshot')
    for row in updates['stopRows']:
        stop_rows[row.split('@')[0]] = row
    for change in updates['changes']:
        route_rows[change['id']] = change['row']
        mapping[change['id']] = ', '.join(change['stops'])
    if set(mapping) != set(route_rows):
        raise ValueError('Route mapping does not match routes')
    reverse = {stop: [] for stop in stop_rows}
    pairs = {}
    for route_id, row in route_rows.items():
        fields = row.split('@')
        sequence = [value.strip() for value in mapping[route_id].split(',')]
        if len(fields) != 7 or not sequence or fields[5] != sequence[0] or fields[6] != sequence[-1]:
            raise ValueError(f'Invalid endpoints: {route_id}')
        for stop in set(sequence):
            if stop not in reverse:
                raise ValueError(f'Unknown stop: {stop}')
            reverse[stop].append(route_id)
        for first, last in combinations(sorted(set(sequence)), 2):
            pairs.setdefault(f'{first}-{last}', []).append(route_id)
    return {'routes': list(route_rows.values()), 'stops': list(stop_rows.values()),
            'stops_on_a_route': mapping,
            'routes_on_a_stop': {key: ', '.join(value) for key, value in reverse.items()},
            'routes_btw_stops': {key: ', '.join(value) for key, value in pairs.items()}}


def save_snapshot(values):
    backup = ROOT / '.route-backups/before-smta-2026-10-22.zip'
    backup.parent.mkdir(exist_ok=True)
    if not backup.exists():
        with zipfile.ZipFile(backup, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name in values:
                path = DATA / f'{name}.json'
                if path.exists():
                    archive.write(path, path.name)
    for name, value in values.items():
        path = DATA / f'{name}.json'
        temporary = path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        temporary.replace(path)


if __name__ == '__main__':
    load = lambda name: json.loads((DATA / f'{name}.json').read_text(encoding='utf-8'))
    values = apply_reviewed_updates(load('routes'), load('stops'), load('stops_on_a_route'))
    save_snapshot(values)
    print(f"Verified snapshot: {len(values['routes'])} routes, {len(values['stops'])} stops/areas; all indexes rebuilt.")
