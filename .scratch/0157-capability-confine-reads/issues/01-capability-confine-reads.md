# 能力运行时 Codex Reviewer 只放行实例和运行必需的路径

Status: completed

## What to build

来源: ARW/capfixture2. issue 0156 只把本检出的 `tests/fixtures/reviewer-capability` 设为 `none`, 但本机还有约 96 份副本 (其他 ARW 克隆, 评测数据副本, 各 rules 快照, 其他 worktree) 仍可读, 真实 luna 探针就是从这些副本读到答案键的. 黑名单挡不完. 无设计决定 (沿用 0155 与 0156 的原生策略机制, 收紧办法已在 ADR 0016 与长期规格中记录), 不写 spec.

做法 (实测依据: Codex 0.170 `codex sandbox`): 在父目录设 `none` 再给子目录 `read` 不能放行 (子目录仍读不到), 所以不用黑名单加放行. 改为不继承 `:read-only`, 只给 `:minimal` (系统目录), Codex 可执行文件所在目录 (沙盒在受限文件系统里重新执行它), 工作目录 (读) 和 `writePaths` (写); 其余路径, 包括主目录, `/tmp` 和 `/mnt`, 看不到. Reviewer 输入的 `hiddenPaths` 换成可选布尔 `confineReads` (缺省 false, 随恢复记录保存, 首次启动, 后续任务和冷恢复都经 `reviewerNativeSettings`); `lib/reviewer-capability-setup.mjs` 在 Linux 上传 `true` (其他平台的收紧配置未验证, 见 ADR 0016). 真实审核轮不传, 行为不变. 长期规格 Reviewer runtime 节与 ADR 0016 改写对应句子. 体积预算: 非测试代码净增不超过 15 行.

预期验证: `pnpm test`; `pnpm typecheck`; `node scripts/check-workflow-distribution.mjs`; `node scripts/generate-install-arw.mjs --check`; `git diff --check`; 真实 Codex Reviewer (`gpt-6-luna` `xhigh`, 账号 codex100) 探针各一次: 加限制时全盘找不到答案键, 不加限制 (对照) 找得到; 加限制后正常能力场景仍能跑完.

## Acceptance criteria

- [x] `confineReads: true` 时 Reviewer 文件系统策略没有 `extends`, 只含 `:minimal`, Codex 可执行文件目录, 工作目录 (读) 和写路径; 缺省时与以前完全相同; 该字段随恢复记录保存 (测试: `reviewer-native-policy.test.mjs`, `reviewer-runtime.test.mjs`).
- [x] 能力场景的输入在 Linux 上带 `confineReads: true` (测试: `reviewer-capability-setup.test.mjs`).
- [x] 探针: 加限制的真实 Reviewer 全盘找不到答案键, 不加限制的对照找得到; 加限制后的能力场景正常跑完 (结果写在 `## Validation`).

## Blocked by

- None - can start immediately

## Validation

- `pnpm test` 1041 项通过; `pnpm typecheck` 干净; `check-workflow-distribution`, `generate-install-arw --check`, `git diff --check`, `arw text check` 通过.
- 实测 (Codex 0.170 `codex sandbox`): 父目录 `none` 加子目录 `read` 放行不了子目录; 去掉 `extends` 只给 `:minimal`, Codex 可执行文件目录, 实例 (读), 报告目录 (写) 时, 命令仍能运行 (`git`, `grep`, `find`, node), `/home/pello` 为空目录, `/tmp` 只见到通往实例的目录骨架, 写实例被拒.
- 真实探针 (luna xhigh, codex100, 被要求全盘找答案键): 加限制 `find / -name expected.json` 无结果, 读到 0 个答案文件; 不加限制的对照读到 30 个 (`/home/pello/projects/ARW/...` 等).
- 加限制的真实能力场景 (requirements-reviewer commit-audit, luna xhigh): Reviewer 正常读仓库, 写出 12 KB 报告, 内容是对场景缺陷的具体发现. 结束时 `wait_agent` 报 `report-binding-invalid` (报告目录里出现空的 `.agents` `.aws` `.codex` `.git`); 不加限制的对照探针也出现同一现象, 与本改动无关.
- 体积 (预算: 代码 15 行):

```
code: +14 lines (files: 4)
documents: +186 characters (files: 2)
tests: +32 lines (files: 4)
```

## Comments

- 范围 (本机工作方式): 不含设计决定, 单 effort 单实施 issue, Spec Readiness 按用户 2026-11-02 常设确认记录 `not-applicable`. 本 issue 取代 0156 的 `hiddenPaths` 机制 (0156 的提交保留在历史里).
- 旧恢复记录: 本 issue 取代的 `hiddenPaths` 只存在于未并入主工作区的 0156 提交 `a15f927`, 从未安装或发布, 不存在带该字段的真实恢复记录, 所以不迁移. 缺少 `confineReads` 的记录 (本改动之前的所有记录) 按 false, 即与以前相同.
- 台账: `lib/reviewer-session-record.mjs:26,192,234` (旧恢复记录的读取限制) 记录不修: 被取代的 `hiddenPaths` 只存在于未并入主工作区的 0156 提交, 从未安装, 没有带该字段的真实恢复记录; 缺少 `confineReads` 的记录就是本改动之前的所有记录, 按 false 保持原行为.
