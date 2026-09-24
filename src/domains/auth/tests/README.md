# Auth proofs

Live GraphQL checks for `register`, `login`, `{ me }`, and the Redis auth cache.

Run in **Terminal**, not GraphQL Playground.

## Before you run

```sh
make up
curl http://localhost:8080/ping
```

## Re-run

From the repo root:

```sh
python3 src/domains/auth/tests/run.py
```

Accounts (created on first run, password `password123`):

- `patient@example.com` — PATIENT
- `caregiver@example.com` — CAREGIVER

## What this proves

1. Login patient
2. `{ me }` as that patient
3. Redis `X-Auth-Cache`: first `{ me }` after a fresh login is `miss`, second is `hit`
4. Registering the caregiver email again → `duplicate_email`
5. Login caregiver + `{ me }`
6. Registering the patient email again → `duplicate_email`
7. Wrong password → `unauthorized`
8. `{ me }` with no token → `unauthorized`
9. Login still works with no `Authorization` header
10. `{ health }` → `ok`
