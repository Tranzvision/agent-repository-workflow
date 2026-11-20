# 从 ARW 安装运行命令行模型的 Reviewer 能力套件

Status: completed

## What to build

把便携运行器的检查, 计划, 实例运行和打包迁入 ARW. 用户安装 ARW 并配置自己的模型命令后, 可以从独立目录运行完整能力套件并生成结果包. 复用 ARW 的场景搭建, 报告修复和计分. 题目, 答案键, 分值和盲裁流程按现有定义使用. 结果包供独立导入方校验和导入. 预计非测试代码净增不超过 600 行.

## Acceptance criteria

- [x] 在没有源码检出的隔离安装目录和普通工作目录中, 用假 CLI 对四个场景执行 `check`, `plan`, `run` 和 `pack`. 验证普通检查和计划不启动模型, `check --call` 只启动一次, 不使用后台管理进程. 核对打包的场景内容与现有夹具一致, 并用现有评分入口核对输出.
- [x] 使用假 CLI 和受控耗时, 验证参数, 环境和提示词交付, 超时, 无报告, 泄漏标记和计分失败. 验证用量超限退出 `75`, `STOP`, 明确确认后续跑, 跳过已完成实例及不同配置续跑的拒绝.
- [x] 读回 `pack` 生成的归档, 核对版本, 出处, 实例路径和每个登记文件的 SHA-256. 验证篡改后的实例和混合出处被拒绝, 而且失败时不产生可误收的归档.
- [x] 英文产品文档给出可照抄的 `agy` 配置和命令, 说明隔离责任, 续跑和结果包格式. 更新英文变更日志并在交接中列明对应中文文档.

## Blocked by

- None - can start immediately

## Validation

- `node --test tests/reviewer-capability/cli.test.mjs tests/installation/installation.test.mjs tests/installation/installation-payload.test.mjs tests/installation/bootstrap.test.mjs`: 82 项通过. 在隔离安装中运行四个场景并逐场景重算对照. 假 CLI 覆盖提示词, 参数, 环境, 模板, 超时, 作废, 评分失败, 用量停止和中断. 归档测试核对成员及每个摘要, 拒绝篡改和混合出处, 并保留打包写入失败前的路径状态.
- 红测分别观察到入口未识别, 未执行模型探测, 未触发用量停止, 未实现归档, 及安装载荷缺少能力资源. 对应功能实现后通过.
- 审核修复的红测复现无 token 回报时超字节上限仍退出 `0`. 修复后验证退出 `75`, 续跑仍需确认, 且中断退出 `130`.
- `pnpm test`: 1052 项通过, 0 项失败. `pnpm typecheck` 通过. 每个变更的 `.mjs` 文件通过 `node --check`.
- `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0163-cli-model-provider/` 和 Git 空白检查通过.
- 英文操作文档在 `docs/manuals/development.md`, 入口在 `README.md`, 发布说明在 `docs/CHANGELOG.md`. 真实模型探测由运行方执行.

```text
code: +770 lines (files: 11)
  lib/arw-common/reviewer-capability-resources.mjs +44
  lib/arw.mjs +6
  lib/installation/installation-payload.mjs +32
  lib/reviewer-capability-cli.mjs +385
  lib/reviewer-capability-run.mjs -13
  lib/reviewer-capability-setup.mjs -4
  lib/reviewer-capability/bundle.mjs +102
  lib/reviewer-capability/command.mjs +156
  lib/reviewer-capability/operations.mjs +18
  release-manifest.json +27
  scripts/pack-release.mjs +17
documents: +10112 characters (files: 7)
  README.md +205
  docs/CHANGELOG.md +256
  docs/manuals/development.md +4572
  docs/specs/agent-repository-workflow-development/spec.md +348
  docs/specs/agent-repository-workflow-installation/spec.md +145
  docs/specs/agent-repository-workflow-release/spec.md +115
  docs/specs/agent-repository-workflow/spec.md +4471
tests: +289 lines (files: 4)
  tests/installation/bootstrap.test.mjs +68
  tests/installation/installation-payload.test.mjs +8
  tests/installation/installation.test.mjs +8
  tests/reviewer-capability/cli.test.mjs +205
next ADR number: 0041
```

## Comments

- 维护者选择将运行与打包置于 ARW, 导入与发布留给调用方. 主 Agent 根据任务授权拟定本 issue 和 effort spec. 安装分发的长期合同需要同步调整, 相关路径列于 effort spec 的 ADR Evaluation 节.
- Spec Readiness 首轮发现八处缺口. 已明确配置和列表语法, 运行记录出处, 包成员与默认位置, 写入失败结果, 以及权限选择理由和 ADR 判断. 更新后的版本进入增量复审.
- 第二轮保留三项缺口. 已规定 CLI 版本的包内一致性与导入核对, 补足两种目标初态的打包失败测试, 并记录跨机器结果包完整性与出处边界的 ADR 判断. 更新后的版本进入增量复审.
- 第三轮绑定报告为 `No problems.` 已提升就绪记录并在启动红测前通过完整 `verify`.
- Commit Audit 首次实施审核的 Code Standards 报告为 `No problems.` 要求符合审核发现无 token 回报时的用量保护缺口和缺少中断约定. `run` 现记录缺失 token 为 `null`, 并把字节超限持久化为用量停止. `check --call` 和版本查询共用进程限制及退出 `130` 的处理, 字节超限照常报告调用错误. 计分路径不读取用量字段. 已补充长期规范和英文手册.
- Commit Audit 增量复审的 Code Standards 和要求符合报告均为 `No problems.` 已抽查探测仍只调用一次, 超字节上限后没有完成实例, 并且停止标记阻止未确认的续跑.
- 非测试代码预计净增 600 行, 实际净增 770 行, 超出 170 行. 已合并源码与安装入口的 Git 出处及修复计分逻辑, 复用公共文件系统和 SHA-256. 保留版本与原始文件哈希核对, 整包发布事务, 模型进程组清理和落盘续跑, 这些行为没有可替换的现有组合.
