// 简体中文（zh-cn）

export default {
	// 插件元数据
	pluginName: 'MinerU 转换器',
	pluginDesc:
		'在知识库中右键任意 PDF / Word / PPT / Excel / 图片，通过 MinerU 精准解析 API 一键转成 Markdown。',

	// 文件菜单 / 命令面板
	menuConvertFile: '通过 MinerU 转换为 Markdown',
	cmdConvertFile: '通过 MinerU 转换为 Markdown',
	cmdConvertFileTooltip: '使用 MinerU 将选中文件转换为 Markdown',

	// 错误 / 提示
	noApiToken:
		'MinerU：尚未填写 API Token，请到 设置 → 第三方插件 → MinerU 转换器 配置。',
	unsupportedFileType: 'MinerU：不支持该文件类型的转换。',
	fileNotFound: 'MinerU：文件未找到，可能已被删除。',
	fileTooLarge: (sizeMB: string) =>
		`MinerU：文件 ${sizeMB} MB，超出 200 MB 上限。`,
	pdfTooManyPages: (pages: number) =>
		`MinerU：PDF 有 ${pages} 页，超出 200 页上限。v0.1 暂不自动拆分大 PDF。`,

	// 冲突弹窗
	conflictTitle: 'Markdown 文件已存在',
	conflictDesc: (mdPath: string) =>
		`同名 Markdown 文件已存在：\n${mdPath}\n\n请选择处理方式：`,
	conflictOverwrite: '覆盖',
	conflictSkip: '跳过',
	conflictCancel: '取消',

	// 进度弹窗
	progressTitle: 'MinerU 转换中',
	progressSubmitting: '正在提交任务到 MinerU…',
	progressUploading: (fileName: string) => `正在上传 ${fileName}…`,
	progressPolling: (current: number, total: number, elapsed: string) =>
		`MinerU 解析中 — ${current}/${total} 完成（已用时 ${elapsed}）`,
	progressDownloading: '正在下载结果…',
	progressExtracting: '正在解压 Markdown…',
	progressSaving: '正在保存到知识库…',
	progressDone: (mdPath: string) => `完成！已保存为 ${mdPath}`,
	progressFailed: (errMsg: string) => `失败：${errMsg}`,
	progressCancel: '取消',
	progressClose: '关闭',
	progressOpenResult: '打开 Markdown',
	progressSingleHint: '提示：批量转换请使用仓库中的 Python 脚本（见 README）。',

	// 设置
	settingsTitle: 'MinerU 转换器',
	settingsTokenName: 'API Token',
	settingsTokenDesc:
		'请到 https://mineru.net/apiManage/apiManage 申请。Token 仅保存在本地 Vault，不会上传。',
	settingsTokenPlaceholder: 'eyJ0eXAiOiJKV1Qi...',
	settingsModelName: '模型版本',
	settingsModelDesc:
		'vlm = 推荐（精度最高）；pipeline = 默认（旧版）；MinerU-HTML = 仅用于解析 HTML 文件。',
	settingsLanguageName: '文档语言',
	settingsLanguageDesc:
		'OCR 语言提示。ch = 中英文混排（最常用）。',
	settingsFormulaName: '识别公式',
	settingsFormulaDesc:
		'开启数学公式识别（输出 LaTeX 风格）。vlm 模型下仅影响行内公式。',
	settingsTableName: '识别表格',
	settingsTableDesc: '开启表格结构识别（输出 Markdown 表格）。',
	settingsTestConnection: '测试连接',
	settingsTestOk: 'Token 看起来有效。',
	settingsTestFail: (msg: string) => `Token 校验失败：${msg}`,
	settingsHintTitle: '使用说明',
	settingsHintBody:
		'1. 填入 Token 并点击「测试连接」。\n2. 在文件浏览器中右键任意支持的文件（PDF / Word / PPT / Excel / 图片）。\n3. 选择「通过 MinerU 转换为 Markdown」。\n4. 新生成的 .md 文件会出现在原文件旁；完成后会询问是否打开。',

	// 模型选项
	modelVlm: 'vlm（推荐）',
	modelPipeline: 'pipeline（默认）',
	modelHtml: 'MinerU-HTML（仅 HTML 文件）',

	// 语言选项
	langCh: 'ch — 中英文混排',
	langEn: 'en — 英文',
	langChServer: 'ch_server — 含日文',
	langJapan: 'japan — 日文',
	langKorean: 'korean — 韩文',
	langLatin: 'latin — 欧洲语言',
	langChineseCht: 'chinese_cht — 繁体中文',

	// API 错误码友好提示
	apiErrA0202: 'Token 无效，请重新检查你的 API Token。',
	apiErrA0211: 'Token 已过期，请到 mineru.net 重新生成。',
	apiErr60005: '文件超过 200 MB 大小上限。',
	apiErr60006:
		'PDF 超过 200 页上限。v0.1 暂不自动拆分，请先手动拆分 PDF。',
	apiErr60007: 'MinerU 模型服务暂时不可用，请稍后重试。',
	apiErr60009: 'MinerU 任务队列已满，请稍候再试。',
	apiErr60018: '已达每日配额上限（1000 页），请明天再试。',
	apiErrRateLimit: '触发速率限制（HTTP 429），插件将自动重试。',
	apiErrGeneric: (code: string | number, msg: string) =>
		`MinerU 接口错误 [${code}]：${msg}`,
};