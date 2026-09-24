#!/usr/bin/env python3
"""Caregiver proofs against http://localhost:8080/graphql. Run from Terminal, not Playground."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

URL = "http://localhost:8080/graphql"
PASSWORD = "password123"
PATIENT_EMAIL = "patient@example.com"
CAREGIVER_EMAIL = "caregiver@example.com"
OTHER_PATIENT_EMAIL = "other-patient@example.com"


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


def login(email):
    _, _, data = gql(
        """
        mutation($email: String!, $password: String!) {
          login(email: $email, password: $password) { token }
        }
        """,
        variables={"email": email, "password": PASSWORD},
    )
    token = ((data.get("data") or {}).get("login") or {}).get("token")
    if not token:
        raise RuntimeError(f"login failed for {email}: {data}")
    return token


def register(email, role, display_name):
    _, _, data = gql(
        f"""
        mutation {{
          register(
            email: "{email}"
            password: "{PASSWORD}"
            displayName: "{display_name}"
            role: {role}
          ) {{ token }}
        }}
        """
    )
    return data


def ensure_user(email, role, display_name):
    data = register(email, role, display_name)
    token = ((data.get("data") or {}).get("register") or {}).get("token")
    if token:
        return token
    if "duplicate_email" in codes(data):
        return login(email)
    raise RuntimeError(f"could not ensure {email}: {data}")


def main():
    results = []
    patient_token = ensure_user(PATIENT_EMAIL, "PATIENT", "Test Patient")
    caregiver_token = ensure_user(CAREGIVER_EMAIL, "CAREGIVER", "Test Caregiver")
    other_token = ensure_user(OTHER_PATIENT_EMAIL, "PATIENT", "Other Patient")

    _, _, data = gql("{ me { id email } }", token=patient_token)
    patient = (data.get("data") or {}).get("me") or {}
    _, _, data = gql("{ me { id email } }", token=other_token)
    other = (data.get("data") or {}).get("me") or {}

    _, _, data = gql(
        """
        mutation {
          linkCaregiver(caregiverEmail: "caregiver@example.com") { email role }
        }
        """
    )
    check(results, "no token cannot link", "unauthorized" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          linkCaregiver(caregiverEmail: "caregiver@example.com") { email }
        }
        """,
        token=caregiver_token,
    )
    check(results, "caregiver cannot link", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          linkCaregiver(caregiverEmail: "caregiver@example.com") { email role }
        }
        """,
        token=patient_token,
    )
    linked = (data.get("data") or {}).get("linkCaregiver") or {}
    check(
        results,
        "patient attaches caregiver",
        linked.get("email") == CAREGIVER_EMAIL and linked.get("role") == "CAREGIVER",
        linked or codes(data),
    )

    caregiver_token = login(CAREGIVER_EMAIL)
    _, _, data = gql("{ monitoredPatients { email } }", token=caregiver_token)
    patients = (data.get("data") or {}).get("monitoredPatients") or []
    emails = {item.get("email") for item in patients}
    check(
        results,
        "caregiver lists linked patient",
        PATIENT_EMAIL in emails,
        [item.get("email") for item in patients] or codes(data),
    )

    patient_id = patient.get("id")
    _, _, data = gql(
        f"""
        query {{
          patientDashboard(patientId: "{patient_id}") {{
            patient {{ email }}
            summary {{ totalSteps }}
          }}
        }}
        """,
        token=caregiver_token,
    )
    dash = (data.get("data") or {}).get("patientDashboard") or {}
    check(
        results,
        "caregiver can read linked dashboard",
        (dash.get("patient") or {}).get("email") == PATIENT_EMAIL,
        dash or codes(data),
    )

    other_id = other.get("id")
    _, _, data = gql(
        f"""
        query {{
          patientDashboard(patientId: "{other_id}") {{ patient {{ email }} }}
        }}
        """,
        token=caregiver_token,
    )
    check(results, "caregiver cannot read unlinked patient", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          addGlucose(value: 110, recordedAt: "2026-09-24T08:00:00Z") { id }
        }
        """,
        token=caregiver_token,
    )
    check(results, "caregiver cannot addGlucose", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          syncActivity(records: [{
            sourceId: "hk-caregiver-write"
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
    check(results, "caregiver cannot syncActivity", "forbidden" in codes(data), codes(data))

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\ncaregiver: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
