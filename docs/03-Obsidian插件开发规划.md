# Obsidian 插件开发规划：MinerU Converter

> 让用户在 Obsidian 知识库内，一键把任何格式的文档转成 Markdown。

---

## 一、产品愿景

> **一个 Obsidian 右键菜单选项，把任意 PDF / Word / PPT / Excel / 图片变成可编辑的 Markdown。**

### 1.1 用户故事

**作为** 一个用 Obsidian 管理学习资料的考研 / 留学 / 考证学生，
**我希望** 在知识库里看到一堆老师发的 PDF / Word / 课件时，能直接右键 "转换为 Markdown"，
**以便** 把它们变成可搜索、可链接、可在 Obsidian 里批注的 Markdown 笔记，省去手动复制粘贴的麻烦。

### 1.2 核心价值

| 痛点 | 解决方案 |
|---|---|
| 老师发的 PDF 课件在 Obsidian 里无法搜索 | 转成 Markdown 后全文可搜 |
| 想给 PDF 段落加双向链接 | Markdown 天然支持 `[[wikilink]]` |
| 想把图片里的笔记 OCR 出来 | MinerU 自动 OCR + 排版还原 |
| 想批量处理几十个 PDF / Word | 插件批量转换 + 进度条 |
| 文件散落在不同文件夹 | 保留原目录结构，原位输出 |

---

## 二、功能范围

### 2.1 MVP（v0.1）

| 功能 | 描述 |
|---|---|
| **单文件右键转换** | 在文件上右键 → "通过 MinerU 转换为 Markdown" |
| **多格式支持** | PDF / Word / PPT / Excel / 图片 |
| **API Token 配置** | 设置页填 Token + 选择模型版本 + 语言 |
| **原位输出** | 输出到原文件同目录，文件名 `{原名}.md` |
| **跳过已存在** | 已有同名 `.md` 时弹窗确认是否覆盖 |
| **进度提示** | Obsidian 顶部 Notice 显示 "上传中 / 解析中 / 完成" |
| **失败重试** | 失败文件可右键 "重试转换" |

### 2.2 v0.2（后续迭代）

| 功能 | 描述 |
|---|---|
| **批量选择转换** | 多选文件后右键批量转换 |
| **进度面板** | 单独的 Modal 显示批量转换进度（成功/失败列表） |
| **自动拆分大 PDF** | 检测 > 200 页自动拆分，事后合并 |
| **加密 PDF 处理** | 弹窗输入密码后解密再转换 |
| **音频嵌入** | 检测同目录音频文件，自动加 `![[xxx.m4a]]` 嵌入 |
| **自定义输出格式** | 支持输出 docx / html（需 extra_formals） |

### 2.3 v1.0（远期）

| 功能 | 描述 |
|---|---|
| **Watcher 模式** | 文件夹 watcher，新文件自动转换 |
| **Cloud 模式** | 支持用回调（callback）替代轮询，更省资源 |
| **PDF 转 PDF 转 Markdown** | 双 PDF：原 PDF + Markdown 双链 |
| **多 Token 池** | 多个 MinerU 账号轮询，提升并发 |

---

## 三、技术方案

### 3.1 技术栈

| 层 | 技术 |
|---|---|
| 插件框架 | Obsidian Plugin API（TypeScript） |
| UI | Obsidian 内置组件 + Modal |
| 网络请求 | Obsidian `requestUrl`（内置，支持绕过 CORS） |
| 文件 IO | Obsidian `Vault.adapter` |
| 设置持久化 | Obsidian `Plugin.loadData()` / `saveData()` |
| 大文件下载 | Obsidian `requestUrl` 流式下载 / Node `https` 模块 |

### 3.2 关键模块设计

```
obsidian-mineru/
├── main.ts                  # 插件入口
├── src/
│   ├── api/
│   │   ├── MinerUClient.ts  # API 客户端（封装所有端点）
│   │   └── types.ts         # API 类型定义
│   ├── commands/
│   │   ├── convertFile.ts   # 单文件转换命令
│   │   └── convertBatch.ts  # 批量转换命令
│   ├── ui/
│   │   ├── ProgressModal.ts # 进度弹窗
│   │   └── SettingsTab.ts   # 设置页
│   ├── utils/
│   │   ├── fileWalker.ts    # 文件遍历
│   │   ├── pdfSplitter.ts   # PDF 拆分（>200页）
│   │   ├── mdMerger.ts      # 多 part Markdown 合并
│   │   └── audioEmbedder.ts # 音频嵌入链接
│   └── settings.ts          # 设置数据结构
├── manifest.json            # Obsidian 插件清单
├── styles.css               # 样式
└── esbuild.config.mjs       # 构建配置
```

