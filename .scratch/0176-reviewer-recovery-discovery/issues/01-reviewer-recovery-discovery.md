# 让 Reviewer 冷恢复的记录发现跳过无关的损坏记录

Status: ready-for-agent

## What to build

一个已在 HEAD `5e1fc8a` 读码核对属实的发现 (来源: 11-27 每日审查台账 1131, 无设计决定).

`lib/reviewer-runtime/reviewer-runtime.mjs:964-968` 的冷恢复发现循环对目录中每个 `reviewer-*.json` 调用 `readReviewerSessionRecord`. 该函数对非法 JSON 或不符合当前模式的记录 (例如旧版本留下的) 抛出 `recovery-invalid` (`reviewer-session-record.mjs:174-` 起), 循环没有 `try`, 所以同一目录里任何一个无关身份的损坏或旧记录都会中止整个发现, 使该 `stateDirectory` 下所有运行都无法恢复.

做法: 循环中遇到 `recovery-invalid` 的候选记录时跳过该候选, 继续检查其他记录; 仍只在恰好一个记录的 `runId` 匹配时成功, 否则保持现有 `recovery-identity-mismatch`. 其他错误 (如 `recovery-io-failed`) 照旧抛出. 先写失败的定向测试: 目录里放一个损坏记录加一个匹配记录, 期望恢复到匹配记录; 再修.

预计净增约 +4 行非测试代码.

## Acceptance criteria

- [ ] 目录中有一个 `recovery-invalid` 的无关记录和一个匹配记录时, 冷恢复找到匹配记录; 有先失败后通过的定向测试, 既有测试不变.
- [ ] 无匹配记录或匹配多于一个时仍报 `recovery-identity-mismatch`; `recovery-io-failed` 仍抛出.
- [ ] 完整测试与类型检查通过, 新增测试回调不超过 100 毫秒.

## Blocked by

- None - can start immediately

## Validation

(实施后填写)

## Comments

- 来源: `ARW/daily-1128` 报告第 1 项, `oc-review/ledger.md` 1131 与 `triage/2026-11-27.jsonl`. 同批 1132, 1133 (stop 与 timer 竞态, exited 分支未关 providerPolicy) 只核对了代码路径, 未复现, 不在本 issue.
