#!/usr/bin/env python3
"""Firebase RTDB security-rule tests against the local emulator.

Unit tests and the client VM test do not execute Firebase rules. This suite sends
real REST requests to the local Firebase emulator, including priority metadata.
It proves rule enforcement there, not production token verification or browser behavior.

No npm dependency on purpose: @firebase/rules-unit-testing would pull a node_modules tree
into the website repo for a check that is a handful of authenticated HTTP calls. The
emulator accepts an unsigned JWT as `auth`, which is all we need to be Alice, Bob, an
admin, or nobody.

Usage:
  firebase emulators:exec --only database --project doshusweb \
    "python3 tests/rules-emulator.py"
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

HOST = os.environ.get("FIREBASE_DATABASE_EMULATOR_HOST", "127.0.0.1:9000")
NS = os.environ.get("RULES_TEST_NS", "doshusweb-default-rtdb")
PROJECT = os.environ.get("GCLOUD_PROJECT", "doshusweb")
# This suite writes test data and accepts unsigned test identities: loopback only.
if urllib.parse.urlsplit(f"http://{HOST}").hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit("Refusing rules tests against a non-loopback emulator host")
BASE = f"http://{HOST}"

results = []


def b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def token(uid=None, admin=False):
    """An unsigned JWT. The emulator trusts these; production never would."""
    if uid is None:
        return None
    # ⛔ The emulator validates the JWT shape. A token missing iat/exp/aud/iss parses as
    # NO auth, every owner rule denies, and the suite then reports the LEGITIMATE owner
    # path as broken while every deny-case still passes — a failure that looks exactly
    # like catastrophically strict rules.
    import time
    n = int(time.time())
    claims = {"sub": uid, "user_id": uid, "provider_id": "anonymous",
              "iat": n, "exp": n + 3600, "auth_time": n,
              "aud": PROJECT, "iss": f"https://securetoken.google.com/{PROJECT}",
              "firebase": {"sign_in_provider": "anonymous", "identities": {}}}
    if admin:
        claims["admin"] = True
    return f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64(claims)}."


def call(method, path, as_uid=None, admin=False, body=None, owner=False):
    url = f"{BASE}/{path}.json?ns={NS}"
    tok = "owner" if owner else token(as_uid, admin)
    if tok:
        url += f"&auth={tok}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except OSError as e:
        return 0, str(e)


def check(label, got, want):
    ok = got == want
    results.append(ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}"
          + ("" if ok else f"\n          got={got} want={want}"))


def allowed(label, *a, **k):
    st, body = call(*a, **k)
    ok = st in (200, 204)
    if not ok:
        print(f"          http={st} body={body[:160]}")
    check(label, ok, True)


def denied(label, *a, **k):
    st, _ = call(*a, **k)
    check(label, st in (401, 403), True)


SESS = "zephyy/chat/ownedSessions"
now_ok = {"role": "user", "content": "hello", "timestamp": {".sv": "timestamp"}}

print("legacy path is closed")
denied("unauthenticated write to the OLD sessions path", "PUT",
       "zephyy/chat/sessions/s1/messages/m1", body=now_ok)
denied("authenticated write to the OLD sessions path", "PUT",
       "zephyy/chat/sessions/s1/messages/m1", as_uid="alice", body=now_ok)
denied("unauthenticated READ of the OLD sessions path", "GET",
       "zephyy/chat/sessions/s1/messages")

print("\nsession ownership")
denied("unauthenticated cannot create a session", "PUT", f"{SESS}/a1",
       body={"owner": "alice", "updatedAt": {".sv": "timestamp"}, "meta": {"page": "/"}})
allowed("alice creates her own session", "PUT", f"{SESS}/a1", as_uid="alice",
        body={"owner": "alice", "updatedAt": {".sv": "timestamp"}, "meta": {"page": "/"}})
denied("bob cannot create a session claiming alice as owner", "PUT", f"{SESS}/b1",
       as_uid="bob",
       body={"owner": "alice", "updatedAt": {".sv": "timestamp"}, "meta": {"page": "/"}})
denied("bob cannot READ alice's session", "GET", f"{SESS}/a1", as_uid="bob")
allowed("alice can read her own session", "GET", f"{SESS}/a1", as_uid="alice")
denied("unauthenticated cannot read alice's session", "GET", f"{SESS}/a1")

print("\nforged fields")
denied("a session cannot be created pre-loaded with messages", "PUT", f"{SESS}/a2",
       as_uid="alice",
       body={"owner": "alice", "updatedAt": {".sv": "timestamp"}, "meta": {"page": "/"},
             "messages": {"m1": now_ok}})
denied("a session cannot be created pre-loaded with control", "PUT", f"{SESS}/a3",
       as_uid="alice",
       body={"owner": "alice", "updatedAt": {".sv": "timestamp"}, "meta": {"page": "/"},
             "control": {"state": "ended"}})
denied("an unknown top-level field is rejected", "PUT", f"{SESS}/a4", as_uid="alice",
       body={"owner": "alice", "updatedAt": {".sv": "timestamp"}, "meta": {"page": "/"},
             "isAdmin": True})
denied("a client-chosen timestamp far in the past is rejected", "PUT",
       f"{SESS}/a1/messages/old", as_uid="alice",
       body={"role": "user", "content": "x", "timestamp": 1000})

print("\nmessages")
allowed("alice writes a message to her own session", "PUT", f"{SESS}/a1/messages/m1",
        as_uid="alice", body=now_ok)
denied("bob cannot write into alice's session", "PUT", f"{SESS}/a1/messages/m2",
       as_uid="bob", body=now_ok)
denied("a client cannot forge role=assistant", "PUT", f"{SESS}/a1/messages/m3",
       as_uid="alice",
       body={"role": "assistant", "content": "x", "timestamp": {".sv": "timestamp"}})
denied("a message cannot be edited once written", "PUT", f"{SESS}/a1/messages/m1",
       as_uid="alice", body=now_ok)
denied("over-long content is rejected", "PUT", f"{SESS}/a1/messages/m4", as_uid="alice",
       body={"role": "user", "content": "x" * 2001, "timestamp": {".sv": "timestamp"}})
denied("an extra field on a message is rejected", "PUT", f"{SESS}/a1/messages/m5",
       as_uid="alice",
       body={"role": "user", "content": "x", "timestamp": {".sv": "timestamp"},
             "replyTo": "m1"})

print("\ncontrol")
denied("bob cannot end alice's session", "PUT", f"{SESS}/a1/control/state",
       as_uid="bob", body="ended")
allowed("alice can end her own session", "PUT", f"{SESS}/a1/control/state",
        as_uid="alice", body="ended")
denied("no message may be written after the session ended", "PUT",
       f"{SESS}/a1/messages/m6", as_uid="alice", body=now_ok)

print("\nadmin-only globals")
denied("unauthenticated cannot write status", "PUT", "zephyy/status/x", body=1)
denied("an ordinary user cannot write status", "PUT", "zephyy/status/x",
       as_uid="alice", body=1)
# ⛔ NOT "a forged admin claim is rejected" — the emulator CANNOT answer that. It does not
# verify JWT signatures; accepting unsigned tokens is how it simulates auth at all. In
# production Firebase validates against Google's public keys and custom claims can only be
# set by the Admin SDK, so a client cannot mint admin:true. That property is guaranteed by
# signature verification, NOT by this rule, and no emulator test can exercise it.
#
# What this pair DOES prove is that the rule actually consults the claim: the same write is
# denied without it (the case above) and allowed with it (below). A rule that had simply
# been written as `auth !== null` would allow both.
allowed("the admin claim is what unlocks status (rule reads auth.token.admin)", "PUT",
        "zephyy/status/x", as_uid="mallory", admin=True, body=1)
allowed("status stays world-readable", "GET", "zephyy/status")
allowed("printmon themes stay world-readable", "GET", "printmon/themes")
allowed("worklinks stay world-readable", "GET", "config/worklinks")
denied("an ordinary user cannot write printmon themes", "PUT", "printmon/themes/x",
       as_uid="alice", body=1)
denied("an ordinary user cannot read feedback", "GET", "zephyy/feedback", as_uid="alice")

print("\nenumeration")
denied("no client may list ownedSessions", "GET", SESS, as_uid="alice")

# ── priority metadata ────────────────────────────────────────────────────────────
# ⛔ Found by Astra 2026-09-08, on rules already serving production. A value written as
# {".value": X, ".priority": Y} shows the RULES only X. So `content` passes isString()
# and the 2000-char cap while Y rides along unbounded — Astra measured 1,048,576
# characters persisted. `$other: {".validate": false}` does NOT catch it: priority is
# metadata, not a child. The guard is `newData.getPriority() === null` on every node a
# client can write. getPriority() inspects only that node, not priorities stored on
# children; a session guard alone cannot constrain message or field metadata.
print("\npriority metadata cannot smuggle bulk data past the payload bounds")

BULK = "X" * 5000          # 2.5x the 2000-char content cap; size is not the point, presence is
allowed("CONTROL — an ordinary message with no priority is still accepted", "PUT",
        f"{SESS}/p1", as_uid="alice",
        body={"owner": "alice", "updatedAt": {".sv": "timestamp"},
              "meta": {"page": "/"}})
allowed("CONTROL — and its messages still write", "PUT", f"{SESS}/p1/messages/m1",
        as_uid="alice", body=dict(now_ok))

denied("priority on message content is rejected", "PUT", f"{SESS}/p1/messages/m2",
       as_uid="alice",
       body={"role": "user", "content": {".value": "hi", ".priority": BULK},
             "timestamp": {".sv": "timestamp"}})
denied("priority on the message node itself is rejected", "PUT",
       f"{SESS}/p1/messages/m3", as_uid="alice",
       body={"role": "user", "content": "hi", "timestamp": {".sv": "timestamp"},
             ".priority": BULK})
denied("priority on the session payload is rejected", "PUT", f"{SESS}/p2",
       as_uid="alice",
       body={"owner": "alice", "updatedAt": {".sv": "timestamp"},
             "meta": {"page": "/"}, ".priority": BULK})
denied("priority on meta/page is rejected", "PUT", f"{SESS}/p1/meta/page",
       as_uid="alice", body={".value": "/", ".priority": BULK})
denied("priority on control/state is rejected", "PUT", f"{SESS}/p1/control/state",
       as_uid="alice", body={".value": "ended", ".priority": BULK})


# Cover the five other guarded nodes independently; each matching guard mutation
# must fail its own test while ordinary writes keep working.
for field, value in (("owner", "alice"), ("updatedAt", {".sv": "timestamp"})):
    payload = {"owner": "alice", "updatedAt": {".sv": "timestamp"},
               "meta": {"page": "/"}}
    payload[field] = {".value": value, ".priority": BULK}
    denied(f"priority on session {field} is rejected", "PUT",
           f"{SESS}/priority-{field}", as_uid="alice", body=payload)
denied("priority on meta object is rejected", "PUT", f"{SESS}/priority-meta",
       as_uid="alice", body={"owner": "alice", "updatedAt": {".sv": "timestamp"},
                             "meta": {"page": "/", ".priority": BULK}})
for field, value in (("role", "user"), ("timestamp", {".sv": "timestamp"})):
    payload = dict(now_ok)
    payload[field] = {".value": value, ".priority": BULK}
    denied(f"priority on message {field} is rejected", "PUT",
           f"{SESS}/p1/messages/priority-{field}", as_uid="alice", body=payload)

allowed("atomic client input and activity timestamp update", "PATCH", f"{SESS}/p1",
        as_uid="alice", body={"messages/atomic": dict(now_ok),
                              "updatedAt": {".sv": "timestamp"}})
allowed("owner can update page without priority", "PUT", f"{SESS}/p1/meta/page",
        as_uid="alice", body="/zephyy")
denied("priority-only update on mutable page is rejected", "PUT",
       f"{SESS}/p1/meta/page/.priority", as_uid="alice", body=BULK)
denied("priority-only update on mutable activity timestamp is rejected", "PUT",
       f"{SESS}/p1/updatedAt/.priority", as_uid="alice", body=BULK)
for suffix in (".priority", "messages/.priority", "control/.priority"):
    denied(f"priority-only update on container {suffix} is rejected", "PUT",
           f"{SESS}/p1/{suffix}", as_uid="alice", body=BULK)
denied("atomic root PATCH cannot smuggle field priority", "PATCH", "",
       as_uid="alice", body={f"{SESS}/p1/messages/atomic-bad": {
           **now_ok, "content": {".value": "hi", ".priority": BULK}},
           f"{SESS}/p1/updatedAt": {".sv": "timestamp"}})

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
