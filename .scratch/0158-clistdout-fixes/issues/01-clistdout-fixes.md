# 能力套件和 Reviewer 运行时的四处缺陷 (大输出截断, inspect 误报, 完成的 Reviewer 不卸载, 报告目录空挂载点)

Status: completed

## What to build

来源: ARW/clistdout (v1-speedab 与 capretest 交回的缺陷, 按本机规则合成一个 issue). 无设计决定, 不写 spec. 每条缺陷先复现并写失败测试再修.

1. 机器入口 `scripts/reviewer-capability.mjs` 先 `process.stdout.write` 紧接着 `process.exit`. stdout 是管道时写入是异步的, 结果超过 64 KB 时被截断 (复现: node 24, 管道只收到 65536 字节). 改为写入完成的回调里再退出. 仓库里其他 `process.exit` 只用于小输出的用法错误, 其余入口用 `process.exitCode`, 不改.
2. `inspect` 把 awk 的匹配运算符 `~` (`$0 ~ /x/`) 当成主目录读取, 把 `/[0-9]+/`, `/.*x/` 这类 `/正则/` 字面量 (截去通配符后只剩 `/`) 当成根目录读取. 去掉紧跟 `$变量` 或 `)` 的 `~` 和后接 `/` 的 `~`, (含紧凑写法 `($0)~/x/`; 其余 `~` 如 `ls ~ /etc` 仍是主目录), 并跳过只含一段且含正则专用字符 (`.` 后非字符, `[]()+|^$\?`) 的 `/.../` 词; `ls ~`, `ls /*`, `ls /[a-z]*` 仍报告.
3. 已完成的 Reviewer 一直占着 provider 名额, 另有闲置 Reviewer 的 `unload_agent` 被拒 `not safely idle`. 复现结论: `run` 不调用 `unload_agent` 是长期规格写明的契约 (由 Main 或驱动在保存 `agent.json` 后卸载, capretest 驱动就是这样做的), 不是缺陷, 不改 `run`; 名额没释放的原因是第 4 条: 卸载被拒, 驱动容忍后名额留住. 本条不另改代码.
4. 沙箱被杀时在可写根 (报告目录) 里留下空的 `.agents` `.aws` `.codex` `.git` 挂载点目录 (Codex 0.170 `codex sandbox` 加 `kill -9` 复现). `checkReportBinding` 因此对 `list_agents` 报 `report-binding-invalid`, 且同一个 Reviewer 的 `unload_agent` 被拒 `not safely idle` (宿主测试复现: 同一个空 `.git` 目录同时造成两者). 列表时容忍这四个名字的空目录; 有内容的或其他名字的仍拒绝.

体积预算: 非测试代码净增不超过 25 行 (实际 18 行).

预期验证: `pnpm test` 三次中位数 <= 5 s, 新增用例各 <= 100 ms; `pnpm typecheck`; `node scripts/check-workflow-distribution.mjs`; `node scripts/project-claude-skills.mjs --check`; `node scripts/generate-install-arw.mjs --check`; `node arw.mjs text check`; `git diff --check`.

## Acceptance criteria

- [x] 机器入口输出 300000 字符的 JSON 经管道完整到达 (测试: `tests/reviewer-capability/export.test.mjs`, 真进程一次).
- [x] 正例 (不报): `awk '{if ($0 ~ /A b/ || $1 !~ /A room/) print}'`, `awk '/[0-9]+/ {print}'`, `awk '$0 ~ /.*x/ ...'`, `grep -E '/[a-z]+/'`, `awk -v name=a 'name ~ /^a/'`, `grep -E '/./'`, `awk '($0)~/.?/'`; 反例 (仍报): `ls ~`, `ls /*`, `ls /[a-z]*`, `cat src/a.mjs ~`, `ls ~ /etc` (测试: `tests/reviewer-capability/inspection.test.mjs`).
- [x] 报告目录里四个名字的空目录不使 `list_agents` 失败, 且 Reviewer 可卸载; `.git` 里有文件时仍报 `report-binding-invalid` (测试: `tests/background-agent/host.test.mjs`).

## Blocked by

- None - can start immediately

## Validation