### 3.3 关键 API 封装（TypeScript）

```typescript
// src/api/MinerUClient.ts

export interface MinerUConfig {
  token: string;
  modelVersion: 'pipeline' | 'vlm' | 'MinerU-HTML';
  language: string;          // 'ch' | 'en' | ...
  enableFormula: boolean;
  enableTable: boolean;
  batchSize: number;         // 默认 40
  batchDelay: number;        // 默认 70s
  pollInterval: number;      // 默认 15s
  maxFileSize: number;       // 默认 200MB
}

export interface ConvertResult {
  success: boolean;
  mdPath?: string;
  errMsg?: string;
}

export class MinerUClient {
  constructor(private config: MinerUConfig) {}
  
  /** 批量提交本地文件 */
  async submitBatch(files: TFile[]): Promise<{ batchId: string; fileUrls: string[] }> {
    const filesData = files.map((f, i) => ({ name: f.name, data_id: String(i) }));
    const res = await this.request('POST', '/api/v4/file-urls/batch', {
      files: filesData,
      model_version: this.config.modelVersion,
      enable_formula: this.config.enableFormula,
      enable_table: this.config.enableTable,
      language: this.config.language,
    });
    return { batchId: res.data.batch_id, fileUrls: res.data.file_urls };
  }
  
  /** 上传单个文件到预签名 URL */
  async uploadFile(url: string, file: TFile): Promise<boolean> {
    const buffer = await this.vault.readBinary(file);
    const res = await fetch(url, { method: 'PUT', body: buffer });
    return res.status === 200;
  }
  
  /** 轮询直到所有文件处理完成 */
  async pollBatch(batchId: string, numFiles: number): Promise<AsyncGenerator<ExtractResult>> {
    // ...
  }
  
  /** 下载结果 ZIP 并提取 full.md */
  async downloadAndExtract(zipUrl: string): Promise<string> {
    // 用 Obsidian requestUrl 下载，JSZip 解压
  }
}
```

### 3.4 关键命令实现

```typescript
// src/commands/convertFile.ts

import { Editor, MarkdownView, Plugin, TFile } from 'obsidian';

export function registerConvertFileCommand(plugin: Plugin) {
  plugin.addCommand({
    id: 'mineru-convert-file',
    name: '通过 MinerU 转换为 Markdown',
    checkCallback: (checking: boolean) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) return false;
      
      const ext = file.extension.toLowerCase();
      const supported = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
                        'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
      if (!supported.includes(ext)) return false;
      
      if (!checking) {
        new ProgressModal(plugin.app, [file], plugin.settings).open();
      }
      return true;
    },
  });
}
```

### 3.5 文件菜单注册

```typescript
// main.ts

import { Plugin, TFile } from 'obsidian';
import { FILE_CONTEXT_MENU } from './constants';

export default class MinerUPlugin extends Plugin {
  async onload() {
    // 注册右键菜单（文件浏览器）
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && isSupported(file)) {
          menu.addItem((item) => {
            item
              .setTitle('通过 MinerU 转换为 Markdown')
              .setIcon('document-convert')
              .onClick(async () => {
                new ProgressModal(this.app, [file], this.settings).open();
              });
          });
        }
      })
    );
  }
}
```

---

## 四、关键交互设计

### 4.1 进度提示流程

```
[用户右键文件] → "通过 MinerU 转换为 Markdown"
   ↓
[弹出 ProgressModal]
   ↓
[显示状态] 
   - "上传到 MinerU..." （带 spinner）
   - "MinerU 解析中 (1/40 完成)..."
   - "下载结果..."
   - "完成！已保存为 xxx.md"
   ↓
[用户关闭 Modal，新 .md 出现在原文件旁]
```

### 4.2 批量选择流程

```
[用户多选文件]
   ↓
[右键 → "批量转换为 Markdown"]
   ↓
[确认弹窗：共 X 个文件，预计耗时 Y 分钟]
   ↓
[后台转换，每完成一个更新进度条]
   ↓
[完成后展示结果列表（成功 N 个 / 失败 M 个）]
```

