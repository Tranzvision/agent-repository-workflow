# 能力运行时把答案夹具对 Codex Reviewer 隐藏

Status: completed

## What to build

来源: ARW/capfixture. 做 Reviewer 能力测试时, 被测 Reviewer 的 Codex `:read-only` 沙盒可读整个磁盘, 它只要搜一下就能读到本检出里的答案键 (`tests/fixtures/reviewer-capability/**/expected.json`, `anchors.json`, `brief.md`), 能力对比结果就不可信. 先查过 (见 ARW/capfixture 报告): 10-26 至 11-19 的 681 个 Codex 能力实例会话里没有一次读过这些路径或在输出里出现答案键文本, 以往结论不受影响; 本 issue 是加固. 无设计决定 (沿用 issue 0155 的 `none` 条目机制), 不写 spec.

做法 (最小): Reviewer 输入新增可选的 `hiddenPaths` (绝对路径数组, 缺省为空); `reviewerNativeSettings` 对每个路径加 `"none"` 条目 (首次启动, 后续任务, 冷恢复都经此函数; 记录里保存 `hiddenPaths` 供冷恢复, 旧记录没有该字段按空处理). `lib/reviewer-capability-setup.mjs` 返回的输入带 `hiddenPaths: [<本检出>/tests/fixtures/reviewer-capability]`, `run` 经 `spawn_agent` 原样传给运行时. 真实审核轮不传, 行为不变. 长期规格 Reviewer runtime 节和 ADR 0016 各改一句 (文档预计净增约 400 字符). 体积预算: 非测试代码净增不超过 10 行.

不做 (已知缺口, 写入报告): 其他副本 (如 `ARW-codex20`, 其他 worktree) 里的同名夹具仍可读, 靠 `inspect` 的答案键内容检查发现并作废; Claude 后端不处理 (不测 Claude 模型, 用户 2026-11-19).

预期验证: `pnpm test`; `pnpm typecheck`; `node scripts/check-workflow-distribution.mjs`; `node scripts/generate-install-arw.mjs --check`; `git diff --check`; 真实 Codex Reviewer (`gpt-6-luna` `xhigh`, 账号 codex100) 探针: 不加 `hiddenPaths` 读得到答案键, 加了读不到.

## Acceptance criteria

- [x] `hiddenPaths` 里的每个路径出现在 Reviewer 文件系统策略里且为 `"none"`, 随恢复记录保存, 必须是绝对路径 (测试: `reviewer-native-policy.test.mjs`, `reviewer-runtime.test.mjs`, 去掉改动后失败).
- [x] 能力场景的输入含本检出的答案夹具目录 (测试: `reviewer-capability-setup.test.mjs`).
- [x] 探针: 真实 Codex Reviewer 被要求找答案键, 不加隐藏时读得到 (确定性探针), 加隐藏后读不到本检出的夹具 (结果写在 `## Validation`).

## Blocked by

- None - can start immediately

## Validation

- `pnpm test` 1041 项通过; `pnpm typecheck` 干净; `check-workflow-distribution`, `project-claude-skills --check`, `generate-install-arw --check`, `git diff --check` 通过. 去掉策略循环后 2 个测试失败.
- 确定性探针 (`codex sandbox` 加 `reviewerNativeSettings` 策略): 不加隐藏时 cat 答案键, ls 夹具目录, grep -r 都读得到; 加隐藏后三项都 `Permission denied`, 检出的 `AGENTS.md` 仍可读.
- 真实探针 (luna xhigh, codex100, 被要求找答案键): 加隐藏时 Reviewer 报告本检出夹具目录被策略拒绝, 可读到的答案键只在其他副本 (`ARW-codex20`, 写作评测数据副本, 其他 worktree). 不加隐藏的实机对照未跑, 以确定性探针为对照.
- 体积 (预算: 代码 10 行, 文档约 400 字符):

```
code: +5 lines (files: 4)
documents: +254 characters (files: 2)
tests: +27 lines (files: 3)
```

## Comments

- 范围 (本机工作方式): 不含设计决定, 单 effort 单实施 issue, Spec Readiness 按用户 2026-11-02 常设确认记录 `not-applicable`.
- 未跑能力 A/B: 改动只对一个没有 Reviewer 读取的路径加拒绝, 且 681 个会话零读取; 是否仍要 A/B 由 Main 定.
