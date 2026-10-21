#!/usr/bin/env python3
"""Real OCI end-to-end: durable Oracle -> authenticated project API -> persisted Idea.
Runner-local deterministic provider only. Never prints tokens or message contents.
"""
import json
import pathlib
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

BASE = "http://127.0.0.1:3090"
TOKEN = pathlib.Path("/tmp/botmode-ci-projection-token").read_text().strip()
FOREIGN_TOKEN = pathlib.Path("/tmp/botmode-ci-projection-foreign-token").read_text().strip()
ACCEPTED = json.loads(pathlib.Path("/tmp/botmode-ci-oracle-accepted.json").read_text())
CONVO_ID = ACCEPTED["conversationId"]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"


def api(method, path, payload=None, token=TOKEN, expected=(200,)):
    headers = {"User-Agent": UA, "Accept": "application/json", "Authorization": "Bearer " + token}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    request = Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=40) as response:
            status = response.status
            value = json.load(response)
    except HTTPError as error:
        status, value = error.code, {}
    if status not in expected:
        raise SystemExit("CI_REAL_IDEA_API_UNEXPECTED_STATUS_" + method + "_" + str(status))
    return value


def id_from(obj):
    identifier = obj.get("projectId") or obj.get("ideaId") or obj.get("_id") or obj.get("id")
    if not isinstance(identifier, str) or not identifier.strip():
        raise SystemExit("CI_REAL_IDEA_API_ID_MISSING")
    return identifier


def terminal_public_text():
    text = ACCEPTED.get("text")
    if not isinstance(text, str) or not text.strip():
        raise SystemExit("CI_REAL_IDEA_ORACLE_ACCEPTED_TEXT_MISSING")
    return text.strip()


def main():
    expected_text = terminal_public_text()
    project = api(
        "POST", "/api/projects",
        {"name": "CI durable Oracle real projection", "description": "Ephemeral, single runner"},
        expected=(201,),
    )
    project_id = id_from(project)
    api(
        "PUT", "/api/projects/conversations/" + quote(CONVO_ID, safe=""),
        {"projectId": project_id},
    )
    print("CI_REAL_ORACLE_PROJECT_CONVERSATION_LINKED=PASS")
    projection_path = "/api/projects/" + quote(project_id, safe="") + "/bot-mode"
    projection = api("GET", projection_path)
    if projection.get("projectId") != project_id:
        raise SystemExit("CI_REAL_ORACLE_PROJECT_PROJECTION_ID_MISMATCH")
    projected = [x for c in projection.get("conversations", []) for x in c.get("results", [])]
    texts = [x.get("content") for x in projected if isinstance(x, dict) and isinstance(x.get("content"), str)]
    if not texts or not any(expected_text in text for text in texts):
        raise SystemExit("CI_REAL_ORACLE_PROJECT_RESULT_NOT_VISIBLE")
    print("CI_REAL_ORACLE_PERSISTED_PROJECT_RESULT_API=PASS")
    if not any(c.get("conversationId") == CONVO_ID for c in projection.get("conversations", [])):
        raise SystemExit("CI_REAL_ORACLE_PROJECT_CONVERSATION_MISSING")
    idea = api(
        "POST", "/api/ideas",
        {"title": "CI Oracle Idea linked to live project", "content": "No paid provider"},
        expected=(201,),
    )
    idea_id = id_from(idea)
    api(
        "PATCH", "/api/ideas/" + quote(idea_id, safe=""),
        {"projectId": project_id, "status": "done"},
    )
    listing = api("GET", "/api/ideas")
    linked = [x for x in listing.get("ideas", []) if str(x.get("_id")) == idea_id]
    if len(linked) != 1 or linked[0].get("projectId") != project_id or linked[0].get("status") != "done":
        raise SystemExit("CI_REAL_ORACLE_IDEA_PROJECT_LINK_NOT_DURABLE")
    print("CI_REAL_ORACLE_IDEA_LINKED_AND_LISTED=PASS")
    api("GET", projection_path, token=FOREIGN_TOKEN, expected=(404,))
    api("PUT", "/api/projects/conversations/" + quote(CONVO_ID, safe=""), {"projectId": project_id}, token=FOREIGN_TOKEN, expected=(404,))
    foreign_listing = api("GET", "/api/ideas", token=FOREIGN_TOKEN)
    if any(x.get("projectId") == project_id for x in foreign_listing.get("ideas", [])):
        raise SystemExit("CI_REAL_ORACLE_FOREIGN_IDEA_VISIBLE")
    print("CI_REAL_ORACLE_PROJECT_FOREIGN_OWNER_BLOCKED=PASS")
    # Browser must consume exactly the same database records through the real API.
    pathlib.Path("/tmp/botmode-ci-ui-projection.json").write_text(json.dumps({
        "ideaTitle": "CI Oracle Idea linked to live project",
        "projectId": project_id, "oracleText": expected_text,
    }))
    print("BOTMODE_REAL_ORACLE_PROJECT_IDEA_API=PASS")
    # No response body, token or user information emitted to the CI log.


if __name__ == "__main__":
    main()