### 4.3 设置页

```
MinerU API Token:        [eyJ0eXBl...              ]
模型版本:                [vlm           ▼]
语言:                    [ch (中英文)   ▼]
☑ 启用公式识别
☑ 启用表格识别
批量大小:                [40]
批次间隔（秒）:          [70]
轮询间隔（秒）:          [15]
最大文件大小（MB）:      [200]

[测试连接] [保存]
```

---

## 五、踩坑预警（来自实操经验）

### 5.1 速率限制（必踩）

**解决**：
- 设置页暴露 `batchSize` 和 `batchDelay` 给高级用户
- 默认 `batchSize=40`、`batchDelay=70`
- 429 时自动 sleep 65s 重试

### 5.2 CDN SSL 下载失败（必踩）

**解决**：
- 优先用 Obsidian `requestUrl`（基于 Electron fetch，对 SSL 更宽容）
- 失败回退：Node `https` 模块 + 自定义 SSL context
- 最后回退：提示用户手动下载

### 5.3 代理环境（部分用户）

**解决**：
- 设置页允许填 `proxy` URL
- 用 `requestUrl({ throw: false, ...proxy })` 走代理
- 默认不填（直连）

### 5.4 200 页限制（必踩）

**解决**：
- 自动检测页数（用 pdf-lib 读取）
- > 200 页 → 自动拆分为多个 part
- 各 part 分别提交，事后合并 Markdown（用 `\n\n--- Part N ---\n\n` 分隔）

### 5.5 加密 PDF（小概率）

**解决**：
- 检测到加密时弹窗输入密码
- 用 pdf-lib 解密后再提交
- 临时文件用完即删

### 5.6 单文件失败不应阻塞其他文件

**解决**：
- 每个文件独立 try/catch
- 失败记录到结果列表，允许用户单独重试

---

## 六、发布计划

| 阶段 | 内容 | 时间 |
|---|---|---|
| **v0.1 Alpha** | 单文件转换 + 设置页 + 进度提示 | 2 周 |
| **v0.2 Beta** | 批量选择 + 进度面板 + 错误重试 | + 2 周 |
| **v0.3 RC** | 自动拆 PDF + 加密 PDF 处理 + 音频嵌入 | + 1 周 |
| **v1.0 正式** | 完整功能 + 文档 + Obsidian 社区发布 | + 1 周 |

### 6.1 社区发布 checklist

- [ ] 写 README（中英文）
- [ ] 录 1 分钟演示视频
- [ ] 在 Obsidian 插件市场提交（PR 到 obsidianmd/obsidian-releases）
- [ ] GitHub Actions 自动构建 release
- [ ] 添加 License（MIT）

---

## 七、商业模式思考

| 模式 | 可行性 |
|---|---|
| **完全免费 + 自行提供 Token** | ✅ 推荐：插件完全免费，用户自己注册 MinerU 账号填 Token。无后端、无运营成本。 |
| 免费增值（高级功能付费） | ⚠️ 可考虑：批量上传、Cloud 模式等高级功能收费 |
| SaaS 化（我们提供 Token，按量收费） | ❌ 暂不考虑：涉及支付、合规、计费等复杂基础设施 |

> 推荐**方案 A**：免费 + 自带 Token。这样插件本身没有任何"运营负担"，用户也无需担心数据泄露（文件全程走用户自己的 Token）。

---

## 八、参考资源

| 资源 | 链接 |
|---|---|
| MinerU API 文档 | https://mineru.net/apiManage/docs |
| MinerU 输出格式说明 | https://opendatalab.github.io/MinerU/reference/output_files/ |
| Obsidian 插件开发文档 | https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin |
| Obsidian 插件示例 | https://github.com/obsidianmd/obsidian-sample-plugin |
| pdf-lib (PDF 操作) | https://pdf-lib.js.org/ |
| JSZip (解压) | https://stuk.github.io/jszip/ |

---

## 九、立即可动手的 MVP 步骤

1. **第一步**：用 Obsidian 官方 sample-plugin 模板初始化项目
2. **第二步**：实现 `MinerUClient`（先支持单文件提交 + 轮询 + 下载）
3. **第三步**：注册右键菜单 + 设置页
4. **第四步**：用本地 sample PDF 跑通流程
5. **第五步**：扩展为批量 + 进度条

预计第一个可演示版本 1-2 周内可以完成。