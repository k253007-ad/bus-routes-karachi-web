# Realtime Database security deployment candidate

`database.rules.json` is a separately reviewed candidate for the original Firebase backend. It has **not been deployed**. The local runner uses only a fixed `demo-bustracking-security` namespace at `127.0.0.1:19000`; it does not read or modify the original Firebase project.

## What the rules enforce

- Public reads of existing route/version paths remain available. Their writes require an existing `admins/<uid>` value of the boolean `true`.
- Reports and route suggestions are private to trusted moderators. A submitter cannot read submissions, including their own, by fetching a collection or record.
- Guest submissions are create only, use their authenticated UID as `deviceId` or `userId`, and accept only explicit fields with bounded types and lengths. Route suggestions must start with `status: "pending"`; guests cannot add moderation fields.
- Feedback and route issues have a 60 second cooldown per UID and collection. Route suggestions have a 300 second cooldown. A server timestamp and matching submission ID bind the record to its cooldown ledger in the same atomic write.
- The ledger cannot be created alone, deleted, backdated, assigned to another UID, or used to insert multiple records in one collection. A rejected atomic update changes neither the record nor the ledger.
- Moderators can read, change supported moderation status/notes, and delete submissions. Existing owner fields remain immutable. Existing collection names and indexes are retained.
- Admin membership cannot be changed by a client, including an existing moderator. There is no email based admin fallback, and an admin entry containing `false` or the string `"true"` grants nothing. Use trusted owner tooling or the Firebase console to manage memberships.
- Old `rate_limits` guest writes and legacy guest writes to `pending_bus_submissions` are denied. Trusted moderators retain access to legacy administrative collections.

## Required client protocol

Send **one authenticated root PATCH** to `/.json?auth=<Firebase ID token>` with two flattened paths:

```js
{
  [`${collection}/${id}`]: payload,
  [`submission_limits/${uid}/${collection}`]: {
    timestamp: { '.sv': 'timestamp' },
    submissionId: id
  }
}
```

The payload's `timestamp` must also be `{ '.sv': 'timestamp' }`. Collection is `feedback`, `bus_feedback`, or `stops_pending`; submission IDs contain 10–100 ASCII letters, digits, `_`, or `-`.

The actual REST response nests these paths as objects:

```js
{
  [collection]: { [id]: { ...payload, timestamp: resolvedServerTime } },
  submission_limits: {
    [uid]: { [collection]: { timestamp: resolvedServerTime, submissionId: id } }
  }
}
```

Validate the returned record and ledger, including equal numeric timestamps. A root PATCH does not require a public root read. Emulator checks verify that its response contains only the submitted paths, including when other private records already exist or several authorized collections are updated together.

Preserve the draft ID on uncertain connection failures. Do not automatically resubmit with a new ID: the original write may already have committed, and a subsequent create-only retry can be denied. These rules deliberately do not grant private record reads to resolve that uncertainty.

## Deployment and migration requirements

This is a coordinated backend and client migration. **Existing clients that send a single record PUT, omit the ledger, or use the old writable rate-limit path will be denied by this candidate.** Conversely, old deployed rules may deny the new ledger path. Updating the APK alone does not deploy server enforcement.

Before a backend owner considers deployment:

1. Export and retain a backup of the current deployed rules and data through trusted owner tooling. Inventory active Android, web, and admin client versions in staging; do not assume all versions use the new protocol.
2. Verify the exact moderator UIDs in staging and establish `admins/<uid>: true` through trusted owner tooling. Existing email based grants or nonboolean membership values do not survive this change. Confirm legitimate moderators can authenticate and access their screens before rollout.
3. Inventory historical submission schemas using owner credentials in staging, then migrate or archive incompatible rows with a reviewed, auditable procedure. This audit did not inspect private production records. Required fields now include `deviceId` and numeric `timestamp` on feedback; `deviceId`, `feed`, matching `feedType`, and numeric `timestamp` on route issues; and matching `id`, `userId`, and numeric `timestamp` on route suggestions. Missing fields, unknown extras, invalid lengths/types, or unsupported statuses can cause even a moderator's status/notes update to fail validation. Do not fabricate missing ownership; resolve provenance or archive those records before deployment.
4. Validate the staged data and all supported moderation operations against these exact rules. Feedback statuses are `unresolved`, `resolved`, and `spam`; route suggestion statuses are `pending`, `approved`, and `rejected`. Notes are at most 2000 characters. Trusted owner tooling remains available for migration or exceptional schema repair.
5. Migrate every supported submitting client to the atomic protocol and arrange rollout/retirement of incompatible versions. Review a rollback plan against both rules and client versions. Only the backend owner should deploy after reviewing the staging results and compatibility plan.

The cooldown is per Firebase UID. Someone who repeatedly creates new anonymous accounts can obtain new quotas; these rules do not claim to prevent that abuse. Broader abuse controls require a reviewed backend/App Check and operational quota strategy. The separate reviews API is outside this rules file.

## Run the real local emulator checks

The website's existing Firebase SDK is the only Node dependency. Run `npm ci` in `website` if it is not already installed. The runner can use the Java 21 installation under `.android-build-tools/jdk`, or `java` on PATH.

The pinned official Realtime Database emulator is v4.11.2. Its URL and checksum were obtained from `firebase-tools@15.34.0`'s `lib/emulator/downloadableEmulatorInfo.json` on the npm registry:

```text
https://storage.googleapis.com/firebase-preview-drop/emulator/firebase-database-emulator-v4.11.2.jar
SHA256 b70d99344caf17c98b6f910fa8f6edf32a7c016cb1035e8915f70d38901eb97f
Size   34495935 bytes
```

From the workspace root in PowerShell:

```powershell
New-Item -ItemType Directory -Force .android-build-tools/security-emulator | Out-Null
curl.exe --fail --location --output .android-build-tools/security-emulator/firebase-database-emulator-v4.11.2.jar https://storage.googleapis.com/firebase-preview-drop/emulator/firebase-database-emulator-v4.11.2.jar
node website/security/test-rules.mjs --start
```

The runner verifies the JAR's SHA256, refuses to start over an occupied port, runs Java with a hidden window, compiles/loads this exact rules file into the local emulator, seeds synthetic fixtures, runs the checks, and stops its emulator. Logs stay under `.android-build-tools/security-emulator`. Running without `--start` requires a Realtime Database emulator already listening at that fixed loopback address. Either mode replaces only the fixed demo namespace's rules and synthetic test data.

Validated: **116 real emulator checks** covering all three submission types, invalid payloads, extra privileged fields, spoofed ownership/status, private reads, ledger tampering and cooldowns, concurrent/multiple-record submissions, moderator permissions, and actual nested REST response behavior. The tests use synthetic emulator identities; no production credentials or services are needed.

Firebase references: [rule conditions and merged data](https://firebase.google.com/docs/database/security/rules-conditions), [Realtime Database emulator connections and demo projects](https://firebase.google.com/docs/emulator-suite/connect_rtdb).
