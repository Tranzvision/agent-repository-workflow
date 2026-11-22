# 修正 11-23 每日审查确认的低级发现

Status: completed

## What to build

按当前代码逐项处理 11-23 分诊的 14 条低级发现 (台账 970-983, 草稿见 `.tasks/ARW/daily-report-1123.md` 第 1 节). 行为类先有失败测试再修.

- 已修: `json.mjs` 的配置编辑 (`completeConfigurationBytes`, `removeConfigurationMembers`) 遇到重复成员名直接报错. `workflow-lock.mjs` 的 Code Map root 改用 `assertSafePath`, 并拒绝通配符, 盘符前缀和 NUL. `document-terms.mjs` 把单独的 `\r` 算作换行, 标题识别接受至多三个空格的缩进.
- 已修: `installation-contract.mjs` 的 `addOwnership` 用新观察的记录替换旧记录, 卸载按当前观察到的 Registry 值类型回写 PATH, `assertSafeManagedPaths` 不再重复校验内部入参. `installation-payload.mjs` 删除不可达的第二次 distributionRoot 解析, 并要求 manifest 的 `configSeed` 为 `config.install.json`. `installation.mjs` 把提供方迁移提示推迟到配置事务成功之后.
- 已修: `uninstallation.mjs` 用目录清理的返回值更新 `mutationStarted`, 在配置文件移除后立刻更新 `configurationResult`, 不移除配置时容忍作为链接的 `config.json`.
- 不改: `installation.mjs` 与 `release.mjs` 的 package 观察重复 (两处的诊断码, 状态和错误分类不同, 合并成一个 loader 要改输出, 不是行为保持重构; 收益只是少一段重复, 留待有第三处使用时再合). `removeEmptyManagedDirectories` 在抛错前已删除的目录仍不计入 `mutationStarted` (需要改该函数的错误形态, 本次只处理返回值被丢弃的情形). 标题结构的 Setext 部分: `markdown-visible-text.mjs` 不识别 Setext, 两处文法一致, 无法复现; 只修缩进 ATX 标题的不一致.

预计净增 0 行非测试代码 (实际约 -13).

## Acceptance criteria

- [x] 每个已修项有先失败后通过的定向测试 (纯删除不可达分支和内部入参校验除外), 未修项记录原因.
- [x] 英文与中文变更日志已更新.
- [x] 完整测试与类型检查通过, 新增测试回调不超过 100 毫秒.

## Blocked by

- None - can start immediately

## Validation

- `pnpm test` 通过 1094 项, `pnpm typecheck` 通过. 新增回调均在几毫秒内; 整套约 6.1 秒 (本次之前已超过 5 秒目标, 未因本次改变).

```text
code: -13 lines (files: 7)
documents: +1212 characters (files: 2)
  docs/CHANGELOG.md, docs/CHANGELOG.zh-CN.md
tests: +168 lines (files: 6)
```
