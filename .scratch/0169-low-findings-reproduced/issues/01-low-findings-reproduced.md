# 修正先复现的低级发现

Status: completed

## What to build

按当前代码逐项复现 11-22 分诊的 22 条低级发现 (台账 948-969), 只修能复现的. 每项修正先有失败测试再通过.

- 已修: `config.mjs` 拒绝 `background.providers` 为 `null`. `issue-documents.mjs` 拒绝带列表符号或行内形式的畸形 `None` 阻塞项, 以及 Wayfinder issue 中的 External dependency. `arw.mjs` 拒绝空选项值, 读不出的 Spec Readiness `prepare` 输入报告解析错误, 初始化后交接文本转义清单与缺口. `client.mjs` 在启动等待中抛出 spawn 错误.
- 已修: `codex-app-server.mjs` 的卸载只用一个绝对期限, 已加载线程发现重试列在父线程之前的后代, resume 记录路径不符时先 `thread/unsubscribe`. `manager.mjs` 的 `followup_task` 校验 settings, 批量派发失败时把整批消息标为 unknown, 提供方租约归还逐个尝试后汇总报错.
- 已修: `commit-audit.mjs` 不把 Application Source Issue 当作实施 issue, 拒绝编号相同的第二个 effort 目录, 忽略符号链接的规则文件.
- 不改, 原因记入交接报告: 设计如此或无法复现的项, 只为理论风险的内存保留 (`recordCache`), Windows 属主检查 (本机无法验证), 暂存读取与树读取之间的竞态 (单写者, 无法构造).

预计净增 55 行非测试代码.

## Acceptance criteria

- [x] 每个已修项有先失败后通过的定向测试, 未修项在交接报告记录试过什么.
- [x] 描述这些行为的英文读者文档及变更日志已更新.
- [x] 完整测试与类型检查通过, 新增测试回调不超过 100 毫秒.

## Blocked by

- None - can start immediately

## Validation

- `pnpm test` 通过 1082 项, `pnpm typecheck` 通过. 新增回调均在 25 毫秒以内.

```text
code: +55 lines (files: 7)
  lib/arw-common/config.mjs 0
  lib/arw-common/issue-documents.mjs +11
  lib/arw.mjs 0
  lib/background-agent/client.mjs +4
  lib/background-agent/codex-app-server.mjs +16
  lib/background-agent/manager.mjs +9
  lib/commit-audit/commit-audit.mjs +15
documents: +1391 characters (files: 2)
  docs/CHANGELOG.md +940
  docs/CHANGELOG.zh-CN.md +451
tests: +158 lines (files: 9)
  tests/arw-common/config.test.mjs +1
  tests/arw-common/issue-documents.test.mjs +3
  tests/arw-entry.test.mjs +5
  tests/background-agent/client.test.mjs +11
  tests/background-agent/codex-app-server.test.mjs +30
  tests/background-agent/manager.test.mjs +59
  tests/commit-audit/cli.test.mjs +26
  tests/repository-workflow/cli.test.mjs +14
  tests/spec-readiness/cli.test.mjs +9
```
