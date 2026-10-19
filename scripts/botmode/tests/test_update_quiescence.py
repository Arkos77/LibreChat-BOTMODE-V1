#!/usr/bin/env python3
"""Offline, no-Docker regression of update.sh fail-closed boundaries."""
from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
UPDATE = ROOT / "update.sh"
GUARD = ROOT / "scripts/botmode/check-update-quiescence.sh"


def scenario(
    name: str,
    *,
    dotenv: str = "BOTMODE_MONGO_PASSWORD=fake\nPOSTGRES_PASSWORD=fake\n",
    docker_rows: str = "api|exited\nmongodb|running\n",
    expect: str = "PASS",
    after_rows: str | None = None,
    docker_error: bool = False,
    overrides: dict[str, str] | None = None,
    git_pull_ok: bool = True,
) -> None:
    with tempfile.TemporaryDirectory(prefix="botmode-update-guard-") as tmp:
        repo = Path(tmp)
        (repo / "scripts/botmode").mkdir(parents=True)
        (repo / "bin").mkdir()
        (repo / ".env").write_text(dotenv)
        (repo / ".env").chmod(0o600)
        (repo / "update.sh").write_bytes(UPDATE.read_bytes())
        (repo / "scripts/botmode/check-update-quiescence.sh").write_bytes(GUARD.read_bytes())
        (repo / "scripts/botmode/bootstrap.sh").write_text(
            '#!/usr/bin/env bash\necho "BOOTSTRAP_EXECUTED" >> "$MOCK_LOG"\n'
        )
        (repo / "scripts/botmode/bootstrap.sh").chmod(0o700)
        (repo / "rows").write_text(docker_rows)
        (repo / "later").write_text(after_rows if after_rows is not None else docker_rows)
        (repo / "bin/git").write_text(
            '#!/usr/bin/env bash\n'
            'case "$*" in\n'
            '  "symbolic-ref --quiet --short HEAD") echo release-ci;;\n'
            '  "status --porcelain") :;;\n'
            '  "rev-parse --abbrev-ref --symbolic-full-name @{upstream}") echo origin/release-ci;;\n'
            '  "pull --ff-only") echo "GIT_PULL" >> "$MOCK_LOG"; [ "$GIT_PULL_OK" = 1 ]; exit $?;;\n'
            '  *) exit 42;;\n'
            'esac\n'
        )
        (repo / "bin/docker").write_text(
            '#!/usr/bin/env bash\n'
            'case "$1" in\n'
            '  info) exit 0;;\n'
            '  ps)\n'
            '    [ "$DOCKER_ERROR" = 0 ] || exit 43\n'
            '    n=$(cat "$MOCK_PS_COUNT" 2>/dev/null || echo 0)\n'
            '    n=$((n+1)); echo "$n" > "$MOCK_PS_COUNT"\n'
            '    if [ "$n" -eq 1 ]; then cat "$MOCK_ROWS"; else cat "$MOCK_LATER"; fi;;\n'
            '  *) exit 44;;\n'
            'esac\n'
        )
        for cmd in ("git", "docker"):
            (repo / "bin" / cmd).chmod(0o700)
        env = dict(os.environ)
        for key in ("COMPOSE_FILE", "COMPOSE_PROFILES", "COMPOSE_PROJECT_NAME",
                    "REDIS_URI", "USE_REDIS", "USE_REDIS_STREAMS"):
            env.pop(key, None)
        env.update({
            "PATH": str(repo / "bin") + os.pathsep + os.environ.get("PATH", ""),
            "MOCK_LOG": str(repo / "log"),
            "MOCK_ROWS": str(repo / "rows"),
            "MOCK_LATER": str(repo / "later"),
            "MOCK_PS_COUNT": str(repo / "ps_count"),
            "DOCKER_ERROR": str(int(docker_error)),
            "GIT_PULL_OK": str(int(git_pull_ok)),
        })
        env.update(overrides or {})
        before = (repo / ".env").read_bytes()
        result = subprocess.run(
            ["bash", "./update.sh", "--no-pull"],
            cwd=repo, env=env, capture_output=True, text=True, timeout=15,
        )
        log = (repo / "log").read_text() if (repo / "log").exists() else ""
        assert (repo / ".env").read_bytes() == before, (name, "dotenv mutated")
        if expect == "GIT_PULL_FAILED":
            assert result.returncode != 0 and log.count("GIT_PULL") == 1 and "BOOTSTRAP_EXECUTED" not in log
            print(f"CI_UPDATE_{name}=PASS")
            return
        if expect == "PASS":
            assert result.returncode == 0 and log.count("GIT_PULL") == 1 and "BOOTSTRAP_EXECUTED" in log, (
                name, result.returncode, result.stdout, result.stderr, log
            )
            assert "BOTMODE_UPDATE_QUIESCENCE=PASS" in result.stdout, name
        else:
            assert result.returncode != 0 and f"BOTMODE_UPDATE_REFUSED={expect}" in result.stderr, (
                name, result.returncode, result.stderr
            )
            assert "BOOTSTRAP_EXECUTED" not in log, (name, "bootstrap invoked")
            if after_rows is None:
                assert "GIT_PULL" not in log, (name, "git mutated early", log)
            else:
                assert log.count("GIT_PULL") == 1, (name, "expected post-fetch refusal", log)
        print(f"CI_UPDATE_{name}=PASS")


