# 修正能力运行结果的符号链接写入与两处规则文字

Status: wontfix

## What to build

合并三个已在 HEAD `6722b9f` 读码核对属实的小发现 (来源: 11-26 每日审查台账与 11-27 每日检查), 均无设计决定.

- `lib/reviewer-capability-run.mjs:56` 的 `save` 用普通 `writeFile` 写 `agent.json`, `score.json`, `candidates.json`, `run.json`. 若目标目录中已有同名符号链接, 写入会被重定向到链接指向的文件. 做法: 改为独占创建 (`writeFile` 的 `flag: 'wx'`), 同名文件已存在时报 `instance-write` 失败. 实施前确认 `setupScenario` 总是创建全新目录, 每个文件名在一次运行里只写一次 (当前调用在第 122, 147, 148, 162 行); 若发现合法的重复写入, 只对首次写入使用独占创建, 并在 `## Comments` 记录.
- `.agents/skills/reviewer-capability/SKILL.md:80` 的 Finish 节写 "按 pid 停止本次启动的客户端和守护进程". 后台管理器可能被其他运行共用, 按 pid 停守护进程会误伤. 做法: 改为只停止本次启动的客户端并删除本次临时目录, 不停止守护进程.
- `.agents/skills/commit/implementation-workflow.md:11` 的第 7 步写 "Reviewer 仍报出的低级问题 ... 不修复, 记 '记录不修'", 而 `docs/agents/reviewer.md` 的 Report 节规定 Reviewer 不报低级问题. 两者并不矛盾 (前者处置 Reviewer 违反后者的情形), 但没有说明这一点, 可能被误读. 做法: 在该句加半句 "(Reviewer 违反 `docs/agents/reviewer.md` 的 Report 节时)" 之类的说明; 若实施时认为原文已足够清楚, 不改并在 `## Comments` 写明.

两份 Skill 改动需同步 `.claude/skills/` 投影与 `distribution/skills/` 副本 (按 `AGENTS.md` 的分发与投影检查). 每个代码改动先写失败的定向测试再修. 英文与中文变更日志按需更新.

不在本 issue 内: `reviewer-capability/SKILL.md:35` 允许 `matchesCheckout=false` 照常运行 (有意设计, 文中已写明); `lib/reviewer-capability/inspection.mjs` 的词法包含检查 (待 0174 之后另行评估). 另外 11-27 每日检查列出的 `submodule-git-adapter.mjs` 与 `arw-background-agent-host.mjs` 问题已由 0174 修复, 不在此重复.

预计净增约 +3 行非测试代码, 改文档约 150 字符.

## Acceptance criteria

- [ ] `save` 遇到已有同名符号链接或文件时不写入链接目标, 报 `instance-write` 失败; 有先失败后通过的定向测试, 既有测试不变.
- [ ] `reviewer-capability/SKILL.md` 的 Finish 节不再要求按 pid 停止守护进程.
- [ ] `implementation-workflow.md` 第 7 步的低级问题句已消歧, 或在 `## Comments` 记录不改的理由.
- [ ] 分发, Claude Code 投影与安装引导脚本检查通过, 完整测试与类型检查通过, 新增测试回调不超过 100 毫秒.

## Blocked by

- None - can start immediately

## Validation

(实施后填写)

## Comments

- 来源: `ARW/daily-1127` 报告第 1 项, 条目 `ARW/mid-1127`. 创建时在 HEAD `6722b9f` 逐条核对均仍成立; `lib/reviewer-capability-run.mjs` 的行号为核对时所见.
- Superseded by effort 0177 (commit 6ed25f1), which implemented it.
