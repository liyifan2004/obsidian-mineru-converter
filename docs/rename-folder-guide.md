# 如何手动重命名本地开发文件夹

## 背景

自动化工具（Git Bash、PowerShell 工具）会持有一个工作目录（cwd）指向
`D:\MyProjects\obsidian-mineru`，导致 `os.rename()` / `mv` / `Rename-Item` 全部
失败并返回 `PermissionError(13, "另一个程序正在使用此文件")`。

这是 Windows 的硬限制：只要有任何进程把目标文件夹当 cwd，就无法 rename 它。
即使那个进程已经"退出"，宿主（WorkBuddy 的 Bash 工具）会缓存住每个工具调用
期间的子 shell，导致 cwd lock 一直持续。

## 解决方案：你自己手动改

最简单、最安全。步骤：

### 1. 准备（防止任何东西 hold cwd）

打开 **任务管理器**（`Ctrl + Shift + Esc`），确认这些进程**没有**打开
`D:\MyProjects\obsidian-mineru\`：

- Obsidian（**必须关闭**，它会 watch 这个路径）
- VSCode / Cursor / Sublime / Notepad++
- Windows 资源管理器（如果它打开了那个文件夹）
- 任何 git GUI（Sourcetree / GitHub Desktop / GitKraken）
- 任何终端模拟器（Windows Terminal / iTerm / Tabby）

### 2. 关闭 Obsidian（关键）

Obsidian 加载了 `obsidian-mineru` 插件，会保持对 vault 内
`D:\桌面\李轶凡的笔记仓库\学-习\.obsidian\plugins\obsidian-mineru\` 的 watcher；
它不会直接 lock `D:\MyProjects\`，但作为预防请先关闭。

### 3. 重命名

**用文件管理器**（最稳）：

1. 打开 `D:\MyProjects\`
2. 在 `obsidian-mineru` 上 **右键 → 重命名**（或选中后按 `F2`）
3. 改成 `obsidian-mineru-converter`
4. 回车确认

**用 PowerShell**（如果文件管理器也失败）：

```powershell
# 先关闭 Obsidian 再执行
Rename-Item -LiteralPath 'D:\MyProjects\obsidian-mineru' -NewName 'obsidian-mineru-converter'
```

### 4. 验证

打开新路径，确认：

```
D:\MyProjects\obsidian-mineru-converter\
├── README.md
├── docs/
├── code/
├── plugin/
│   ├── main.js
│   ├── manifest.json
│   ├── styles.css
│   └── ...
└── .git/
```

### 5. 测试 git 仍正常

在新的 `D:\MyProjects\obsidian-mineru-converter` 里打开终端：

```bash
git status
git log --oneline -5
git remote -v
```

预期输出：

```
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean

2ee506c feat(v0.2): extract images from ZIP + run-in-background + UX polish
57cf169 chore: clean up + ignore .workbuddy/ workspace memory
d333268 docs(plugin): document the post-commit auto-sync workflow
f05ab6c feat(sync): add sync.mjs + post-commit hook + build:sync npm script
17b2e7b feat(scripts): add sync.mjs + post-commit hook for vault auto-deploy

origin  https://github.com/liyifan2004/obsidian-mineru-converter.git (fetch)
origin  https://github.com/liyifan2004/obsidian-mineru-converter.git (push)
```

### 6. 改完告诉我

改完路径后告诉我，下次对话我会从新路径开始工作。

## 后续注意事项

- **Git 历史不受影响**：git 用 blob hash 追踪文件，不存绝对路径。历史
  commit 的 `author` / `committer` 信息不变。
- **IDE 工作区**：如果你的 IDE (VSCode/Cursor) 打开了 `obsidian-mineru` 文件夹，
  改完后需要重新"打开文件夹"指向新路径。
- **Hooks 仍然有效**：`.git/hooks/` 路径不变，hook 行为不变；post-commit
  提交时仍会自动 sync 到 Obsidian vault。
- **sync.mjs 目标路径不变**：目标文件夹名是 `obsidian-mineru`（必须匹配
  manifest.json 的 `id`），不是 `obsidian-mineru-converter`。

## 如果 rename 还是失败

1. **完全关闭 Obsidian**（不是最小化，是 Exit）
2. **重启电脑** → 进入安全模式 → 重命名
3. 用 **Linux 子系统 (WSL)**：`wsl mv /mnt/d/MyProjects/obsidian-mineru /mnt/d/MyProjects/obsidian-mineru-converter`

最后一个方案 100% 成功，因为 WSL 在 NTFS 之上有独立的 inode 视图。