# 暂存代码但 Gate 1 为空时提示核对状态

Status: completed

## What to build

当 `arw commit-audit prepare` 从暂存候选派生的 `gate1` 为空且现有候选摘要分类中有代码路径时, 在标准错误输出一行独立提示, 提醒作者检查已完成的授权 issue 是否漏暂存 `Status:` 更新, 避免推迟 Gate 1 和 Gate 2. 提示先于现有体积摘要, 摘要字节保持不变. 以代码文件数判断, 因此净增为零或负数的改动也提示. 关卡范围, 审核请求, 标准输出和退出结果保持现有行为. `docs/CHANGELOG.md` 和英文用户文档记录提示.

预计净增: 代码约 6 行. 先在 `tests/commit-audit/cli.test.mjs` 通过 `prepare` 公开入口复现缺少提示, 再实现并运行定向与 Source Checkout 验证. 走正常提交审核.

## Acceptance criteria

- [x] 暂存代码的候选在 `gate1` 为空时成功准备审核, 标准错误在原样摘要之前恰有一行新提示, 标准输出仍只给轮目录, 轮内请求的 `gate1` 和 `gate2` 仍按原逻辑推导.
- [x] 只有测试和文档改动的候选, 以及至少一个授权 issue 进入终态的代码候选, 都没有新提示.
- [x] 英文变更日志和相关英文用户文档说明提示的触发条件及用途.

## Blocked by

- None - can start immediately

## Validation

- 先运行定向回归, 确认因缺少提示而失败. 分离提示前, 证明原实现未通过独立输出断言. 修正后 `node --test tests/commit-audit/cli.test.mjs` 通过 33 项. 同净行数代码修改检查退出码, 标准输出, 独立提示, 完整摘要及请求关卡, 耗时约 39 毫秒. 已有终态转换和仅测试及文档改动两种候选分别耗时约 38 与 39 毫秒, 均无新提示.
- `pnpm test` 在具备本机回环网络权限的环境通过 1064 项. `pnpm typecheck`, Workflow Distribution 生产检查, Claude Code Skill 投影检查, 安装引导脚本检查和三个 JavaScript 文件的语法检查均通过.
- 英文 README, Skill 手册和变更日志已更新, 说明触发条件和提示用途.

```text
code: +6 lines (files: 2)
  lib/arw.mjs +1
  lib/commit-audit/commit-audit.mjs +5
documents: +563 characters (files: 3)
  README.md +186
  docs/CHANGELOG.md +200
  docs/manuals/skills.md +177
tests: +22 lines (files: 1)
  tests/commit-audit/cli.test.mjs +22
next ADR number: 0041
```

## Comments

- 提示只组合现有 `gate1` 与候选代码文件计数, 按根 `AGENTS.md` 的 Source Checkout Baseline 例外处理. 中文用户文档的配套文字由维护者另行安排.
- 第 1 轮 Code Standards 无问题. 要求符合指出拼接警告违反长期规范的候选摘要字节约定. 修正覆盖直接调用准备函数的候选摘要与 CLI 输出, 独立提示先于原样摘要.
- 第 2 轮 Code Standards 与要求符合审核均通过, 报告均为 `No problems.`.
