# MinerU 精准解析 API 完整理解

> 本文档是对 [MinerU 官方 API 文档](https://mineru.net/apiManage/docs) 的完整结构化梳理，包含所有端点、请求/响应字段、状态机、错误码、模型版本、language 取值等内容。

---

## 一、API 定位与核心特性

MinerU 精准解析 API 专为需要高精度、深层次结构化提取的复杂文档设计。

| 特性 | 描述 |
|------|------|
| **极致精度** | 提供行业领先的解析准确性，尤其擅长处理非标准和复杂文档 |
| **深度结构化** | 不只是文本提取，更能深度理解文档的版面和语义，输出包含丰富层级关系的结构化数据 |
| **多模态支持** | 全面支持文本、表格、图片、公式等多种内容类型的精准识别与提取 |
| **复杂版式适应** | 有效应对扫描件、排版混乱、水印干扰等复杂文档场景 |

---

## 二、文件限制（关键硬约束）

| 限制项 | 限制值 |
|--------|--------|
| 单文件大小上限 | **200 MB** |
| 单文件页数上限 | **200 页** |
| 支持文件类型 | PDF、图片（png/jpg/jpeg/jp2/webp/gif/bmp）、Doc、Docx、Ppt、PPTx、Xls、Xlsx、HTML |
| 每日配额 | 每个账号每天享有 1000 页最高优先级解析额度，超过 1000 页的部分优先级降低 |
| 单次批量提交 | **50 个文件** |
| OSS 上传链接有效期 | **24 小时** |
| API 速率限制 | **50 文件/分钟**（实测确认） |
| 默认缓存时间 | 900 秒（15 分钟） |

> 重要：超过 200 页的 PDF 必须拆分处理。超过 200MB 的文件无法上传。

---

## 三、认证方式

所有精准解析 API 均需要在 HTTP Header 中携带 Token：

```
Authorization: Bearer {token}
```

**注意**：
- 必须使用 `Bearer ` 前缀（注意 Bearer 后有一个空格）
- github、aws 等国外 URL 因网络限制会请求超时（应使用国内 CDN/OSS）

---

## 四、API 端点总览

| 功能 | HTTP 方法 | 端点 |
|------|-----------|------|
| 单个文件解析（提交任务） | POST | `https://mineru.net/api/v4/extract/task` |
| 单个文件解析（查询结果） | GET | `https://mineru.net/api/v4/extract/task/{task_id}` |
| 本地文件批量上传解析（获取上传 URL） | POST | `https://mineru.net/api/v4/file-urls/batch` |
| URL 批量上传解析（提交任务） | POST | `https://mineru.net/api/v4/extract/task/batch` |
| 批量任务结果查询 | GET | `https://mineru.net/api/v4/extract-results/batch/{batch_id}` |

Base URL：`https://mineru.net`

---

## 五、单个文件解析

### 5.1 创建解析任务

**接口**：`POST https://mineru.net/api/v4/extract/task`

适用于已经能从 URL 拿到文件的场景（文件已经在公网可访问，比如 CDN、OSS 公网桶、对象存储）。

**请求体**：

```json
{
  "url": "https://cdn-mineru.openxlab.org.cn/demo/example.pdf",
  "model_version": "vlm",
  "is_ocr": false,
  "enable_formula": true,
  "enable_table": true,
  "language": "ch",
  "data_id": "abc123",
  "callback": "http://127.0.0.1/callback",
  "seed": "abc123",
  "extra_formats": ["docx", "html"],
  "page_ranges": "2,4-6",
  "no_cache": false,
  "cache_tolerance": 900
}
```

**请求体参数**：

| 参数 | 类型 | 必选 | 默认 | 说明 |
|------|------|------|------|------|
| `url` | string | ✅ | - | 文件 URL，支持 PDF/Doc/Docx/Ppt/PPTx/Xls/Xlsx/图片/HTML |
| `is_ocr` | bool | ❌ | `false` | 是否启动 OCR，仅 pipeline/vlm 模型有效 |
| `enable_formula` | bool | ❌ | `true` | 是否开启公式识别，仅 pipeline/vlm 模型有效。**对 vlm 模型只影响行内公式** |
| `enable_table` | bool | ❌ | `true` | 是否开启表格识别，仅 pipeline/vlm 模型有效 |
| `language` | string | ❌ | `ch` | 指定文档语言，可选值见第十节，仅 pipeline/vlm 模型有效 |
| `data_id` | string | ❌ | - | 数据 ID，用于在查询时匹配业务数据。组成：大写字母/数字/_/-/.，≤128 字符 |
| `callback` | string | ❌ | - | 解析结果回调 URL，支持 HTTP/HTTPS。POST 方法，UTF-8，`Content-Type: application/json`，参数含 `checksum` 和 `content`。返回 HTTP 200 算成功，否则最多重试 5 次 |
| `seed` | string | ❌ | - | 随机字符串，用于回调签名。**使用 callback 时必须提供**。组成：字母/数字/_，≤64 字符 |
| `extra_formats` | [string] | ❌ | `[]` | 额外导出格式，支持 `docx`、`html`、`latex`（可多选）。markdown/json 默认输出 |
| `page_ranges` | string | ❌ | - | 页码范围，如 `"2,4-6"` 表示 [2,4,5,6]；`"2--2"` 表示 [2..倒数第二页] |
| `model_version` | string | ❌ | `pipeline` | 三选一：`pipeline` / `vlm` / `MinerU-HTML`。HTML 文件必须用 `MinerU-HTML` |
| `no_cache` | bool | ❌ | `false` | 是否绕过缓存。设为 `true` 时从 URL 重新拉取 |
| `cache_tolerance` | int | ❌ | `900` | 缓存容忍秒数，当 `no_cache=false` 时有效 |

**响应**：

```json
{
  "code": 0,
  "data": {
    "task_id": "a90e6ab6-44f3-4554-b459-b62fe4c6b436"
  },
  "msg": "ok",
  "trace_id": "c876cd60b202f2396de1f9e39a1b0172"
}
```

### 5.2 获取任务结果（轮询）

**接口**：`GET https://mineru.net/api/v4/extract/task/{task_id}`

**响应（处理中）**：

```json
{
  "code": 0,
  "data": {
    "task_id": "47726b6e-46ca-4bb9-******",
    "state": "running",
    "err_msg": "",
    "extract_progress": {
      "extracted_pages": 1,
      "total_pages": 2,
      "start_time": "2025-01-20 11:43:20"
    }
  },
  "msg": "ok",
  "trace_id": "c876cd60b202f2396de1f9e39a1b0172"
}
```

**响应（完成）**：

```json
{
  "code": 0,
  "data": {
    "task_id": "47726b6e-46ca-4bb9-******",
    "state": "done",
    "full_zip_url": "https://cdn-mineru.openxlab.org.cn/pdf/018e53ad-d4f1-475d-b380-36bf24db9914.zip",
    "err_msg": ""
  },
  "msg": "ok",
  "trace_id": "c876cd60b202f2396de1f9e39a1b0172"
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.state` | string | 任务状态：`pending` / `running` / `converting` / `done` / `failed` |
| `data.full_zip_url` | string | 解析结果 ZIP 下载地址，state=done 时有效 |
| `data.err_msg` | string | 失败原因，state=failed 时有效 |
| `data.extract_progress.extracted_pages` | int | 已解析页数，state=running 时有效 |
| `data.extract_progress.start_time` | string | 解析开始时间 |
| `data.extract_progress.total_pages` | int | 总页数 |
| `data.data_id` | string | 回传的 data_id |

---

## 六、批量文件解析

### 6.1 本地文件批量上传（OSS 预签名）

**接口**：`POST https://mineru.net/api/v4/file-urls/batch`

**完整流程**：

```
1. POST /api/v4/file-urls/batch  → 获得 batch_id + file_urls（OSS 预签名 URL）
2. PUT 上传文件到对应的 file_url（24 小时内有效，不需设置 Content-Type）
3. 系统自动扫描已上传文件并提交解析任务（无需调用 submit 接口）
4. 轮询 GET /api/v4/extract-results/batch/{batch_id}
5. 从 extract_result[].full_zip_url 下载各文件的解析结果 ZIP
```

**请求体**：

```json
{
  "files": [
    {"name": "demo.pdf", "data_id": "abcd"},
    {"name": "report.docx", "data_id": "efgh"}
  ],
  "model_version": "vlm",
  "enable_formula": true,
  "enable_table": true,
  "language": "ch"
}
```

**请求体参数**：与单文件基本相同，但 `files` 是数组，每个文件支持 `name`/`data_id`/`is_ocr`/`page_ranges`。

**响应**：

```json
{
  "code": 0,
  "data": {
    "batch_id": "2bb2f0ec-a336-4a0a-b61a-241afaf9cc87",
    "file_urls": [
      "https://mineru.oss-cn-shanghai.aliyuncs.com/api-upload/***",
      "https://mineru.oss-cn-shanghai.aliyuncs.com/api-upload/***"
    ]
  },
  "msg": "ok",
  "trace_id": "c876cd60b202f2396de1f9e39a1b0172"
}
```

### 6.2 URL 批量上传

**接口**：`POST https://mineru.net/api/v4/extract/task/batch`

适用于所有文件 URL 都已就绪的场景（不需要本地中转）。

**请求体**：

```json
{
  "files": [
    {"url": "https://cdn-mineru.openxlab.org.cn/demo/example.pdf", "data_id": "abcd"}
  ],
  "model_version": "vlm"
}
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "batch_id": "2bb2f0ec-a336-4a0a-b61a-241afaf9cc87"
  },
  "msg": "ok",
  "trace_id": "c876cd60b202f2396de1f9e39a1b0172"
}
```

### 6.3 批量结果查询

**接口**：`GET https://mineru.net/api/v4/extract-results/batch/{batch_id}`

**响应**：

```json
{
  "code": 0,
  "data": {
    "batch_id": "2bb2f0ec-a336-4a0a-b61a-241afaf9cc87",
    "extract_result": [
      {
        "file_name": "example.pdf",
        "state": "done",
        "err_msg": "",
        "full_zip_url": "https://cdn-mineru.openxlab.org.cn/pdf/018e53ad-d4f1-475d-b380-36bf24db9914.zip",
        "data_id": "abcd"
      },
      {
        "file_name": "demo.pdf",
        "state": "running",
        "err_msg": "",
        "extract_progress": {
          "extracted_pages": 1,
          "total_pages": 2,
          "start_time": "2025-01-20 11:43:20"
        }
      }
    ]
  },
  "msg": "ok",
  "trace_id": "c876cd60b202f2396de1f9e39a1b0172"
}
```

---

## 七、异步任务状态机

### 7.1 单个任务状态值

| 状态值 | 含义 |
|--------|------|
| `pending` | 排队中 |
| `running` | 正在解析 |
| `converting` | 格式转换中 |
| `done` | 完成（可获取 `full_zip_url`） |
| `failed` | 解析失败（可获取 `err_msg`） |

### 7.2 批量任务状态值

| 状态值 | 含义 |
|--------|------|
| `waiting-file` | 等待文件上传（仅批量本地文件上传场景） |
| `pending` | 排队中 |
| `running` | 正在解析 |
| `converting` | 格式转换中 |
| `done` | 完成（可获取 `full_zip_url`） |
| `failed` | 解析失败（可获取 `err_msg`） |

### 7.3 轮询流程建议

```
提交任务 → 获得 task_id / batch_id
   ↓
间隔 15-30 秒轮询（避免过于频繁被限流）
   ↓
state = done → 下载 full_zip_url → 解压 → 取 full.md
state = failed → 记录 err_msg，必要时重试
state = running → 可读取 extract_progress 显示进度
```

> 经验值：30 秒轮询一次，足够覆盖大多数场景且不会被限速。

---

## 八、模型版本选择

### 8.1 可用模型版本

| 模型版本 | 说明 | 推荐场景 |
|----------|------|----------|
| `pipeline` | 传统 pipeline 模型 | 默认模型，常规文档 |
| `vlm` | 视觉语言大模型（VLM） | **推荐** 用于复杂文档解析（精度更高） |
| `MinerU-HTML` | HTML 专用模型 | 解析 HTML 文件时必须使用 |

### 8.2 模型相关参数

| 参数 | 适用模型 | 说明 |
|------|----------|------|
| `is_ocr` | pipeline、vlm | 是否启动 OCR 功能，默认 `false` |
| `enable_formula` | pipeline、vlm | 是否开启公式识别，默认 `true`。**对 vlm 模型只影响行内公式** |
| `enable_table` | pipeline、vlm | 是否开启表格识别，默认 `true` |
| `language` | pipeline、vlm | 指定文档语言，默认 `ch` |
| `extra_formats` | 所有 | 额外导出格式：`docx`、`html`、`latex`（可多选） |

### 8.3 输出格式说明

**非 HTML 文件** 解析结果压缩包内容：

| 文件名 | 含义 |
|--------|------|
| `layout.json` | 中间处理结果 (middle.json) |
| `**_model.json` | 模型推理结果 (model.json) |
| `**_content_list.json` | 内容列表 (content_list.json) |
| `full.md` | **Markdown 解析结果（最常用）** |

**HTML 文件** 解析结果压缩包内容：

| 文件名 | 含义 |
|--------|------|
| `full.md` | Markdown 解析结果 |
| `main.html` | 提取后正文 HTML |

> 详细说明参考：https://opendatalab.github.io/MinerU/reference/output_files/

---

## 九、错误码

### 9.1 通用错误码

| 错误码 | 说明 | 解决建议 |
|--------|------|----------|
| `A0202` | Token 错误 | 检查 Token 是否正确，确认有 `Bearer ` 前缀 |
| `A0211` | Token 过期 | 更换新 Token |
| `-500` | 传参错误 | 确保参数类型及 `Content-Type: application/json` 正确 |
| `-10001` | 服务异常 | 稍后再试 |
| `-10002` | 请求参数错误 | 检查请求参数格式 |
| `-60001` | 生成上传 URL 失败 | 稍后再试 |
| `-60002` | 获取匹配的文件格式失败 | 文件名必须带正确后缀，且为支持格式 |
| `-60003` | 文件读取失败 | 检查文件是否损坏，重新上传 |
| `-60004` | 空文件 | 上传有效文件 |
| `-60005` | 文件大小超出限制 | 检查文件大小，最大支持 200MB |
| `-60006` | 文件页数超过限制 | **拆分文件后重试** |
| `-60007` | 模型服务暂时不可用 | 稍后重试或联系技术支持 |
| `-60008` | 文件读取超时 | 检查 URL 可访问性 |
| `-60009` | 任务提交队列已满 | 稍后再试 |
| `-60010` | 解析失败 | 稍后再试 |
| `-60011` | 获取有效文件失败 | 确保文件已上传 |
| `-60012` | 找不到任务 | 确保 task_id 有效且未删除 |
| `-60013` | 没有权限访问该任务 | 只能访问自己提交的任务 |
| `-60014` | 删除运行中的任务 | 运行中的任务暂不支持删除 |
| `-60015` | 文件转换失败 | 可以手动转为 pdf 再上传 |
| `-60016` | 文件转换失败 | 尝试其他格式导出或重试 |
| `-60017` | 重试次数达到上限 | 等后续模型升级后重试 |
| `-60018` | 每日解析任务数量已达上限 | 明日再来 |
| `-60019` | html 文件解析额度不足 | 明日再来 |
| `-60020` | 文件拆分失败 | 稍后重试 |
| `-60021` | 读取文件页数失败 | 稍后重试 |
| `-60022` | 网页读取失败 | 可能因网络问题或限频导致 |

---

## 十、language 取值参考

`language` 字段建议按下表传入。默认值为 `ch`。

### 10.1 Standalone language packs（独立语言包）

| Value | Included languages | 说明 |
|-------|-------------------|------|
| `ch` | Chinese, English, Chinese Traditional | **中英文（默认值，推荐）** |
| `ch_server` | Chinese, English, Chinese Traditional, Japanese | 繁体、手写体 |
| `en` | English | 纯英文 |
| `japan` | Chinese, English, Chinese Traditional, Japanese | 日文为主 |
| `korean` | Korean, English | 韩文 |
| `chinese_cht` | Chinese, English, Chinese Traditional, Japanese | 繁体中文为主 |
| `ta` | Tamil, English | 泰米尔文 |
| `te` | Telugu, English | 泰卢固文 |
| `ka` | Kannada | 卡纳达文 |
| `el` | Greek, English | 希腊文 |
| `th` | Thai, English | 泰文 |

### 10.2 Language family packs（语系包）

| Value | Script/Family | Included languages |
|-------|---------------|-------------------|
| `latin` | Latin script | French, German, Italian, Spanish, Portuguese, etc.（覆盖欧洲主流语言） |
| `arabic` | Arabic script | Arabic, Persian, Uyghur, Urdu, Pashto, Kurdish, Sindhi, Balochi, English |
| `cyrillic` | Cyrillic script | Russian, Belarusian, Ukrainian, Serbian, Bulgarian, Mongolian, Kazakh, etc. |
| `east_slavic` | East Slavic | Russian, Belarusian, Ukrainian, English |
| `devanagari` | Devanagari script | Hindi, Marathi, Nepali, Sanskrit, etc. |

---

## 十一、关键流程图总结

### 11.1 单文件 URL 解析流程

```
1. POST /api/v4/extract/task
   Header: Authorization: Bearer {token}
   Body: {url, model_version, ...}
   ↓
2. 获得 task_id
   ↓
3. 轮询 GET /api/v4/extract/task/{task_id}
   - state = running → 继续轮询（可读取 extracted_pages/total_pages）
   - state = done → 获取 full_zip_url
   - state = failed → 获取 err_msg
   ↓
4. 下载 full_zip_url → 解压 → 取 full.md / 其他格式
```

### 11.2 单文件 Callback 解析流程

```
1. POST /api/v4/extract/task（同时传 callback 和 seed）
   ↓
2. 服务端解析完成后 POST 推送至 callback URL
   - checksum = SHA256(uid + seed + content)
   - content 为 JSON 字符串
   - 返回 HTTP 200 表示接收成功，否则最多重试 5 次
   ↓
3. 从 content 中解析 data 部分获取 full_zip_url
```

### 11.3 批量本地文件上传解析流程（推荐用于本地文件）

```
1. POST /api/v4/file-urls/batch
   Header: Authorization: Bearer {token}
   Body: {files: [{name, data_id}, ...], model_version}
   ↓
2. 获得 batch_id 和 file_urls（OSS 预签名 URL，24h 有效）
   ↓
3. 使用 PUT 方法将每个文件上传到对应的 file_url
   （不需设置 Content-Type）
   ↓
4. 系统自动扫描并提交解析任务
   ↓
5. 轮询 GET /api/v4/extract-results/batch/{batch_id}
   ↓
6. 从 extract_result[].full_zip_url 下载各文件的解析结果 ZIP
```

### 11.4 批量 URL 解析流程

```
1. POST /api/v4/extract/task/batch
   Body: {files: [{url, data_id}, ...], model_version}
   ↓
2. 获得 batch_id
   ↓
3. 轮询 GET /api/v4/extract-results/batch/{batch_id}
   ↓
4. 从 extract_result[].full_zip_url 下载结果
```

---

## 十二、重要提示总结

1. **认证要求**：所有精准解析 API 调用必须在 HTTP Header 中携带 `Authorization: Bearer {token}`
2. **文件限制**：单文件最大 200MB、最多 200 页
3. **批量限制**：单次申请链接不超过 50 个
4. **速率限制**：实测 **50 文件/分钟**（HTTP 429）
5. **每日配额**：每账号每天 1000 页最高优先级额度
6. **网络限制**：github、aws 等国外 URL 会请求超时
7. **模型选择**：HTML 文件必须使用 `MinerU-HTML` 模型
8. **OSS 上传**：本地文件上传采用 PUT 方法直接上传到 OSS 预签名 URL，**无需设置 Content-Type**
9. **签名验证**：使用 callback 时必须同时提供 `seed` 字段，checksum = SHA256(uid + seed + content)
10. **缓存机制**：默认缓存 900 秒（15 分钟），可通过 `no_cache=true` 跳过缓存
11. **输出格式**：默认输出 markdown 和 json，可通过 `extra_formats` 额外导出 docx/html/latex
12. **文件名后缀**：强烈建议文件名带上正确的后缀名（`.pdf` / `.docx` / `.png` 等），否则 `-60002` 错误
13. **data_id 用途**：用于在自己的业务侧匹配哪个 URL 对应哪个解析结果，回调和批量查询都会回传