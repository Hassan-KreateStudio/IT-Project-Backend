#!/usr/bin/env python3
"""Auth proofs against http://localhost:8080/graphql. Run from Terminal, not Playground."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

URL = "http://localhost:8080/graphql"
PASSWORD = "password123"
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
    ensure_user(PATIENT_EMAIL, "PATIENT", "Test Patient")
    ensure_user(CAREGIVER_EMAIL, "CAREGIVER", "Test Caregiver")

    status, _, data = gql(
        """
        mutation {
          login(email: "patient@example.com", password: "password123") {
            token
            user { email role }
          }
        }
        """
    )
    user = ((data.get("data") or {}).get("login") or {}).get("user") or {}
    check(
        results,
        "login patient",
        status == 200 and user.get("email") == PATIENT_EMAIL and user.get("role") == "PATIENT",
        user or codes(data),
    )
    patient_token = ((data.get("data") or {}).get("login") or {}).get("token")

    status, headers, data = gql("{ me { email role } }", token=patient_token)
    me = (data.get("data") or {}).get("me") or {}
    check(
        results,
        "me as patient",
        me.get("email") == PATIENT_EMAIL and me.get("role") == "PATIENT",
        me or codes(data),
    )

    first_cache = headers.get("X-Auth-Cache") or headers.get("x-auth-cache")
    _, headers2, _ = gql("{ me { email } }", token=patient_token)
    second_cache = headers2.get("X-Auth-Cache") or headers2.get("x-auth-cache")
    check(
        results,
        "Redis X-Auth-Cache miss then hit",
        first_cache == "miss" and second_cache == "hit",
        f"first={first_cache} second={second_cache}",
    )

    data = register(CAREGIVER_EMAIL, "CAREGIVER", "Test Caregiver")
    check(results, "duplicate caregiver email", "duplicate_email" in codes(data), codes(data))

    caregiver_token = login(CAREGIVER_EMAIL)
    _, _, data = gql("{ me { email role } }", token=caregiver_token)
    me = (data.get("data") or {}).get("me") or {}
    check(
        results,
        "login caregiver + me",
        me.get("email") == CAREGIVER_EMAIL and me.get("role") == "CAREGIVER",
        me or codes(data),
    )

    data = register(PATIENT_EMAIL, "PATIENT", "Test Patient")
    check(results, "duplicate patient email", "duplicate_email" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          login(email: "patient@example.com", password: "wrong-password") { token }
        }
        """
    )
    check(results, "wrong password", "unauthorized" in codes(data), codes(data))

    _, _, data = gql("{ me { email } }")
    check(results, "me with no token", "unauthorized" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          login(email: "patient@example.com", password: "password123") { token }
        }
        """
    )
    token = ((data.get("data") or {}).get("login") or {}).get("token")
    check(results, "login works with no header", bool(token), codes(data) or "token returned")

    _, _, data = gql("{ health }")
    check(results, "health", (data.get("data") or {}).get("health") == "ok", data)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\nauth: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
