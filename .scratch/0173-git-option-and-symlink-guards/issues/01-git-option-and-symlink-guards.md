# Git 参数终止符与符号链接入口守卫

Status: ready-for-agent

## What to build

修正两处已复现的缺陷, 均无设计决定. 来源: 11-26 每日审查 (`ARW/ocreview`) 台账 1094 与 1097 (中级), 11-27 在 HEAD `5befddc` 读码核对并运行复现.

- `lib/application-jira/submodule-git-adapter.mjs` 的 `fetch` (53 行), `fastForward` 与 `switchBranch` (约 81 行与 110-112 行) 把配置里的 remote 与分支名直接放进 git 参数, 前面没有 `--`. `application.submoduleRemote` 只校验为字符串 (`lib/arw-common/repository-configuration.mjs:113`), 形如 `--upload-pack=<命令>` 的值会让 `git fetch` 执行该命令 (复现: `git fetch --no-tags '--upload-pack=touch <文件>' main` 创建了文件); 以 `--` 开头的分支名 (如 `refs/heads/--detach`) 会被 `git switch` 当作选项. 做法: 在这些 git 调用里的用户可控参数前加 `--` (`git fetch --no-tags -- <remote> <branch>`, `git switch -- <branch>`, 已在 git 2.53 验证 `git switch -- --detach` 切到同名分支); 对 `merge --ff-only` 与 `switch --track -c <新分支> <起点>` 的起点同样处理, 无法加 `--` 的位置 (`merge` 的 commit 参数) 改用 `--end-of-options` 或在配置边界拒绝以 `-` 开头的 remote 与分支名, 取更少行数者.
- `lib/arw-background-agent-host.mjs:279` 的入口守卫比较 `resolve(process.argv[1])` 与 `fileURLToPath(import.meta.url)`; Node 对主模块解析符号链接, 经符号链接启动 (如 `HOME` 或安装目录是符号链接) 时两者不等, 守护进程块不执行, 进程静默退出 (复现: 同样写法的脚本经符号链接运行输出 `false`, 直接运行输出 `true`). 做法: 比较前对 `process.argv[1]` 取 `realpathSync`.

不在本 issue 内: 台账同批其他中级项 (inspection 符号链接包含检查, `reviewer-capability-run.mjs` 的写入经符号链接, 三处 Skill 文字), 见 `~/projects/.tasks/ARW/daily-report-1127.md`. 每处先写失败的定向测试再修. 只更新描述该行为的英文读者文档与变更日志 (若有).

预计净增 +6 行非测试代码.

## Acceptance criteria

- [ ] 每处有先失败后通过的定向测试 (option 形 remote 与分支名不被当作选项; 经符号链接启动的守护进程入口执行), 既有测试不变.
- [ ] 完整测试与类型检查通过, 新增测试回调不超过 100 毫秒.
- [ ] 英文与中文变更日志已更新 (若该行为在读者文档中有描述, 一并更新).

## Blocked by

- None - can start immediately

## Validation

(实施后填写)

## Comments

- 来源与核对: `~/projects/.tasks/ARW/oc-review/triage/2026-11-26.jsonl` 第 1, 2, 3, 4 条, `~/projects/.tasks/ARW/daily-report-1127.md`.
