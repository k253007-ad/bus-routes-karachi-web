# Karachi route data checked 22 October 2026

The existing public Firebase snapshot is reachable but still has 65 route entries,
571 stops and version 1769437824443. These corrections use the current
[SMTA directory](https://smta.gos.pk/route-map) and individual route pages. This is
a check date, not a claim that every listed route launched during 2026.

## Changes applied

| Service | Change | Primary source |
| --- | --- | --- |
| Route 14 | Add Maymar to Tower with published intermediate stops/areas | [SMTA R14](https://smta.gos.pk/routes/14) |
| EV-4 | Replace older Numaish corridor with published Bahria Town to Ayesha Manzil coverage | [SMTA EV-04](https://smta.gos.pk/routes/18) |
| Double Decker 1 | Replace Malir Halt–Zainab Market with Model Colony–Tower published coverage | [SMTA Double Decker](https://smta.gos.pk/routes/27) |
| Route 2 / existing Pink 2 alias | Retain detailed existing sequence and extend to Korangi Crossing | [SMTA R2](https://smta.gos.pk/routes/2) |
| Route 3 / existing Pink 3 alias | Retain detailed existing sequence and extend to Nasir Jump | [SMTA R3](https://smta.gos.pk/routes/3) |
| Route 4 | Correct Guru Mandar?Taj Complex?Sindh High Court corridor; extend through Jackson Market to Keamari | [SMTA R4](https://smta.gos.pk/routes/4) |
| EV-3 | Add published Malir Cantt areas before the existing Check Post 5 sequence | [SMTA EV-03](https://smta.gos.pk/routes/17) |

Result: **66 route entries, 586 named stops/areas**. Existing private-bus/metro
routes, route IDs, saved-link compatibility and original bus graphics remain.
Pink entries are retained aliases; they are not counted as newly discovered routes.
All reverse membership and pair indexes are regenerated from the reviewed sequence.

## Source limitations and conservative mapping

- SMTA calls the list **“stops and areas covered.”** It is not an exhaustive,
  geolocated boarding-stop inventory. Precise boarding locations, every minor
  stop and identical reverse service are not established by this source.
- Detail-list item 1 contains the entire `origin to destination via first area`
  description. It is not imported as a stop name. The Double Decker description
  repeats Malir Halt in that introductory phrase; its ordered entry after Model
  Colony Pathak is retained once. M9 is a road corridor, not a new boarding stop.
- Existing local names are reused where the coverage refers to the same area:
  Sorab/Sohrab Goth, Jamali Pull/Bridge, Al-Asif/Al Asif Square and
  Lalukhait/the existing Liaqatabad entry. These do not supply exact coordinates.
- R2/R3 keep earlier detailed stops along their existing corridor and append
  published endpoint extensions. This does not independently reverify every
  retained minor stop. R4 replaces the conflicting old Tibet Center branch with
  Guru Mandar, Taj Complex and Sindh High Court before Tower. R14, EV4 and
  Double Decker use the published coverage.
- R5/R6/R7 are marked **inactive** in the directory and were not added as working
  services. No announcement-only fleet or unfinished BRT line was added.
- The directory's downloadable PDF is dated **01/01/2025**, omits R14/Double
  Decker, and disagrees on some endpoints. It was not treated as a 2026 update.
- R11/R12/R13 descriptions conflict with older local data or contain ambiguous
  repeated areas. Those changes are deferred for stronger/local confirmation;
  the entire Karachi network is not represented as freshly verified.

## Refresh and rollback

`src/routeUpdates2026.json` records source URLs, review date, corrected rows and
sequences, prior rows/sequences, and unresolved cases. The production store reapplies
this set after validation on bundled, online and saved data. The raw Firebase
snapshot is cached without rewriting the server. A later SMTA review should update
or remove superseded overrides deliberately; a Firebase timestamp alone is not
proof that its route details supersede these corrections.

The local data script preserves an ignored pre-change ZIP and rebuilds all indexes.
`refresh_data.py` checks the remote version before/after download before applying
the same corrections. Tests cover merge idempotence, preserved IDs, trip membership,
and protection against an older online/cached snapshot restoring stale routes.
