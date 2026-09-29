# JS Sandbox Env Framework

用于在 Node.js 中调试依赖浏览器对象的 JavaScript。可以加载指纹配置、浏览器环境模块、采集快照和网页 HTML，再运行指定的脚本。项目适合复现**具体调用链**，不提供完整浏览器渲染或安全隔离。

## 安装与运行

需要 Node.js 18+；采集浏览器指纹时另需 Python 3 和 Chrome/Chromium/Edge。

```bash
npm ci
node standalone-runner.js --profile default your-script.js
```

默认 `profiles/default.json` 是 Chrome 120 / Windows 10 的示例配置。换设备时复制并修改配置，用 `--profile-file ./my-profile.json` 加载。UA、UA Client Hints、屏幕、时区、Canvas/WebGL 等字段应来自同一台目标浏览器；只改 UA 会形成矛盾的指纹。`--proxy` 记录属性访问，`--detect` 报告缺失 API，`--env captured.json` 合并采集快照。

## 网页 HTML 与目标脚本交互

```bash
# 直接请求页面 HTML，再执行你提供的脚本
node standalone-runner.js --profile default --html-url https://example.com/page your-script.js

# 已保存的 HTML：提供原页面地址，以便解析相对 URL 和 <base>
node standalone-runner.js --profile default --html-file page.html \
  --page-url https://example.com/page your-script.js

# 结合网站环境快照排查缺失对象
node standalone-runner.js --profile default --env captured.json \
  --html-file page.html --page-url https://example.com/page --proxy your-script.js
```

HTML 会解析成可访问的 `document` 节点。目标脚本可以查询节点、读取属性和文本、修改 `classList`/`dataset`/`innerHTML`、插入节点并派发基本事件。`querySelectorAll()` 是静态集合，`getElementsByTagName()` 等是动态集合。请求 HTML 的上限为 2 MiB，超时 12 秒。**HTML 中的内联脚本及外部脚本不会自动执行**；请明确传入要调试的 JS 文件。需要会话、请求头或登录状态的页面，可自行请求并保存 HTML 后使用 `--html-file`。

采集示例（可选）：

```bash
pip install -r collector/requirements.txt
python collector/website-env-collector.py --url https://example.com/page \
  --output captured.json --format json
node standalone-runner.js --profile default --env captured.json your-script.js
```

采集器找不到浏览器时，指定 `--browser-path /path/to/chrome` 或环境变量 `BROWSER_PATH`。

## 编程与 Web 接口

```javascript
import { SimpleSandbox } from './server/sandbox/SimpleSandbox.js';
import { readFileSync } from 'node:fs';

const profile = JSON.parse(readFileSync('profiles/default.json', 'utf8'));
const sandbox = new SimpleSandbox().init({ profile });
sandbox.loadHTML(readFileSync('page.html', 'utf8'), 'https://example.com/page');
const result = await sandbox.execute('document.querySelector("title")?.textContent');
console.log(result);
```

`npm start` 打开 `http://localhost:3000`。`POST /api/sandbox/run` 可提交 `{ "code": "document.title", "html": "<title>Example</title>", "pageURL": "https://example.com/", "profile": {...} }`；含 `html` 的请求使用独立沙箱，不复用其他请求的 DOM。服务端不根据用户传入的 URL 代为请求网站，需由调用方提供 HTML。

## 范围与验证

目前主要模拟常见的 DOM、BOM、Storage、导航和部分指纹 API；`fetch`/XHR、布局与字体测量、Canvas/GPU、事件循环、浏览器内部对象、网络请求头及 TLS 指纹仍无法完整复现。Node `vm` **不能用于隔离不可信脚本**。能否跑通某个站点取决于其 JS 实际调用的 API、页面状态和网络依赖。请先固定目标浏览器版本，按脚本调用链与真实浏览器对照并补齐差异。

```bash
npm test
python -m unittest discover -s test -p 'test_collector.py'
```

许可：MIT。
