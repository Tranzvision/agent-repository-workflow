# 检查 Reviewer 写路径时不漏报

Status: resolved

## What to build

修正 `lib/reviewer-capability/inspection.mjs` 对 Reviewer 写路径检查的三处漏报. 来源: 11-25 每日审查 (`ARW/ocreview`) 台账 1086-1088, 11-26 在 HEAD `036cb9e` 读码核对均属实, 无设计决定. 路径检查在 277 行: 路径在实例根之外, 不是 Reviewer 自己的记录, 不在系统目录, 且 (已存在 或 是写入 或 在某个实例根的上层) 时才报. 写入标记 `writes` 目前只在 agy 的写工具 (174 行) 置位.

- Claude Reviewer 的 `Write` 与 `Edit` 调用 (`block.name`, 约 119 行的 `calls.push`) 也置 `writes: true`, 与 agy 一致. 现在写到实例外的新路径时 `existsSync` 为假, 不报.
- `own()` (254 行) 的 Claude 分支同样要求 `!writes`: 读自己的 transcript 目录允许, 写进去不允许 (agy 分支已是这样).
- `SYSTEM_DIRECTORY` 豁免 (277 行) 只对读取生效: 写入 `/usr`, `/etc`, `/dev` 等路径照样报.

不在本 issue 内: Codex 的 `apply_patch` 与 shell 重定向目标的写入识别 (需要解析命令或补丁文本, 属另一个设计问题), 不改; 只改上面三处. 每处先写失败的定向测试 (`tests/reviewer-capability/inspection.test.mjs`) 再修: Claude `Write` 到实例外新文件被报; Claude `Write` 到自己的 transcript 目录被报, `Read` 同一路径不报; Claude `Write` 到 `/etc/x` 被报, `Read` `/etc/hosts` 不报. 只更新描述该检查行为的英文读者文档与变更日志 (若有).

预计净增 +4 行非测试代码.

## Acceptance criteria

- [ ] 三处各有先失败后通过的定向测试, 既有 inspection 测试不变.
- [ ] 完整测试与类型检查通过, 新增测试回调不超过 100 毫秒.
- [ ] 英文与中文变更日志已更新 (若该检查行为在读者文档中有描述, 一并更新).

## Blocked by

- None - can start immediately

## Validation

(实施后填写)

## Comments

- 来源与核对: `~/projects/.tasks/ARW/oc-review/triage/2026-11-25.jsonl` 前三条, `~/projects/.tasks/ARW/daily-report-1126.md`.
- Resolved by effort 0174 (commit 9bd05e9), which merged this issue with its sibling.
