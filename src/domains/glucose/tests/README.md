# Glucose proofs

Live GraphQL checks for `addGlucose`. A reading is typed in by the patient (mg/dL + time). Each call creates a **new** node. Same number twice is two readings, not an overwrite.

Run in **Terminal**, not GraphQL Playground.

## Before you run

```sh
make up
curl http://localhost:8080/ping
```

## Re-run

From the repo root:

```sh
python3 src/domains/glucose/tests/run.py
```

Accounts (created on first run, password `password123`):

- `patient@example.com` — PATIENT who writes readings
- `caregiver@example.com` — CAREGIVER who must be refused

## What this proves

1. No token is refused
2. Caregiver cannot add
3. Patient can add a reading (`110` mg/dL)
4. Same value and time again → **new** id (not upsert)
5. `value: 0` → `invalid_glucose`
6. Negative value → `invalid_glucose`
