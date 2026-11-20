# 产品版本推进到 0.5.5

Status: completed

## What to build

0.5.4 已发布并通过公开 Bootstrap 验证. 按 `release` Skill 第 5 节, 把根 `package.json` 的 `version` 从 `0.5.4` 推进到下一个开发版本 `0.5.5`, 运行 `node scripts/generate-install-arw.mjs`, 之后源码安装的 `-pre` 身份为 `0.5.5-pre`.

预估净增: 0 行 (一行替换).

## Acceptance criteria

- [x] 根 `package.json` 的 `version` 为 `0.5.5`, 其余内容不变.
- [x] `node scripts/generate-install-arw.mjs` 已运行, `--check` 通过.
- [x] 全量测试, 类型检查, 分发检查, `arw text check` 通过.

## Blocked by

- None - can start immediately

## Validation

- `node --test` (pnpm 在 WSL 不可用, 直接运行 package.json 的 test 脚本) 1045 通过 / 0 失败; `tsc --project tsconfig.json`, `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check` (即 `arw text check`), `git diff --check` 通过.
- `node scripts/generate-install-arw.mjs` 运行后 `scripts/install-arw.mjs` 没有变化.
- 净增: 代码 +1 / -1 (净 0).

```text
code: 0 lines (files: 1)
  package.json 0
documents: 0 characters (files: 0)
tests: 0 lines (files: 0)
```

## Comments

- 就绪记录为 `not-applicable` 例外 (无设计决定的单 issue, 用户 2026-11-02 在 projects AGENTS 中对此类 issue 的常设确认).
