"""Runner-only 4C model hold classification; no network or Docker required."""
import json
import runpy
import unittest
from pathlib import Path


HELPER = runpy.run_path(str(Path(__file__).resolve().parents[1] /
                            "ci-openai-subagent-fixture.py"))[
    "is_original_native_analysis_request"
]
MARKER = "Mission planning context (not execution permission):"


def request(capabilities, role="system", task="analysis"):
    context = {
        "missionId": "ci-pr107-test",
        "taskId": "ci-pr107-test/" + task,
        "requiredCapabilities": capabilities,
        "objective": "Synthetic test only",
    }
    return [{"role": role, "content": MARKER + "\n" + json.dumps(context)}]


class OriginalNativeAnalysisHoldFixture(unittest.TestCase):
    def test_only_signed_native_analysis_is_held(self):
        self.assertTrue(HELPER(request(["ci-native-analysis"])))
        self.assertFalse(HELPER(request(["ci-native-research", "web_search"],
                                        task="research")))
        self.assertFalse(HELPER(request(["basic"])))
        self.assertFalse(HELPER(request(["ci-native-analysis", "web_search"])))
        self.assertFalse(HELPER(request(["ci-native-analysis"], role="user")))

    def test_unknown_or_missing_context_cannot_enable_hold(self):
        self.assertFalse(HELPER([]))
        self.assertFalse(HELPER([{"role": "system", "content": MARKER + "\n{"}]))
        self.assertFalse(HELPER([{"role": "system",
                                  "content": "ci-native-analysis research result"}]))
        self.assertFalse(HELPER([{"role": "system", "content": MARKER + "\n" +
                                  json.dumps({"requiredCapabilities":
                                              ["ci-native-analysis"]})}]))


if __name__ == "__main__":
    unittest.main()
