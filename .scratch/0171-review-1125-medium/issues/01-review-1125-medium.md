# 修正 11-25 全量重审的 10 项中级发现

Status: completed

## What to build

按当前代码逐项处理 11-25 全量重审 (`9c6255c`) 的 10 项中级发现 (A-1 到 E-2).

- 已修: `command.mjs` 的模型命令退出后 1 秒内仍未关闭管道 (后台孙进程) 时杀进程组并结算, 不再记成 timeout. `reviewer-capability-run.mjs` 顺序比较安装文件与检出文件, 不再在 `ulimit -n` 1024 下 EMFILE. `--work` 在 ARW 检出内时参数错误. `pool.mjs` 的证据行区间改为按闭区间相交比较, 不再逐行展开. `arw-background-agent-host.mjs` 的 `followup_task` 无新设置时按已保存运行的设置判断是否检查 `CODEX_HOME`. `submodule-git-adapter.mjs` 的 `switchBranch`, `fastForward`, `restore`, `compareRemote` 在 Git 状态观察失败时返回 `failed` 而不抛错, 协调器把状态读不到的模块也一并恢复.
- 已修 (spec): 主 spec 补 `reviewer-capability` 公开命令, 并写明提交审核的规则副本只复制相关嵌套 `AGENTS.md`; 安装 spec 写明 `configSeed` 必须是 `config.install.json`; Jira spec 的 README 责任句改为指向读者文档规范.
- 不测: C-2 (`followup_task` 的 Claude 设置分支) 没有 Claude 运行夹具, 未加测试.

预计净增 +12 行 (实际见 Comments)非测试代码.

## Acceptance criteria

- [x] A-1, A-3, B-1, D-2 有先失败后通过的定向测试, 其余已修项按上文记录.
- [x] 英文与中文变更日志已更新.
- [x] 完整测试与类型检查通过, 新增测试回调不超过 100 毫秒 (A-1 的真实进程用例等待 1 秒宽限, 已在用例注释说明).

## Blocked by

- None - can start immediately

## Validation

- `pnpm test` 通过 1123 项, `pnpm typecheck` 通过. 先失败后通过的定向测试: 命令孙进程 (`command.test.mjs`), `--work` 在检出内, 证据区间, 状态读不到的 Jira 模块恢复, 适配器状态观察失败. 整套约 5.4 到 8 秒 (本次之前已超 5 秒目标). A-1 的真实进程用例等待 1 秒宽限, 已在用例注释说明.

```text
code: +28 lines (files: 7)
documents: +1166 characters (files: 5)
tests: +54 lines (files: 5)
```

## Comments

- 台账: `lib/reviewer-capability/pool.mjs` 的 `lineEnd: null` 被 `??` 当作缺省 记录不修 显式 null 端点不是本工具产生的定位, 属假设输入, 本次只处理极大, 小数, 0 和负数端点.
- 台账: `lib/application-jira/submodule-git-adapter.mjs` 的 `fastForward` 状态读不到时返回 failed 加空状态 记录不修 改前这里直接抛错且不产生任何报告, 现在至少给出失败诊断, 协调器不记录 fast-forward effect 的缺口属于既有结果处理, 不是本次引入.
- 台账: `lib/application-jira/submodule-git-adapter.mjs:79-131` 三个 mutation 方法的结果映射重复 记录不修 抽共用函数会多于净省的行数, 且 restore 另有命令序列.

- 净增超出: 预计 +12 行非测试代码, 实际 +28. 原因: Jira 适配器四处兜底与哨兵状态, 协调器恢复未读到状态的模块, 命令退出宽限计时.
- 台账: `lib/reviewer-capability-cli.mjs` 的 `--work` 检出限制 记录不修 只比较词法路径, 符号链接绕过需要用户有意构造, 防止的是模型输出带自己 cwd 的误判泄漏, 不是对抗场景; 加规范路径会多一次文件系统调用.
- 台账: C-2 `followup_task` 的 Claude 设置分支 记录不修 没有 Claude 运行夹具, 无法加不依赖外部的测试.
