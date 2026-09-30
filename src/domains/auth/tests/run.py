#!/usr/bin/env python3
"""Auth proofs against http://localhost:8080/graphql. Run from Terminal, not Playground."""

from __future__ import annotations

import json
import sys
import time
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
          verifyAuthCode(email: $email, code: $code) {
            token
            user { email role }
          }
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
    ensure_user(PATIENT_EMAIL, "PATIENT", "Test Patient")
    ensure_user(CAREGIVER_EMAIL, "CAREGIVER", "Test Caregiver")

    data = request_code(PATIENT_EMAIL, "PATIENT")
    payload = (data.get("data") or {}).get("requestAuthCode") or {}
    check(
        results,
        "request patient code",
        payload.get("sent") is True and bool(payload.get("debugCode")),
        payload or codes(data),
    )
    data = verify_code(PATIENT_EMAIL, payload.get("debugCode") or "")
    user = ((data.get("data") or {}).get("verifyAuthCode") or {}).get("user") or {}
    check(
        results,
        "verify patient code",
        user.get("email") == PATIENT_EMAIL and user.get("role") == "PATIENT",
        user or codes(data),
    )
    patient_token = ((data.get("data") or {}).get("verifyAuthCode") or {}).get("token")

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

    data = request_code(CAREGIVER_EMAIL, "CAREGIVER")
    payload = (data.get("data") or {}).get("requestAuthCode") or {}
    check(
        results,
        "existing caregiver can request another code",
        payload.get("sent") is True and bool(payload.get("debugCode")),
        payload or codes(data),
    )

    caregiver_token = ((verify_code(CAREGIVER_EMAIL, payload.get("debugCode") or "")).get("data") or {}).get(
        "verifyAuthCode"
    ) or {}
    _, _, data = gql("{ me { email role } }", token=caregiver_token.get("token"))
    me = (data.get("data") or {}).get("me") or {}
    check(
        results,
        "verify caregiver + me",
        me.get("email") == CAREGIVER_EMAIL and me.get("role") == "CAREGIVER",
        me or codes(data),
    )

    data = request_code(PATIENT_EMAIL, "CAREGIVER")
    check(results, "role conflict on existing email", "role_conflict" in codes(data), codes(data))

    nameless = f"nameless-{int(time.time())}@example.com"
    data = request_code(nameless, "PATIENT")
    check(results, "new user needs display name", "invalid_display_name" in codes(data), codes(data))

    _, _, data = gql(
        """
        mutation {
          verifyAuthCode(email: "patient@example.com", code: "000000") { token }
        }
        """
    )
    check(results, "wrong code", "invalid_code" in codes(data), codes(data))

    _, _, data = gql("{ me { email } }")
    check(results, "me with no token", "unauthorized" in codes(data), codes(data))

    data = request_code(PATIENT_EMAIL, "PATIENT")
    code = ((data.get("data") or {}).get("requestAuthCode") or {}).get("debugCode")
    data = verify_code(PATIENT_EMAIL, code or "")
    token = ((data.get("data") or {}).get("verifyAuthCode") or {}).get("token")
    check(results, "verify works with no header", bool(token), codes(data) or "token returned")

    _, _, data = gql("{ health }")
    check(results, "health", (data.get("data") or {}).get("health") == "ok", data)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\nauth: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
