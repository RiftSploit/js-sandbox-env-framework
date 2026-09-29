"""Collector output tests that do not require an installed browser."""

import importlib.util
import json
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'collector'))
sys.modules['DrissionPage'] = types.SimpleNamespace(ChromiumPage=object, ChromiumOptions=object)
spec = importlib.util.spec_from_file_location('website_collector', ROOT / 'collector/website-env-collector.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
template_spec = importlib.util.spec_from_file_location('template_collector', ROOT / 'collector/collect.py')
template_collector = importlib.util.module_from_spec(template_spec)
template_spec.loader.exec_module(template_collector)

from browser_options import configure_browser_path


class CollectorTests(unittest.TestCase):
    def test_generated_js_executes_with_proxy_and_preserves_methods(self):
        data = {
            'location': {'href': 'https://example.org/'},
            'navigator': {'userAgent': 'Collected UA'},
            'document': {'title': 'Collected title'},
        }
        with tempfile.TemporaryDirectory() as directory:
            generated = Path(directory) / 'captured.js'
            generated.write_text(collector.generate_js_code(data, 'https://example.org/'), encoding='utf-8')
            result = subprocess.run([
                'node', 'standalone-runner.js', '--quiet', '--profile', 'default', '--proxy',
                '--env', str(generated), '--code',
                'JSON.stringify([location.href, typeof location.assign, navigator.userAgent, document.title])'
            ], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(json.dumps(['https://example.org/', 'function', 'Collected UA', 'Collected title'],
                                     separators=(',', ':')), result.stdout)

    def test_browser_path_requires_an_executable(self):
        selected = []
        options = types.SimpleNamespace(set_browser_path=selected.append)
        with self.assertRaises(FileNotFoundError):
            configure_browser_path(options, '/a/nonexistent/chrome-binary')
        configure_browser_path(options, sys.executable)
        self.assertEqual(selected, [sys.executable])

    def test_collect_template_generated_js_loads_without_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            generated = Path(directory) / 'template.js'
            generated.write_text(template_collector.generate_env_code({
                'objects': {'navigator': {'userAgent': 'Template UA'}, 'window': {'innerWidth': 900}}
            }), encoding='utf-8')
            result = subprocess.run([
                'node', 'standalone-runner.js', '--quiet', '--env', str(generated),
                '--code', 'JSON.stringify([navigator.userAgent, window.innerWidth, typeof document.createElement])'
            ], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('["Template UA",900,"function"]', result.stdout)


if __name__ == '__main__':
    unittest.main()
