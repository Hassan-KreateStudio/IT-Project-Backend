# Caregiver proofs

Live GraphQL checks for attach, detach, list, read, and refuse.

Run in **Terminal**, not GraphQL Playground.

## Before you run

```sh
make up
curl http://localhost:8080/ping
```

## Re-run

From the repo root:

```sh
python3 src/domains/caregiver/tests/run.py
```

Accounts (created on first run via email code; no password):

- `patient@example.com` — PATIENT who links the caregiver
- `caregiver@example.com` — CAREGIVER
- `other-patient@example.com` — PATIENT the caregiver is **not** linked to

## What this proves

1. No token cannot `linkCaregiver`
2. Caregiver cannot `linkCaregiver`
3. Patient attaches `caregiver@example.com` (`MONITORS`)
4. That caregiver’s `monitoredPatients` includes the patient
5. That caregiver can open `patientDashboard` for the linked patient
6. That caregiver cannot open `other-patient@example.com`
7. Caregiver cannot `addGlucose`
8. Caregiver cannot `syncActivity`
9. No token cannot `unlinkCaregiver` or `stopMonitoring`
10. Caregiver cannot `unlinkCaregiver`; patient cannot `stopMonitoring`
11. Patient removes `caregiver@example.com` (`MONITORS` deleted)
12. After that, `monitoredPatients` omits the patient and `patientDashboard` is refused
13. Removing the same link again returns `not_found`
14. Caregiver removes the patient with `stopMonitoring`, with the same follow-up checks

No “one caregiver per patient” rule is tested. That is not a product rule.
