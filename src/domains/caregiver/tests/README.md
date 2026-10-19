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

- `caregiver@example.com` — CAREGIVER who links the patient
- `patient@example.com` — PATIENT
- `other-patient@example.com` — PATIENT the caregiver is **not** linked to

## What this proves

1. No token cannot `linkPatient`
2. Patient cannot `linkPatient`
3. Caregiver attaches `patient@example.com` (`MONITORS`)
4. That caregiver’s `monitoredPatients` includes the patient
5. That patient’s `caregivers` includes the caregiver
6. That caregiver can open `patientDashboard` for the linked patient
7. That caregiver cannot open `other-patient@example.com`
8. Caregiver cannot `addGlucose`
9. Caregiver cannot `syncActivity`
10. No token cannot `stopMonitoring`
11. Patient cannot `stopMonitoring`
12. Caregiver removes the patient with `stopMonitoring`
13. After that, `monitoredPatients` / `caregivers` omit the pair and `patientDashboard` is refused
14. Removing the same link again returns `not_found`
15. Caregiver can attach the same patient again

No “one caregiver per patient” rule is tested. That is not a product rule.
