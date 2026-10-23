# 技术参考记录（TECHNICAL_REFERENCES）

记录"改代码前查证过什么、结论是什么、采纳了什么"。只写实际核实过的内容；未核实的一律标注。

核对日期：2026-10-23。

## R-01 声明式设置 API（getSettingDefinitions）是否可用

- 要解决的问题：设置页同时维护 `display()` 与 `getSettingDefinitions()` 两套渲染，是否必要、是否安全。
- 来源：官方 API 类型定义 `obsidian` npm 包（即 github.com/obsidianmd/obsidian-api 发布物），本项目 `plugin/node_modules/obsidian/obsidian.d.ts`，版本 **1.13.1**。
- 核实结果（直接证实）：`PluginSettingTab.getSettingDefinitions(): SettingDefinitionItem[]` 存在（d.ts 5159、6584 行）；
  `getControlValue` / `setControlValue` 存在；文档注释明确 "Not called when `getSettingDefinitions` returns a non-empty array"（6633 行，指 `display()`）。
- 结论：双轨共存安全——1.13+ 走声明式并进入设置搜索索引，1.5–1.12 走 `display()`。
- 决定：**维持现状**。minAppVersion 仍是 1.5.0，`display()` 不能删；改设置项时两处必须同步（已写入功能账簿 F-013）。

## R-02 Notice 上加操作按钮的兼容做法

- 要解决的问题：F-008 后台完成后应给"打开/忽略"操作，而不是抢焦点自动打开文件。
- 来源：同上 d.ts（Notice 类，4613 行起）。
- 核实结果（直接证实）：`Notice` 只有 `setMessage` / `hide` 与三个元素属性；`messageEl`、`containerEl` 标注 `@since 1.8.7`，`noticeEl` 已 deprecated。
- 适用条件：本插件 minAppVersion=1.5.0，直接用 `messageEl` 会破坏 1.5–1.8 兼容；用 `noticeEl` 会踩 deprecated API（审查扫描器可能提示）。
- 决定：**采纳 DocumentFragment 方案** —— `new Notice(fragment, 0)`，按钮建在 fragment 里再挂进 Notice，两个版本分支都可用，不改 minAppVersion。属于推断性结论（API 形状证实可行，按钮交互未经真机验证）。

## R-03 file-menu 事件签名

- 来源：同上 d.ts 8109 行：`on(name: 'file-menu', callback: (menu, file, source, leaf?) => any)`。
- 结论：当前 `(menu, file) => …` 的写法合法；若将来要区分触发来源（文件管理器 / 标签页 / 链接菜单）用第三参 `source`。
- 决定：**不改**。

## R-04 对标项目：obsidian-importer（Obsidian 官方组织，社区维护）

- 来源：https://github.com/obsidianmd/obsidian-importer（2026-10-23 访问，README + 仓库结构可见）。
- 核实结果（直接证实）：多格式（Notion / OneNote / Evernote / HTML / CSV / Markdown …）导入为 Markdown 的官方社区插件；仓库含自动化测试（PR "Test the importers' conversions, and let them run without the dialog"，2026-08），支持无对话框运行导入。
- 对本插件的参考价值：
  - **采纳**：为"格式→Markdown 转换流水线"建立可离线运行的自动化测试，是官方组织同类插件的实际做法。本插件已有 `verify-split.ts` / `verify-zip.ts` 雏形，应固化进仓库并接入 npm script（列入优化清单）。
  - **部分采纳**：无对话框/静默运行模式值得作为远期选项（当前只有单文件 + 后台模式）。
  - **不采纳**：其"多格式解析器框架"抽象（每格式一个 importer 类）。本插件的解析在云端（MinerU API），本地只做 PDF 拆分，抽象层收益低、复杂度高。
- 许可证：未逐文件核对（README 未见 LICENSE 说明）。本次不复制其任何代码，只借鉴做法。

## R-05 未核实 / 待验证

| 事项 | 现状 | 需要什么才能定论 |
| --- | --- | --- |
| `testConnection` 对无效 token 究竟返回 400/401 哪种 + 什么 code | 推断 400/401 均可能，现判定偏宽松（F-012） | 拿一个无效 token 实测一次 |
| HTML 文件用非 MinerU-HTML 模型时服务端报什么错 | 依据 `docs/01-API文档理解.md`（自写笔记，非官方）"必须使用 MinerU-HTML" | 实测或查 MinerU 官方 API 文档（https://mineru.net/apiManage/docs） |
| `copyPages` 对扫描件 / AcroForm / Tagged PDF 的行为 | 未实测 | 带真实样本跑 `verify-split.ts <pdf>` |
