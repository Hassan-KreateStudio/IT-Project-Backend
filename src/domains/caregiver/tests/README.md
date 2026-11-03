# Caregiver proofs

Live GraphQL checks for consent, attach, detach, list, read, and refuse.

A caregiver **asks**, the patient **answers**. Access is the `MONITORS` edge;
a request is a separate `REQUESTS` edge that grants nothing.

Run in **Terminal**, not GraphQL Playground.

## Before you run

```sh
make up
curl http://localhost:8080/ping
```

## Re-run

From the repo root:

```sh
python3 src/domains/caregiver/tests/run.py     # request → accept → detach
python3 src/domains/caregiver/tests/consent.py # decline, revoke, pending isolation
```

Accounts (created on first run via email code; no password):

- `caregiver@example.com` — CAREGIVER who requests access
- `patient@example.com` — PATIENT who answers
- `other-patient@example.com` — PATIENT the caregiver is **not** linked to

## What this proves

1. No token cannot `requestAccess`
2. Patient cannot `requestAccess`
3. Caregiver requests a patient (`REQUESTS`, not `MONITORS`)
4. A pending request is **not** in `monitoredPatients`
5. The patient sees it in `caregiverRequests`
6. The patient accepts → `respondToRequest` flips it to `MONITORS {since}`
7. `monitoredPatients` / `caregivers` list the accepted pair
8. Caregiver can read the linked `patientDashboard`
9. Caregiver cannot read an unlinked patient
10. Caregiver cannot `addGlucose` or `syncActivity`
11. Patient cannot `stopMonitoring` (caregiver-side removal)
12. Caregiver removes the patient; dashboard is refused afterwards
13. Removing again returns `not_found`

`consent.py` adds the paths a demo must not miss: declining leaves no access,
a pending request never opens `patientDashboard`, the patient can
`revokeCaregiver`, and revoking empties the caregiver's list.

No “one caregiver per patient” rule is tested. That is not a product rule.
