#!/usr/bin/env python3
"""Glucose proofs against http://localhost:8080/graphql. Run from Terminal, not Playground."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

URL = "http://localhost:8080/graphql"
PATIENT_EMAIL = "patient@example.com"
CAREGIVER_EMAIL = "caregiver@example.com"


def gql(query, token=None, variables=None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    body = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status, dict(res.headers), json.loads(res.read().decode())
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = {"raw": raw}
        return exc.code, dict(exc.headers), data
    except urllib.error.URLError as exc:
        print(f"FAIL - cannot reach {URL} ({exc.reason}). Is `make up` running?")
        raise SystemExit(1) from exc


def codes(data):
    return [
        ((err.get("extensions") or {}).get("code") or err.get("message") or "")
        for err in (data.get("errors") or [])
    ]


def check(results, name, ok, detail):
    results.append((name, ok, detail))
    print(("PASS" if ok else "FAIL"), "-", name, "-", detail)


def request_code(email, role, display_name=None):
    _, _, data = gql(
        """
        mutation($email: String!, $role: Role!, $displayName: String) {
          requestAuthCode(email: $email, role: $role, displayName: $displayName) {
            sent
            debugCode
          }
        }
        """,
        variables={"email": email, "role": role, "displayName": display_name},
    )
    return data


def verify_code(email, code):
    _, _, data = gql(
        """
        mutation($email: String!, $code: String!) {
          verifyAuthCode(email: $email, code: $code) { token }
        }
        """,
        variables={"email": email, "code": code},
    )
    return data


def ensure_user(email, role, display_name):
    data = request_code(email, role, display_name)
    code = ((data.get("data") or {}).get("requestAuthCode") or {}).get("debugCode")
    if not code:
        raise RuntimeError(f"no debugCode for {email} (is AUTH_DEBUG_CODES=1?): {data}")
    data = verify_code(email, code)
    token = ((data.get("data") or {}).get("verifyAuthCode") or {}).get("token")
    if not token:
        raise RuntimeError(f"could not sign in {email}: {data}")
    return token


def main():
    results = []
    patient_token = ensure_user(PATIENT_EMAIL, "PATIENT", "Test Patient")
    caregiver_token = ensure_user(CAREGIVER_EMAIL, "CAREGIVER", "Test Caregiver")

    _, _, data = gql(
        """
        mutation {
          addGlucose(value: 110, recordedAt: "2026-09-24T08:00:00Z") { id }
        }
        """
    )
    check(results, "no token is refused", "unauthorized" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          addGlucose(value: 110, recordedAt: "2026-09-24T08:00:00Z") { id }
        }
        """,
        token=caregiver_token,
    )
    check(results, "caregiver cannot add", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          addGlucose(value: 110, recordedAt: "2026-09-24T08:30:00Z") {
            id
            value
            recordedAt
          }
        }
        """,
        token=patient_token,
    )
    first = (data.get("data") or {}).get("addGlucose") or {}
    check(
        results,
        "patient adds a reading in mg/dL",
        first.get("id") and first.get("value") == 110,
        first or codes(data),
    )

    _, _, data = gql(
        """
        mutation {
          addGlucose(value: 110, recordedAt: "2026-09-24T08:30:00Z") {
            id
            value
          }
        }
        """,
        token=patient_token,
    )
    second = (data.get("data") or {}).get("addGlucose") or {}
    check(
        results,
        "same value/time is a new reading",
        second.get("id") and second.get("id") != first.get("id") and second.get("value") == 110,
        second or codes(data),
    )

    _, _, data = gql(
        """
        mutation {
          addGlucose(value: 0, recordedAt: "2026-09-24T09:00:00Z") { id }
        }
        """,
        token=patient_token,
    )
    check(results, "value 0 refused", "invalid_glucose" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          addGlucose(value: -5, recordedAt: "2026-09-24T09:00:00Z") { id }
        }
        """,
        token=patient_token,
    )
    check(results, "negative value refused", "invalid_glucose" in codes(data), codes(data))

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\nglucose: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
