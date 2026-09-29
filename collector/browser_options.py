"""Shared browser executable selection for DrissionPage collectors."""

import os
import shutil
from pathlib import Path


def configure_browser_path(options, explicit_path=None):
    browser_path = explicit_path or os.environ.get('BROWSER_PATH')
    if not browser_path:
        return
    expanded = Path(browser_path).expanduser()
    if not expanded.is_file() and not shutil.which(browser_path):
        raise FileNotFoundError(f'浏览器可执行文件不存在: {browser_path}')
    options.set_browser_path(str(expanded) if expanded.is_file() else browser_path)
