# Activity proofs

Live GraphQL checks for `syncActivity`. The backend only stores what the phone posts. One HealthKit sample = one node. A batch is not stored. Same `sourceId` for that patient updates the same node.

Run in **Terminal**, not GraphQL Playground.

## Before you run

```sh
make up
curl http://localhost:8080/ping
```

## Re-run

From the repo root:

```sh
python3 src/domains/activity/tests/run.py
```

Accounts (created on first run, password `password123`):

- `patient@example.com` — PATIENT who writes samples
- `caregiver@example.com` — CAREGIVER who must be refused

## What this proves

1. No token is refused
2. Caregiver cannot sync
3. Patient can send one sample with heart rate
4. Same `sourceId` again → same node, numbers updated
5. New `sourceId` → new node; heart rate may be omitted
6. A batch of two samples → two nodes
7. Empty `sourceId` → `invalid_source_id`
8. Negative steps → `invalid_activity`
9. `heartRate: 0` → `invalid_heart_rate`
