#!/usr/bin/env python3
"""Set GITHUB_APP_PRIVATE_KEY as a secret Netlify env var.

Reads the PEM from disk and the Netlify auth token from the CLI config,
so the secret never appears in process arguments.
"""
import json
import pathlib
import urllib.request

SITE_ID = "cacd57f2-12f6-46a9-85bc-9c00ea426097"  # blamy-notes
ACCOUNT_SLUG = "brett-lamy"

pem = pathlib.Path(__file__).resolve().parent.parent / "github-app-private-key.pem"
key_value = pem.read_text()

config = json.loads(
    (pathlib.Path.home() / "Library/Preferences/netlify/config.json").read_text()
)
users = config["users"]
token = next(iter(users.values()))["auth"]["token"]

payload = [
    {
        "key": "GITHUB_APP_PRIVATE_KEY",
        "scopes": ["builds", "functions", "runtime", "post-processing"],
        "values": [{"value": key_value, "context": "all"}],
        "is_secret": True,
    }
]

req = urllib.request.Request(
    f"https://api.netlify.com/api/v1/accounts/{ACCOUNT_SLUG}/env?site_id={SITE_ID}",
    data=json.dumps(payload).encode(),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as res:
    body = json.load(res)
    print(res.status, [v["key"] for v in body])
