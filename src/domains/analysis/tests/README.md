# Analysis proofs

Live GraphQL checks for `dashboard` and `patientDashboard`. Analysis is computed on query. It is not stored as a graph node. This is a report (daily rollups + threshold alerts), not a glucose predictor.

Run in **Terminal**, not GraphQL Playground.

## Before you run

```sh
make up
curl http://localhost:8080/ping
```

## Re-run

From the repo root:

```sh
python3 src/domains/analysis/tests/run.py
```

Accounts (created on first run via email code; no password):

- `patient@example.com` — PATIENT who owns the dashboard
- `caregiver@example.com` — CAREGIVER linked to that patient
- `other-patient@example.com` — PATIENT the caregiver is **not** linked to

The script seeds one activity sample and two glucose readings on yesterday (low steps, high sedentary, high + low mg/dL) so rollups and alerts are deterministic.

## What this proves

1. No token cannot read `dashboard`
2. Caregiver cannot open `dashboard` (that field is the patient’s own)
3. Patient can open their own `dashboard`
4. Seeded day is rolled up (steps / sedentary)
5. Threshold alerts fire: `LOW_ACTIVITY`, `HIGH_SEDENTARY`, `HIGH_GLUCOSE`, `LOW_GLUCOSE`
6. Linked caregiver can open `patientDashboard`
7. Unlinked caregiver is refused
8. Empty time window returns empty lists, not an error
9. `from` after `to` → `invalid_range`
