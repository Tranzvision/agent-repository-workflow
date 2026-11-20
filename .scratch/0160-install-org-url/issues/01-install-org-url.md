# 安装脚本与发布校验配置里的仓库地址改为 Tranzvision 组织

Status: completed

## What to build

来源: ARW/orgmove (本机任务). 仓库已从 `pellorao/agent-repository-workflow` 转到 `Tranzvision/agent-repository-workflow`, 文档里的旧地址已在 9094857 改完. 剩下两处代码与配置里的旧地址: `release-validation.json` 的 `repositories.sourceCheckout.url` 和由它生成的 `scripts/install-arw.mjs` 内嵌的同一地址, 都改为 `https://github.com/Tranzvision/agent-repository-workflow.git`. 无设计决定 (机械地址替换, 单 effort 单 issue, 见 Comments), 不写 spec.

体积预算: 非测试代码净增 0 行 (两行原地替换).

预期验证: `node scripts/generate-install-arw.mjs --check` (install-arw.mjs 与 release-validation.json 一致); `npm test`; `npm run typecheck`; `node scripts/check-workflow-distribution.mjs`; `node scripts/project-claude-skills.mjs --check`; `node arw.mjs text check`; `git diff --check`; `git grep pellorao` 在 `.scratch/` 和 `LICENSE.txt` (版权行人名) 之外无结果.

## Acceptance criteria

- [x] `release-validation.json` 与 `scripts/install-arw.mjs` 中的 `sourceCheckout` 地址都是 `https://github.com/Tranzvision/agent-repository-workflow.git`, 且 `generate-install-arw.mjs --check` 通过.
- [x] `git grep pellorao -- . ':!.scratch' ':!LICENSE.txt'` 无结果.

## Blocked by

- None - can start immediately

## Validation

- `node scripts/generate-install-arw.mjs --check` 退出 0 (install-arw.mjs 与 release-validation.json 一致, 验收第 1 条); `git grep pellorao -- . ':!.scratch' ':!LICENSE.txt'` 无输出 (验收第 2 条); 两行替换前后 `git diff` 只有地址变化.
- `npm test` 1045 个测试全过 (本机 `pnpm` 坏了, 用 npm; 11-20 14:2x 机器负载约 13, 三次 6.46 s, 6.55 s, 6.51 s, 无新增测试, 前一次空闲时测得 4.4 s); `npm run typecheck`, `check-workflow-distribution`, `project-claude-skills --check`, `arw text check`, `arw terms check`, `git diff --check` 通过.
- 体积 (预算: 代码 0 行, 实际 0 行):

```
code: 0 lines (files: 2)
documents: 0 characters (files: 0)
tests: 0 lines (files: 0)
```

## Comments

- 范围 (本机工作方式): 不含需用户决定的设计, 单 effort 单实施 issue, Spec Readiness 按用户 2026-11-02 常设确认记录 `not-applicable`.
- 次序: 两处替换先于本 issue 文件写成 (ARW/orgmove 任务内先改, 提交前补建 issue 和例外记录); 文档部分已按非实施流程提交为 9094857.
