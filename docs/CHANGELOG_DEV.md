# 开发记录（CHANGELOG_DEV）

实质性开发的简要记录。只记长期有价值的内容；调试细节不入库。

## 2026-11-03 — 0.3.4：ZIP 路径穿越修复

**触发**：自动化例行研究轮（第四轮）深入 `plugin/src/**` 代码层，逐环核实「远端 ZIP → 落盘」这条链路。

**问题**：结果 ZIP 来自 MinerU 服务器，条目名是不可信输入。三个环节各自都不负责，组合起来构成一条可写出 `images/` 目录之外文件的路径：

| 环节 | 核实结果 |
| --- | --- |
| `fflate` 的 `unzipSync()` | **不净化条目名**（官方文档说明路径安全是调用方义务） |
| Obsidian `normalizePath()` | **不解析 `..` 段**（只统一分隔符、折叠斜杠、去首尾斜杠） |
| `ProgressModal.writeResult()` | 直接把拼出的路径交给 `adapter.writeBinary()` |

**实测**：构造恶意 ZIP 调用项目自己的 `extractFromZip()`，返回的 image key 含 `../../../../evil.txt` 与 `../sibling.png`。

**代码变更**：
| 文件 | 变化 |
| --- | --- |
| `src/utils/zipExtractor.ts` | 新增导出函数 `safeImageKey()`；`extractFromZip()` 逐条校验并丢弃非法条目 |
| `src/ui/ProgressModal.ts` | 写入前再校验一次（纵深防御：写入层不信任调用方） |
| `test/verify-zip.ts` | 新增 12 项断言（恶意 ZIP 被丢弃 + `safeImageKey` 各类输入） |

**保留能力**：嵌套子目录（`sub/deep.png`）仍可用——MinerU 确实会产出嵌套 `images/` 目录。

**验证**：`npm test` 全通过（verify-split 18 项 + verify-zip 19 项）；`npm run lint` 0 错 0 警；`npm run build` 通过。vault 内产物与本地构建 md5 逐字节一致。

**未验证**：Obsidian 实机未跑（需真实 MinerU 结果 ZIP 转换一次，确认图片仍正常写入 `images/`）。

## 2026-10-23（下午）— 第二批：响应壳归一 + 令牌判定修复

**触发**：用户要求"及时提交、符合 git 最佳实践、继续"。上午三个 commit（docs 5e675b0 / fix 1a8767b / test 9342395）落库后继续处理遗留问题。

**证据先行**：用无效 token 实测 MinerU 接口（不涉及真实凭据），发现鉴权失败响应壳是
`{ success, msgCode, msg, traceId, total }`，而代码只认 `{ code, ... }` —— 详见 `TECHNICAL_REFERENCES.md` R-06。

**代码变更**：
| 文件 | 变化 | 功能 |
| --- | --- | --- |
| `src/api/types.ts` | `ApiResponse` 同时声明两种响应壳（`code`/`msgCode`、`trace_id`/`traceId`、`success`） | F-016 |
| `src/api/MinerUClient.ts` | `envelopeCode()` 归一取码；`testConnection` 判定重写：401/403=token 无效（原来**误报有效**），其他 4xx=鉴权已通过 | F-012、F-016 |
| `src/ui/ProgressModal.ts` | `writeResult` 入口检查 abort；写入顺序改为先图片后 .md（.md 作提交标记） | F-018、F-015 |
| `src/ui/ConflictModal.ts` | `settle()` 保证 promise 只 resolve 一次（原按钮路径会 double-resolve） | F-004 |

**验证**：`npm run lint` 0 错 0 警；`npm run build` 通过；`npm test` 25 断言全过。
**未验证**：有效 token 路径的 [测试连接]（需用户点一次）；UI 行为仍未真机回归。

## 2026-10-23（上午）— 功能账簿建立 + 首批修复

**目标**：建立功能账簿与技术参考，做九维系统审查，实施第一批高收益低风险修复。

**产出文档**：`docs/FEATURE_LEDGER.md`（F-001…F-022）、`docs/TECHNICAL_REFERENCES.md`（R-01…R-05）。

**代码变更**（功能 ID 见账簿）：

| 文件 | 变化 | 功能 |
| --- | --- | --- |
| `src/ui/ProgressModal.ts` | 修复终态按钮回归：成功显示 [打开 Markdown][关闭]，失败/取消显示 [关闭]；后台完成改为通知内按钮，不再抢焦点自动打开；删除无意义的 `cancelled` 标志 | F-007、F-008 |
| `src/utils/constants.ts` | 新增 `resolveModelVersion()`（HTML 文件强制 MinerU-HTML）、`HTTP_429_MAX_RETRIES`；删除无调用点且与 manifest 不符的 `PLUGIN_ID`、`DEFAULT_BATCH_SIZE`、`DEFAULT_BATCH_DELAY_SEC` | F-010 |
| `src/ui/ProgressModal.ts` | 转换前按扩展名解析模型并提示 | F-010 |
| `src/commands/convertFile.ts` | 新增文件存在性与 200 MB 大小预检；跳过提示改走 i18n（原为写死英文） | F-011、F-014 |
| `src/api/MinerUClient.ts` | 429 重试加上限（5 次）后以 `rate-limit` 错误终止；`sleep()` 结束时移除 abort 监听（消除长轮询监听器堆积）；轮询间隔/上限改用常量；删除无调用点的 `progress()` | F-017、F-018 |
| `src/main.ts` | 删除预留的 `PLUGIN_VIEW_TYPE` 死代码 | — |
| `src/i18n/locale/en.ts` `zh-cn.ts` | 新增 `conflictSkipped`、`htmlModelForced`；删除 6 个无调用点 key；`apiErrRateLimit` 文案改为"重试过多"语义 | F-014 |

