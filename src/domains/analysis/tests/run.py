#!/usr/bin/env python3
"""Analysis proofs against http://localhost:8080/graphql. Run from Terminal, not Playground."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

URL = "http://localhost:8080/graphql"
PASSWORD = "password123"
PATIENT_EMAIL = "patient@example.com"
CAREGIVER_EMAIL = "caregiver@example.com"
OTHER_PATIENT_EMAIL = "other-patient@example.com"

DASHBOARD_FIELDS = """
  patient { id email role }
  activityTrends { date stepCount sedentaryMinutes durationMinutes }
  glucoseTrends { date averageValue readingCount }
  alerts { code severity }
  summary { totalSteps totalSedentaryMinutes glucoseReadingCount averageGlucose }
"""


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
    patient_id = patient.get("id")
    other_id = other.get("id")

    gql(
        """
        mutation {
          linkCaregiver(caregiverEmail: "caregiver@example.com") { email }
        }
        """,
        token=patient_token,
    )

    _, _, data = gql("{ dashboard { patient { email } } }")
    check(results, "no token cannot read dashboard", "unauthorized" in codes(data), codes(data))

    _, _, data = gql("{ dashboard { patient { email } } }", token=caregiver_token)
    check(results, "caregiver cannot open own dashboard", "forbidden" in codes(data), codes(data))

    seed_at = datetime.now(timezone.utc) - timedelta(days=1)
    seed_iso = seed_at.replace(hour=12, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    seed_day = seed_at.strftime("%Y-%m-%d")

    _, _, data = gql(
        f"""
        mutation {{
          syncActivity(records: [{{
            sourceId: "hk-analysis-proof-day"
            recordedAt: "{seed_iso}"
            stepCount: 1500
            heartRate: 95
            durationMinutes: 30
            intensity: LIGHT
            sedentaryMinutes: 500
          }}]) {{ id sourceId stepCount }}
        }}
        """,
        token=patient_token,
    )
    synced = ((data.get("data") or {}).get("syncActivity") or [None])[0]
    if not synced:
        check(results, "seed activity for rollup", False, codes(data))
        passed = sum(1 for _, ok, _ in results if ok)
        print(f"\nanalysis: {passed}/{len(results)} passed")
        sys.exit(1)

    gql(
        f"""
        mutation {{
          addGlucose(value: 200, recordedAt: "{seed_iso}") {{ id value }}
        }}
        """,
        token=patient_token,
    )
    gql(
        f"""
        mutation {{
          addGlucose(value: 55, recordedAt: "{seed_iso}") {{ id value }}
        }}
        """,
        token=patient_token,
    )

    _, _, data = gql(f"{{ dashboard {{ {DASHBOARD_FIELDS} }} }}", token=patient_token)
    dash = (data.get("data") or {}).get("dashboard") or {}
    alert_codes = {item.get("code") for item in (dash.get("alerts") or [])}
    days = {item.get("date"): item for item in (dash.get("activityTrends") or [])}
    seed_trend = days.get(seed_day) or {}
    check(
        results,
        "patient can open own dashboard",
        (dash.get("patient") or {}).get("email") == PATIENT_EMAIL,
        (dash.get("patient") or {}) or codes(data),
    )
    check(
        results,
        "dashboard rolls up the seeded day",
        seed_trend.get("stepCount", 0) >= 1500 and seed_trend.get("sedentaryMinutes", 0) >= 500,
        seed_trend or dash.get("activityTrends") or codes(data),
    )
    check(
        results,
        "threshold alerts fire",
        {"LOW_ACTIVITY", "HIGH_SEDENTARY", "HIGH_GLUCOSE", "LOW_GLUCOSE"} <= alert_codes,
        sorted(alert_codes) or codes(data),
    )

    _, _, data = gql(
        f"""
        query {{
          patientDashboard(patientId: "{patient_id}") {{
            {DASHBOARD_FIELDS}
          }}
        }}
        """,
        token=caregiver_token,
    )
    linked = (data.get("data") or {}).get("patientDashboard") or {}
    check(
        results,
        "linked caregiver can read patientDashboard",
        (linked.get("patient") or {}).get("email") == PATIENT_EMAIL,
        (linked.get("patient") or {}) or codes(data),
    )

    _, _, data = gql(
        f"""
        query {{
          patientDashboard(patientId: "{other_id}") {{
            patient {{ email }}
          }}
        }}
        """,
        token=caregiver_token,
    )
    check(results, "unlinked caregiver is refused", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        """
        query {
          dashboard(from: "2020-01-01T00:00:00Z", to: "2020-01-02T00:00:00Z") {
            patient { email }
            activityTrends { date }
            glucoseTrends { date }
            alerts { code }
            summary { totalSteps glucoseReadingCount }
          }
        }
        """,
        token=other_token,
    )
    empty = (data.get("data") or {}).get("dashboard") or {}
    check(
        results,
        "empty window is allowed",
        (empty.get("patient") or {}).get("email") == OTHER_PATIENT_EMAIL
        and empty.get("activityTrends") == []
        and empty.get("glucoseTrends") == []
        and (empty.get("summary") or {}).get("totalSteps") == 0,
        empty or codes(data),
    )

    _, _, data = gql(
        """
        query {
          dashboard(from: "2026-09-28T00:00:00Z", to: "2026-09-21T00:00:00Z") {
            patient { email }
          }
        }
        """,
        token=patient_token,
    )
    check(results, "invalid range refused", "invalid_range" in codes(data), codes(data))

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\nanalysis: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
