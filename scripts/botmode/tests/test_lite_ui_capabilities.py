"""Prevent unavailable Lite code execution appearing as an available chat tool."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class LiteToolVisibilityContract(unittest.TestCase):
    def test_code_dropdown_respects_native_interface_flag(self):
        source = (ROOT / "client/src/components/Chat/Input/ToolsDropdown.tsx").read_text()
        self.assertIn("canRunCode && codeEnabled && startupConfig?.interface?.runCode !== false", source)

    def test_builtin_config_supports_run_code_flag(self):
        source = (ROOT / "packages/data-provider/src/config.ts").read_text()
        self.assertIn("runCode: z.boolean().optional()", source)


if __name__ == "__main__":
    unittest.main()
