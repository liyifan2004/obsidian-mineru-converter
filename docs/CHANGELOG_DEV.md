# 开发记录（CHANGELOG_DEV）

实质性开发的简要记录。只记长期有价值的内容；调试细节不入库。

## 2026-10-23 — 功能账簿建立 + 首批修复（未提交）

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
- 未提交 commit（等用户确认后再提交）。
