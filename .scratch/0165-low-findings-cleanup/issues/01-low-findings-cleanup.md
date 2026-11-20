# 清理已核实的低级发现

Status: completed

## What to build

优先处理安装配置的旧版提供方迁移, 交互式卸载的平台诊断, Reviewer 能力场景的构建失败, 以及发布虚拟机检查的版本读取和压缩包预检. 在同一个实施 issue 内清理两批发现中已核实的不可达分支, 重复逻辑和局部命名. 机械清理保持已支持输入的行为, 并保留对外部输入的有效校验. 需要设计决定或规则改动的发现留待后续处理.

预计净减 80 行非测试代码, 包含行为修复和同批机械清理.

## Acceptance criteria

- [x] 通过安装入口核对, 损坏的现有配置在读取旧版提供方设置前被拒绝, 已有提供方设置继续优先, 缺少设置时保留现有迁移行为.
- [x] 通过卸载入口核对, 在不受支持的平台上, 交互与非交互卸载均返回卸载诊断和失败退出状态.
- [x] 通过场景构建接口核对, 未知 Reviewer 角色失败时不留下场景目录或恢复状态目录, 缺失的可选交接文档可省略, 无法读取的交接文档使构建失败.
- [x] 通过以假虚拟机命令运行的发布检查入口核对, 无效的软件包身份可见, 缺失的压缩包路径在虚拟机操作前失败, 有效检查仍生成发布验证记录.
- [x] 核对每项机械清理的调用方, 通过现有测试验证受影响行为, 并同步描述改变行为的英文读者文档与变更日志.

## Blocked by

- None - can start immediately

## Validation

- 安装迁移和损坏配置的现有覆盖在改动前后通过, 见 `tests/installation/installation.test.mjs`. 现有配置转换先拒绝损坏的配置, 再进入提供方迁移.
- 在实现前复现 5 项回归. 实现后定向运行 `tests/installation/uninstallation.test.mjs`, `tests/reviewer-capability-setup.test.mjs` 和 `tests/release/release-vm.test.mjs`, 5 项通过, 单例最长约 35 毫秒. 发布检查使用假虚拟机命令, 临时 HOME 中的既有测试验证成功记录.
- 在临时 HOME 中运行 `pnpm test`, 1059 项通过. `pnpm typecheck` 和修改文件的 `node --check` 通过.
- `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check` 和 `node scripts/generate-install-arw.mjs --check` 通过.
- `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0165-low-findings-cleanup/`, `git diff --cached --check` 和 `git diff --check` 通过.

~~~text
code: -47 lines (files: 18)
  lib/application-jira/application-jira-cli.mjs -3
  lib/application-jira/jira-convergence-adapter.mjs 0
  lib/application-jira/submodule-coordination.mjs +3
  lib/arw-common/config.mjs -2
  lib/arw-common/issue-documents.mjs -5
  lib/arw.mjs 0
  lib/common/configuration-conversion.mjs 0
  lib/common/json.mjs 0
  lib/effect-log/effect-log.mjs +4
  lib/installation/installation-contract.mjs -29
  lib/installation/installation.mjs +5
  lib/installation/release.mjs 0
  lib/installation/uninstallation.mjs +1
  lib/repository-workflow/workflow.mjs -15
  lib/reviewer-capability-setup.mjs +1
  lib/reviewer-capability/evidence.mjs -17
  lib/reviewer-capability/scoring.mjs -2
  scripts/release-vm.mjs +12
documents: +708 characters (files: 2)
  docs/CHANGELOG.md +351
  docs/manuals/development.md +357
tests: +66 lines (files: 3)
  tests/installation/uninstallation.test.mjs +19
  tests/release/release-vm.test.mjs +19
  tests/reviewer-capability-setup.test.mjs +28
next ADR number: 0041
~~~

## Comments

- 预计净增 -80 行非测试代码, 实际净增 -47 行, 超出 33 行. 需要决定行为或规则的清理留待后续, 发布检查补充了路径和软件包身份的前置诊断.
- Commit Audit 的要求符合和 Code Standards Reviewer 均返回 `No problems.`. 回归抽查通过, 覆盖现有提供方保留, 损坏配置拒绝, 重复 Workflow 更新保持字节稳定和发布验证记录.