scenario("RUNNING_API_REFUSED", docker_rows="api|running\nmongodb|running\n", expect="API_NOT_QUIESCENT")
scenario("RESTARTING_API_REFUSED", docker_rows="api|restarting\n", expect="API_NOT_QUIESCENT")
scenario("CREATED_API_REFUSED", docker_rows="api|created\n", expect="API_NOT_QUIESCENT")
scenario("REDIS_RUNNING_REFUSED", dotenv="USE_REDIS=true\n", expect="REDIS_INTERVERSION_NOT_QUALIFIED")
scenario("REDIS_PAUSED_REFUSED", dotenv='USE_REDIS_STREAMS="true"\n', expect="REDIS_INTERVERSION_NOT_QUALIFIED")
scenario("REDIS_URI_REFUSED", dotenv="REDIS_URI=redis://example.invalid:6379\n", expect="REDIS_INTERVERSION_NOT_QUALIFIED")
scenario("REDIS_UNKNOWN_REFUSED", dotenv="USE_REDIS=maybe\n", expect="REDIS_INTERVERSION_NOT_QUALIFIED")
scenario("REDIS_ENV_OVERRIDE_REFUSED", overrides={"USE_REDIS": "true"}, expect="REDIS_INTERVERSION_NOT_QUALIFIED")
scenario("RUNNING_API_WITH_REDIS_REFUSED", docker_rows="api|running\n",
         dotenv="USE_REDIS=true\n", expect="API_NOT_QUIESCENT")
scenario("DOCKER_UNAVAILABLE_REFUSED", docker_error=True, expect="DOCKER_STATUS_UNAVAILABLE")
scenario("OVERRIDE_UNSAFE_REFUSED", overrides={"COMPOSE_FILE": "special.yml"}, expect="UNSUPPORTED_COMPOSE_OVERRIDE")
scenario("PROJECT_UNKNOWN_REFUSED", dotenv="COMPOSE_PROJECT_NAME=invalid name\n", expect="UNKNOWN_COMPOSE_PROJECT")
scenario("EXITED_NON_REDIS_PERMITTED")
scenario("MISSING_API_NON_REDIS_PERMITTED", docker_rows="mongodb|running\n")
scenario("FLAG_DISABLED_NON_REDIS_PERMITTED", dotenv='USE_REDIS="false"\nUSE_REDIS_STREAMS=0\n')
scenario("SECOND_CHECK_RUNNING_REFUSED", docker_rows="api|exited\n", after_rows="api|running\n",
         expect="API_NOT_QUIESCENT")
scenario("GIT_PULL_FAILURE_STOPS_BOOTSTRAP", git_pull_ok=False, expect="GIT_PULL_FAILED")
print("CI_UPDATE_ALL_OFFLINE_CASES=PASS")