**测试**：把 `verify-split.ts` / `verify-zip.ts` 从 `.workbuddy/scratch/`（被 gitignore，有丢失风险）迁入 `plugin/test/`，
新增 `test/run.mjs` 与 `npm test`。结果：`npm test` 25 项断言全部通过（拆分 18 + 解压 7）。
`npm run lint` 0 错误 0 警告；`npm run build`（tsc + esbuild）通过。

**技术决策**（详见 TECHNICAL_REFERENCES）：
1. Notice 内操作按钮用 `createFragment()` + 按钮，不升 minAppVersion、不用 deprecated 的 `noticeEl`。
2. HTML 文件按扩展名自动切 `MinerU-HTML` 模型并提示，而非报错让改设置——API 约束是客观的，不给用户无意义的选项。
3. 429 从"无限重试"改为有界重试：无反馈的无限等待比明确失败更差。

**未做 / 留待**：
- UI 回归（终态按钮、后台通知）只做了代码级修复，未在真实 Obsidian 里点过。
- `testConnection` 的宽松判定（400/401/403 皆可能误判为有效）未改——需拿无效 token 实测服务端返回后再定。
- `extract_progress` 页级进度未接入 UI。
- ~~未提交 commit~~ → 已按逻辑拆成三个 commit 提交：`5e675b0`（docs）/ `1a8767b`（fix）/ `9342395`（test），post-commit 钩子已自动同步到本机 vault。

## 2026-11-06 · README 精简重写（商店可读性）

**背景**：插件已在 Obsidian 社区商店上架。商店页面直接渲染 README，
README 就是用户搜索到插件后看到的**第一份说明** —— 它太长了。

同时发现两个问题：
1. README 里的插件图标（`assets/icon.png`，`width="96"`）在商店里变得巨大。
2. README 篇幅远超优秀社区插件，用户要点 "Show more" 才能看全。

**调研结论**（实测 14 个高质量社区插件的 README）：
- **87% 的优秀插件不放插件图标**。商店网页头部用的是**通用 lucide 图标**，
  **不读**仓库里的 `icon.png`；Obsidian 应用内插件列表的图标来自 `manifest.json`
  的 `icon` 字段，与 README 无关。→ **README 里放图标没有任何功能价值**，
  只有「撑满一行」的代价。
- 商店 CSS 有 `img,video{max-width:100%;height:auto}`，图片不会溢出，
  但**没写 width 的图会撑满容器宽度**。
- 商店 README 越长，首屏可见内容越少（实测 Tasks 只露 608 字符）。
- **15 个插件里 0 个有目录（TOC）**。
- 设置项说明、原理说明普遍**链到 docs**，README 里只列功能名 + 链接。
- License 普遍**一行链接**，从不贴全文。
- 语言切换行放在 H1 之后，当前语言加粗。

**改动**：

| 行数 | 改动前 | 改动后 |
|---|---|---|
| `README.md` | 73 行 / 3942 字节（英文） | 40 行 |
| `README.zh.md` | 73 行（中文） | 40 行 |

1. **去掉插件图标**（5 个仓库全部）。徽章保留（shields.io 本身就是小图）。
2. **新建 `docs/user-guide.md`**（中文）/ `docs/user-guide.en.md`（英文）：
   把原本 README 里的完整内容搬过去 —— 设置项表、技术原理、开发说明、
   已知限制，一条不丢。
3. **README 重写**，结构统一为：
   H1 → 语言切换 → 一句话副标题 → 徽章 → 演示图 → 功能（每条链到 user-guide 对应小节）
   → 安装 → 文档 → 许可证。**4–8 个 H2**，不放 TOC。
4. **保留在 README 里的例外**（不能链走的内容）：

- **演示 GIF**（1 个）与**仓库结构表**—— 这个仓库同时是插件与工程笔记仓库，
  结构表帮读者判断该看哪份文档。

5. **顺带修掉的问题**：**`README.md`（英）与 `README.zh.md`（中）**原本两者的「目录」表内容重复，
且部分链接指向中文章节；现在各自只指向自己语言的文档。

**验证**：
- 所有 README 内部链接与锚点用 GitHub 锚点算法**逐条校验，0 无效**。
- 所有 README 与 user-guide 的**编码完整**（0 个 U+FFFD 替换字符）。
- 各仓库 `npm run verify` 全绿（typecheck + lint 0 问题 + stylelint + vitest + build）。

**未解决/风险**：
- **未在真实 Obsidian 商店页面确认渲染效果**（本环境无 GUI，商店页面是客户端渲染，
  WebFetch 拿不到内容）。图标已移除，理论上不会再有「巨大图标」问题。
- 商店页面 README 的折叠阈值具体数值未测（调研只测到了字符数，未换算成行数）。
