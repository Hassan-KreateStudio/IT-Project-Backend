#!/usr/bin/env python3
"""Caregiver proofs against http://localhost:8080/graphql. Run from Terminal, not Playground."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

URL = "http://localhost:8080/graphql"
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

    caregiver_token = ensure_user(CAREGIVER_EMAIL, "CAREGIVER", "Test Caregiver")
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

    _, _, data = gql(
        """
        mutation {
          unlinkCaregiver(caregiverEmail: "caregiver@example.com")
        }
        """
    )
    check(results, "no token cannot unlink", "unauthorized" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          stopMonitoring(patientId: "missing")
        }
        """
    )
    check(results, "no token cannot stop monitoring", "unauthorized" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          unlinkCaregiver(caregiverEmail: "caregiver@example.com")
        }
        """,
        token=caregiver_token,
    )
    check(results, "caregiver cannot unlink", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        f"""
        mutation {{
          stopMonitoring(patientId: "{patient_id}")
        }}
        """,
        token=patient_token,
    )
    check(results, "patient cannot stop monitoring", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          unlinkCaregiver(caregiverEmail: "caregiver@example.com")
        }
        """,
        token=patient_token,
    )
    check(
        results,
        "patient removes caregiver",
        (data.get("data") or {}).get("unlinkCaregiver") is True,
        data.get("data") or codes(data),
    )

    _, _, data = gql("{ monitoredPatients { email } }", token=caregiver_token)
    patients = (data.get("data") or {}).get("monitoredPatients") or []
    emails = {item.get("email") for item in patients}
    check(
        results,
        "caregiver list omits removed patient",
        PATIENT_EMAIL not in emails,
        [item.get("email") for item in patients] or codes(data),
    )

    _, _, data = gql(
        f"""
        query {{
          patientDashboard(patientId: "{patient_id}") {{ patient {{ email }} }}
        }}
        """,
        token=caregiver_token,
    )
    check(results, "caregiver cannot read removed patient", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          unlinkCaregiver(caregiverEmail: "caregiver@example.com")
        }
        """,
        token=patient_token,
    )
    check(results, "second unlink is not found", "not_found" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          linkCaregiver(caregiverEmail: "caregiver@example.com") { email }
        }
        """,
        token=patient_token,
    )
    relinked = (data.get("data") or {}).get("linkCaregiver") or {}
    check(
        results,
        "patient reattaches caregiver",
        relinked.get("email") == CAREGIVER_EMAIL,
        relinked or codes(data),
    )

    caregiver_token = ensure_user(CAREGIVER_EMAIL, "CAREGIVER", "Test Caregiver")
    _, _, data = gql(
        f"""
        mutation {{
          stopMonitoring(patientId: "{patient_id}")
        }}
        """,
        token=caregiver_token,
    )
    check(
        results,
        "caregiver stops monitoring",
        (data.get("data") or {}).get("stopMonitoring") is True,
        data.get("data") or codes(data),
    )

    _, _, data = gql("{ monitoredPatients { email } }", token=caregiver_token)
    patients = (data.get("data") or {}).get("monitoredPatients") or []
    emails = {item.get("email") for item in patients}
    check(
        results,
        "list omits patient after caregiver removal",
        PATIENT_EMAIL not in emails,
        [item.get("email") for item in patients] or codes(data),
    )

    _, _, data = gql(
        f"""
        query {{
          patientDashboard(patientId: "{patient_id}") {{ patient {{ email }} }}
        }}
        """,
        token=caregiver_token,
    )
    check(results, "dashboard refused after caregiver removal", "forbidden" in codes(data), codes(data))

    _, _, data = gql(
        f"""
        mutation {{
          stopMonitoring(patientId: "{patient_id}")
        }}
        """,
        token=caregiver_token,
    )
    check(results, "second stop is not found", "not_found" in codes(data), codes(data))

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\ncaregiver: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
