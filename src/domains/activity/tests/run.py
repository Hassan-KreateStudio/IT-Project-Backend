#!/usr/bin/env python3
"""Activity proofs against http://localhost:8080/graphql. Run from Terminal, not Playground."""

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
          syncActivity(records: [{
            sourceId: "hk-unauth"
            recordedAt: "2026-09-24T08:00:00Z"
            stepCount: 1000
            durationMinutes: 10
            intensity: LIGHT
            sedentaryMinutes: 20
          }]) { id }
        }
        """
    )
    check(results, "no token is refused", "unauthorized" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          syncActivity(records: [{
            sourceId: "hk-caregiver"
            recordedAt: "2026-09-24T08:00:00Z"
            stepCount: 1000
            durationMinutes: 10
            intensity: LIGHT
            sedentaryMinutes: 20
          }]) { id }
        }
        """,
        token=caregiver_token,
    )
    check(results, "caregiver cannot sync", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          syncActivity(records: [{
            sourceId: "hk-proof-walk-1"
            recordedAt: "2026-09-24T08:00:00Z"
            stepCount: 4000
            heartRate: 88
            durationMinutes: 40
            intensity: MODERATE
            sedentaryMinutes: 120
          }]) { id sourceId stepCount heartRate intensity }
        }
        """,
        token=patient_token,
    )
    first = ((data.get("data") or {}).get("syncActivity") or [None])[0] or {}
    check(
        results,
        "patient sync one sample with HR",
        first.get("sourceId") == "hk-proof-walk-1"
        and first.get("stepCount") == 4000
        and first.get("heartRate") == 88,
        first or codes(data),
    )

    _, _, data = gql(
        """
        mutation {
          syncActivity(records: [{
            sourceId: "hk-proof-walk-1"
            recordedAt: "2026-09-24T08:00:00Z"
            stepCount: 4500
            heartRate: 90
            durationMinutes: 42
            intensity: MODERATE
            sedentaryMinutes: 110
          }]) { id sourceId stepCount heartRate }
        }
        """,
        token=patient_token,
    )
    again = ((data.get("data") or {}).get("syncActivity") or [None])[0] or {}
    check(
        results,
        "same sourceId updates same node",
        again.get("id") == first.get("id") and again.get("stepCount") == 4500,
        again or codes(data),
    )

    _, _, data = gql(
        """
        mutation {
          syncActivity(records: [{
            sourceId: "hk-proof-walk-2"
            recordedAt: "2026-09-24T15:00:00Z"
            stepCount: 2000
            durationMinutes: 20
            intensity: LIGHT
            sedentaryMinutes: 80
          }]) { id sourceId stepCount heartRate }
        }
        """,
        token=patient_token,
    )
    second = ((data.get("data") or {}).get("syncActivity") or [None])[0] or {}
    check(
        results,
        "same day, new sourceId merges into the day node and HR survives",
        second.get("id") == first.get("id")
        and second.get("stepCount") == 2000
        and second.get("heartRate") == 90,
        second or codes(data),
    )

    _, _, data = gql(
        """
        mutation {
          syncActivity(records: [
            {
              sourceId: "hk:2026-09-22"
              recordedAt: "2026-09-22T09:00:00Z"
              stepCount: 1111
              durationMinutes: 11
              intensity: LIGHT
              sedentaryMinutes: 10
            },
            {
              sourceId: "hk:2026-09-23"
              recordedAt: "2026-09-23T18:00:00Z"
              stepCount: 2222
              heartRate: 77
              durationMinutes: 22
              intensity: VIGOROUS
              sedentaryMinutes: 30
            }
          ]) { id sourceId }
        }
        """,
        token=patient_token,
    )
    batch = (data.get("data") or {}).get("syncActivity") or []
    ids = {item.get("id") for item in batch}
    check(
        results,
        "batch across days becomes one node per day",
        len(batch) == 2 and len(ids) == 2,
        batch or codes(data),
    )

    _, _, data = gql(
        """
        mutation {
          syncActivity(records: [{
            sourceId: "   "
            recordedAt: "2026-09-24T08:00:00Z"
            stepCount: 10
            durationMinutes: 1
            intensity: LIGHT
            sedentaryMinutes: 1
          }]) { id }
        }
        """,
        token=patient_token,
    )
    check(results, "empty sourceId refused", "invalid_source_id" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          syncActivity(records: [{
            sourceId: "hk-bad-steps"
            recordedAt: "2026-09-24T08:00:00Z"
            stepCount: -5
            durationMinutes: 1
            intensity: LIGHT
            sedentaryMinutes: 1
          }]) { id }
        }
        """,
        token=patient_token,
    )
    check(results, "negative steps refused", "invalid_activity" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          syncActivity(records: [{
            sourceId: "hk-bad-hr"
            recordedAt: "2026-09-24T08:00:00Z"
            stepCount: 10
            heartRate: 0
            durationMinutes: 1
            intensity: LIGHT
            sedentaryMinutes: 1
          }]) { id }
        }
        """,
        token=patient_token,
    )
    check(results, "heartRate 0 refused", "invalid_heart_rate" in codes(data), codes(data))

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\nactivity: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
