# Auth proofs

Live GraphQL checks for `requestAuthCode`, `verifyAuthCode`, `{ me }`, and the Redis auth cache.

Run in **Terminal**, not GraphQL Playground.

Needs `AUTH_DEBUG_CODES=1` on the API so `requestAuthCode` returns `debugCode`. Do not enable that on Render.

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

Accounts (created on first run via email code; no password):

- `patient@example.com` — PATIENT
- `caregiver@example.com` — CAREGIVER

## What this proves

1. Request a patient code (`sent` + `debugCode`)
2. Verify that code → JWT + PATIENT
3. `{ me }` as that patient
4. Redis `X-Auth-Cache`: first `{ me }` after a fresh verify is `miss`, second is `hit`
5. Existing caregiver can request another code
6. Verify caregiver + `{ me }`
7. Same email as the other role → `role_conflict`
8. New email without `displayName` → `invalid_display_name`
9. Wrong code → `invalid_code`
10. `{ me }` with no token → `unauthorized`
11. Verify still works with no `Authorization` header
12. `{ health }` → `ok`
