# Codex Reviewer 沙箱挡住实例外的状态目录

Status: completed

## What to build

来源: ARW/capaudit 对提交 7538fcb (issue 0148) 的补审实测: Codex Reviewer 的 `:read-only` 权限继承全盘可读, 实例外的兄弟 `state` 目录 (能力测试的恢复记录) 可被 Reviewer 读到, 与 issue 0148 所写 "读不到实例外状态" 不符. 无设计决定, 不写 spec.

先查结论: 真实审核轮 (Commit Audit, Spec Readiness) 的规则副本目录 `<轮目录>/rules` 和恢复记录目录 `stateDirectory` (轮目录的上级) 都在 `<仓库根>/.tmp/` 下, 即 Reviewer 工作目录之内 (`reviewer-runtime.mjs` 要求写路径在 `<cwd>/.tmp` 内, `reviewer-round.mjs` 把规则副本放在轮目录), 所以对工作目录之内的状态目录不加 `none`, 否则会挡住规则副本. 只有能力测试实例的 `state` 目录在工作目录之外 (`lib/reviewer-capability-setup.mjs`).

`lib/reviewer-runtime/reviewer-native-policy.mjs` 的 `reviewerNativeSettings` 接收 `stateDirectory`, 它在工作目录之外时给文件系统策略加 `"none"` 条目; `reviewer-runtime.mjs` 的首次启动, 后续任务和冷恢复四处调用传入已有的 `stateDirectory` (冷恢复原先没有应用 `reviewerNativeSettings`, 一并补上). 长期规格 `docs/specs/agent-repository-workflow/spec.md` 的 Codex 读取范围一段和 ADR 0016 各加一句例外 (文档预计净增约 300 字符). 不挡 `/etc`, `/home` 等其他位置 (沙箱的可执行文件和系统库依赖它们, 父目录设 `none` 会连同工作目录一起隐藏, 已实测).

按 `source-checkout-reviewer-testing.md` 这是 Reviewer 运行时的沙箱改动, 做 Codex `gpt-6-luna` `xhigh` 的能力 A/B, 结果写进 `## Validation`. 体积预算: 非测试代码净增不超过 8 行, 文档不超过 400 字符.

预期验证: `pnpm test`; `pnpm typecheck`; `node scripts/check-workflow-distribution.mjs`; `node scripts/generate-install-arw.mjs --check`; `git diff --check`; 能力 A/B.

## Acceptance criteria

- [x] 状态目录在工作目录之外时, Reviewer 文件系统策略含该目录的 `"none"`; 在工作目录之内时不含 (测试: `reviewer-native-policy.test.mjs`, 去掉改动后失败).
- [x] 能力 A/B (Codex `gpt-6-luna` `xhigh`) 按 `reviewer-capability` Skill 的判定规则接受, 结果表和下界写在 `## Validation`.

## Blocked by

- None - can start immediately

## Validation

- 验收 1: `reviewer-native-policy.test.mjs` 新用例 "hides a state directory outside the working directory ..." (状态目录在工作目录外含 `none`, 在内不含); 去掉 `reviewer-native-policy.mjs` 的 `none` 行时失败.
- 验收 2: 能力 A/B, 场景 `requirements-reviewer/commit-audit`, Codex `gpt-6-luna` `xhigh`, 对照为 `dd7c2cc` 的安装, 候选为本改动的安装, 各自隔离 HOME 与守护进程, 同期运行; 第一阶段每组 3 个有效实例 (无作废), 同一批盲裁 (sol high, 两个池锚点一致率 1, 合成对照全对). 候选格的 Reviewer 策略实测含 `state` 的 `deny` 条目 (Codex 会话记录的 `file_system_sandbox_policy`), 对照格没有.

| 格 | n | 平均 ± SD | 95% 区间 | 各实例 final |
|---|---|---|---|---|
| 对照 (改前) | 3 | 0.705 ± 0.041 | 0.604 到 0.806 | 0.752, 0.682, 0.682 |
| 候选 (改后) | 3 | 0.750 ± 0.040 | 0.651 到 0.849 | 0.704, 0.774, 0.772 |

候选减对照 = +0.045 (SE 0.033, df 4.0, 95% 区间 -0.046 到 0.136, same-range, 范围 high/medium/low). 候选均值不低于对照, 按第一阶段规则接受, 不进第二阶段. 区间下界 -0.046 是本次不能排除的降幅 (n=3, 只测 commit-audit 一个场景: 改动对所有角色的实例同样生效, 按 `source-checkout-reviewer-testing.md` 运行时改动可只用一个场景). 耗时 (秒): 对照 581, 628, 922; 候选 913, 746, 754. Codex 版本: 第一阶段实例 0.169.0, 盲裁 0.170.0.
实测净增 (预算: 代码 8 行, 文档 400 字符):

```
code: +3 lines (files: 2)
  lib/reviewer-runtime/reviewer-native-policy.mjs +3
  lib/reviewer-runtime/reviewer-runtime.mjs 0
documents: +288 characters (files: 2)
  docs/adr/0016-use-repository-owned-agent-projection-configs.md +158
  docs/specs/agent-repository-workflow/spec.md +130
tests: +8 lines (files: 1)
  tests/reviewer-runtime/reviewer-native-policy.test.mjs +8
```

- `pnpm typecheck`, `pnpm test` (1039 个全部通过), `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `git diff --check`: 通过.

## Comments

- 提交审核第 1 轮: Code Standards 无问题; 要求符合审核 (首次因容量用尽重跑) 提出两条, 都核实有效: (1) 冷恢复 (`reviewer-runtime.mjs` 的恢复暂停任务) 直接用记录里的原始 settings 打开会话, 没有应用 `reviewerNativeSettings`, 已补 (同时补上了该路径原先缺的整套策略, 与后续任务路径一致); (2) 长期规格和 ADR 0016 写 Codex 读取不收紧, 已各加一句例外. 第 2 轮 Code Standards 指出 ADR Decision 概括 (第 23 行) 与新增例外相反, 已改为带例外的描述, 第 3 轮又指出 Consequences (第 72 行) 同样需要例外, 已补, 第 4 轮要求把该句的 "仓库外只由指令约束" 排除恢复记录目录, 已改. 能力 A/B 在这两处修改前完成: 冷恢复只在暂停任务时走, 能力实例无此路径, 不影响 A/B 对象.
- 范围 (本机工作方式): 不含设计决定, 单 effort 单实施 issue, Spec Readiness 按用户 2026-11-02 常设确认记录 `not-applicable`.