- 复现 (失败测试先行, 修复后转绿): 1) node 24 脚本 `process.stdout.write(2 MB); process.exit(0)` 经管道只收到 65536 字节, 写文件完整; `export` 机器入口输出 300000 字符 JSON 的测试截断在 146176 处解析失败. 2) `inspect` 对 `awk '{if ($0 ~ /A b/ ...)}'` 报 `/home/pello`, 对 `/[0-9]+/`, `/.*x/`, `grep -E '/[a-z]+/'` 报 `/`. 3) 未改: 规格写明 `run` 不卸载, 名额问题来自 4). 4) 真实 `codex sandbox` (0.170, 报告目录可写根) 正常退出后目录干净, `kill -9` 后留下空的 `.agents` `.aws` `.codex` `.git`; 宿主测试里一个空 `.git` 使 `list_agents` 报 `report-binding-invalid`, 同一个 Reviewer 的 `unload_agent` 报 `not safely idle` (同根因, 修后两者都正常).
- `pnpm test` 1044 项, 三次耗时 3.58 s, 3.59 s, 3.58 s (中位数 <= 5 s), 新增用例 4 ms 到 54 ms (真进程一个: export 大输出); `pnpm typecheck`, `check-workflow-distribution`, `project-claude-skills --check`, `generate-install-arw --check`, `arw text check`, `git diff --check` 通过.
- 体积 (预算: 代码 25 行):

```
code: +18 lines (files: 3)
documents: 0 characters (files: 0)
tests: +47 lines (files: 3)
```

## Comments

- 范围 (本机工作方式): 不含设计决定, 单 effort 单实施 issue, Spec Readiness 按用户 2026-11-02 常设确认记录 `not-applicable`.
- 次序: 代码与失败测试先于本 issue 文件写成 (worker 在已授权的 ARW/clistdout 任务内, 先复现后修, 提交前补建 issue 和例外记录).
- 评审 (第 3 轮, 隔离实例的 luna xhigh): 要求审核提出 `run` 新增 `unload_agent` 与长期规格 "run 不调用 unload_agent" 矛盾, 核对属实, 撤回该改动 (见 What to build 第 3 条); 另两条 inspect 过度过滤 (`ls ~ /etc` 丢失主目录, `/./` 与 `($0)~/.?/` 漏识别) 属实, 已收紧并加反例.
- 台账: `lib/reviewer-capability/inspection.mjs` 的 `REGEX_LITERAL` 与 `MATCH_OPERATOR` 对所有命令生效, 不限定 awk 或 grep 参数位置 (code-standards 第 5 轮), 记录不修: 区分参数位置需要解析 shell 与 awk 语法, 违背效率原则第 3 和 5 条; 现有取舍是只跳过 "一段, 含正则专用字符, 前后各一个斜杠" 的词和 awk 命令里的单独 `~`, 漏报只限 `ls ~ /./`, `ls /./` 或真实存在的 `/[a-z]+/` 目录这类现实中不会出现的写法; `ls ~`, `ls ~ /etc`, `ls /*`, `ls /[a-z]*` 仍报告 (测试已覆盖).
- 第 8 和 11 轮指出 awk 实参里的命令替换内层 `ls ~` 被漏报: 已修 (含 `$(` 或反引号的片段不做 awk 运算符去除), 测试覆盖.
- 台账: `lib/reviewer-capability/inspection.mjs` `withoutMatchOperators` 对含 `$(` 或反引号的 awk 片段不去除匹配运算符 (code-standards 第 12 轮, 例 `awk 'FILENAME ~ "x"' "$(printf src/a.mjs)"` 会误报主目录), 记录不修: 该检查管越界读取, 宁可误报不漏报, 误报只多一次人工确认, 漏报会真读到主目录; 区分需要完整解析 shell 与 awk, 违背效率原则第 3 和 5 条 (用户 2026-11-20 经 Main 确认).
- 台账: requirements 第 12 轮意见与第 11 轮一字不差, 仍写 "removes the nested `~`" 并称 "The new matcher admits quoted spans", 对应第 11 轮之前的代码; 当前树含 `$(`/反引号的片段已不去除运算符且有测试 (`awk '{print}' "$(ls ~ /etc)"` 仍报主目录), 基于旧状态, 不采信.
