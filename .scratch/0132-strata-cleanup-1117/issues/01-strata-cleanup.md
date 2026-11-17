# 清理 Strata 核实的重复, 死代码和文档文字问题 (无行为变化)

Status: ready-for-agent

## What to build

清理 effort, 合并 `ARW/daily` 11-17 核实的无行为变化清理和文档文字问题, 不含设计决定, 不写 spec (记 Spec Readiness `not-applicable`). 每项的最终状态是描述的重复/死代码/不一致消失, 行为不变, 现有测试全部通过; 对象行号以实施时 main 为准, 先 grep 核对, 某项已不存在则在 `## Comments` 记录跳过. 0131 已被 0135 取代, 不再有冲突问题.

### A. `lib/` 清理 (来自 strataweek3 的 23 条, 11-09 周, 全低)

- `installation.mjs` 242,312,326,556 与 `uninstallation.mjs` 136 的 `'config.json'` 和 510 与 `uninstallation.mjs` 99 的 `'manifest.json'` 改用 `config.mjs` 的 `CONFIG_FILE_NAME` 和 `installation-payload.mjs` 已有的 manifest 名常量.
- `installation.mjs` 12 处, `release.mjs` 3 处, `installation-contract.mjs` 3 处 `diagnostics.map(entry => entry.message).join(' ')` 改用 `common/diagnostics.mjs` 的 `diagnosticMessages`.
- `loadLocalSource` 三步分类重复 (162-206, 五处 `local-source-identity-invalid`) 合成一个局部助手.
- `installation.mjs:510` `manifest.json` 死碰撞项 (`inspectInstallation` 对非 missing 都已阻塞); `:551-554` `managedFiles` 与 `overwriteFiles` 传同一列表; `:581` 合取 `existing.managed && existingManifest !== null` 恒真; `assertSafeConfigurationTarget` (310-321) 对已验证路径的不可达抛错; `:612-619` 硬编码 `'arw'` 可执行目标 (改读 payload 的 launchers); 变更入参 `decisions.registerPath` (530, 545) 改为局部变量. 先逐项核对再删, 不确定的保留并记 Comments.
- `writeBoundary` 文字阶梯 (578-662) 与 `stage` 计数并存, 由计数推出文字; `runInstaller`/`runUninstaller` 的协议样板 (默认 stderr/stdout, `--help` 短路, 解析) 抽成一处.
- `workflow-lock.mjs`: `assertRecord` 合并到 `assertExactKeys`; 排序里 `kind`, `canonicalObjectId` 两个后备子句 (201, 204, 320-322; 路径已唯一) 删除; 289 行不可达的 `Expected lockSchemaVersion 1.` 删除; 无人引用的 `CURRENT_LOCK_SCHEMA_VERSION`, `normalizeWorkflowProfile` 去掉 `export`; `['claude-code', 'codex']` 两处内联 (61, 170) 合并为一个常量.
- `document-terms.mjs`: 449-474 重复发现 Git 根 (用调用方已规范化的根); 201/227 两处相同空白字符类合并; `agent-scope-policy-invalid` 与空策略字面量的残余重复合并.
- `text-policy.mjs` 的两条残余重复见 `.tasks/ARW/strataweek3-report-1116.md` 第 4 节末尾 (实施时在文件内查 `check-ignore` 与 `.arwignore` 校验的重复).
- `AGENTS.md:91` 的验证命令清单与 `docs/agents/source-checkout-validation.md:9-11` 重复, 改为引用; `AGENTS.md:14` 的超出预算路径对无 issue, 无 Commit Audit 的文档任务没有落点, 补一句落点 (如 "写入提交说明") .

### B. 其余核实的清理 (`.tasks/ARW/strata-review/triage/2026-11-17.jsonl`, category cleanup)
- `arch-bg`: NativePublicMessage / NativeSnapshot.publicMessages / NativeNotification … 修法: 删除 publicMessages/NativePublicMessage/'message' 通知及 manager 的清空 (估 -30行)
- `arch-common`: repository-state-inspector.mjs + git-content.mjs duplicate git ls-tree -r -z p… 修法: parseHeadTreeEntries 复用 git-content 的解析并参数化 commit 模式 (估 -15行)
- `arch-common`: file-transaction.mjs:10-12 and artifacts.mjs:49-51 hand-declare narrowed copies… 修法: file-transaction/artifacts 改用 filesystem.mjs 的共享 typedef 去掉强转 (估 -10行)
- `arch-common`: filesystem.mjs createDirectory (426-431), write (449-454) and remove (522-… 修法: create/write/remove 抽出共用的 root-relative 路径解析前置 (估 -20行)
- `arch-common`: generic Markdown line primitives are stranded in issue-documents.mjs and exporte… 修法: 把 findFrontmatterEnd 等行原语移入 markdown-fences 或 common 并改 import (估 0行)
- `arch-common`: the json.mjs path-helper trio (180-240) has almost no leverage -- deleteJsonPat… 修法: 删除无调用方的 deleteJsonPath 及其测试 (估 -25行)
- `arch-common`: json.mjs carries a byte-preserving configuration editor -- completeConfiguratio… 修法: 把配置字节编辑器移到 configuration 专属模块, 不改行为 (估 0行)
- `arch-common`: repository-state-inspector.mjs demands a value no side uses -- RepositoryFilesy… 修法: 去掉 RepositoryFilesystem 中无人读的 phase 参数 (估 -6行)
- `arch-common`: configuration-conversion.mjs:10 PATH_SEGMENT_PATTERN is declared and never ref… 修法: 删除未引用的 PATH_SEGMENT_PATTERN (估 -1行)
- `arch-common`: artifacts.mjs:549 uses file.mode.startsWith('100') while the shared isRegular… 修法: artifacts.mjs:549 改用 isRegularGitBlobMode (现状不可达, 仅一致性) (估 ~0行)
- `arch-common`: runtime-compatibility.mjs promises a value it never produces -- SupportedNodeRu… 修法: SupportedNodeRuntime 去掉恒为 null 的 recommendation 及 install/bootstrap 中的死分支 (估 -10行)
- `arch-workflow`: configurationParseDiagnostics is byte-identical in both modules (diff of distr… 修法: sync 直接 import distribution 的 configurationParseDiagnostics (估 -8行)
- `arch-workflow`: removalPreview (workflow.mjs:1490-1508) hardcodes the user-facing text: deleteW… 修法: removalPreview 文案改成按类别的查表, 未知类别报错 (估 ~±10行)
- `arch-workflow`: The parent-directory derivation is written twice with the same shape - ancestor… 修法: ancestors 与内联循环统一为 filesystem 的一个父目录助手 (估 -10行)
- `arch-gates`: Worth exploring — spec-readiness.mjs:434-448 reads rule bytes with raw readFi… 修法: spec-readiness.mjs:442 改用 readSafeRepositoryFile (估 ~0行)
- `arch-gates`: Worth exploring — document-terms-repository.mjs writes the regular-blob mode s… 修法: 两处 '100644','100755' 改用 isRegularGitBlobMode (估 -2行)
- `arch-gates`: Speculative — matchTerms calls termCandidates(globalPolicy.terms, localPolicy… 修法: termCandidates 的全局候选表提到 for 循环外 (估 ~0行)
- `arch-jira`: finding 2 — stage with no consumer. stage appears in nine modules in lib/… 修法: 删除无消费者的 stage 字段 (估 -10行)
- `arch-jira`: finding 3 — 25 hand-rendered diagnostic sites. All 25 cited lines are ...diag… 修法: 抽出共用的 diagnostics 输出助手, 统一前缀 (估 -40行)
- `arch-jira`: finding 4 — seven re-declared diagnostic records. All seven typedefs match the… 修法: 七个 diagnostic typedef 改用共享类型 (估 -10行)

### C. 文档文字 (category doc, 文字按 `--` 后的原发现核对)
- `spec-1`: docs/specs/agent-repository-workflow/spec.md:641,633,655,975 -- :633 states a ro… 修法: spec :641 的 .scratch 豁免改为同时适用于 map 内列出的根 CONTEXT.md, 或在 map 规则里说明 (估 ~200字)
- `spec-1`: docs/specs/agent-repository-workflow/spec.md:835 -- "适用的三个审核" conflicts with :51… 修法: 把 :835 的 "适用的三个审核" 改为 "适用的审核" (估 ~10字)
- `spec-1`: docs/specs/agent-repository-workflow/spec.md:941,943 -- rg -n 'ARW-DOC-006|ARW-… 修法: 补充 ARW-DOC-006/ARW-TEST-008 的归属说明, 或把区间改连续 (估 ~80字)
- `manuals-1`: docs/manuals/development.md:53 — "pnpm typecheck runs a strict check across al… 修法: development.md:53 改为 tsconfig 覆盖范围并说明排除 fixture (估 ~60字)
- `manuals-1`: docs/manuals/development.md:83 — node scripts/project-claude-skills.mjs --check… 修法: 删去 development.md:83 的单独 --check 命令或注明 pnpm test 已含 (估 -60字)
- `manuals-1`: docs/manuals/development.md:151 — the documented score invocation score scen… 修法: score 调用补 --repair path.changes.json|--no-repair 与 --agent (估 ~80字)
- `manuals-1`: docs/manuals/development.md:157 — describes scripts/release-vm.mjs as copying… 修法: release-vm 描述补 --archive 与 fixture, 指向 pack-release.mjs (估 ~80字)
- `manuals-1`: docs/manuals/development.md:206-214 — claims to list "the remaining top-level di… 修法: 目录列表补 .claude/(生成投影) 与 .codex/ (估 +100字)
- `manuals-1`: docs/manuals/development.md:13 (and docs/manuals/development.zh-CN.md:13) — "Thr… 修法: 改 "Three terms" 措辞为实际出现的术语, 或去掉 Spec Readiness/Commit Audit (估 ~100字)
- `manuals-1`: docs/manuals/development.md:7, :33, :165, :218 — the same "this manual is only a… 修法: 保留 :7 一处, 删 :33/:165/:218 的重复声明 (估 -300字)
- `manuals-1`: docs/manuals/development.md:198-202 — restates the lib/ one-way dependency hie… 修法: 删 :198-202 的依赖层次复述, 改链接到 development spec (估 -400字)

### D. 提交前文本检查提前 (来自 `ARW/daily` 1118 的 Issue Y, codex20q-1117 的 0135 运行)
`.agents/skills/commit/implementation-workflow.md` 步骤 2 "启动 Reviewer 前自查" 加一句: 对暂存候选先运行 `arw text check`, `arw terms check --include .scratch/<NNNN>-<effort-slug>/` 和 `git diff --check` (秒级, 退出 0 才 `prepare`); 作者改过授权 issue 或 effort 文件后, 重新 `prepare` 前再运行一遍. 不改审核关卡, 只把已在验证命令清单里的格式检查提前到 `prepare` 之前. 依据: 0135 运行中行内代码 `## Validation` 被误插入使一个反引号跨到 `## Comments`, 检查在 Reviewer 已启动后才跑, 受审版本已坏, 多开了第 3 轮 (约 5 分钟, 占全程 20%). 证据只有这一次 (n=1), 机制确定. 同步 `distribution/skills/commit/implementation-workflow.md` 和 `.claude/skills/commit/implementation-workflow.md` (后者用 `node scripts/project-claude-skills.mjs`, 前者按分发流程). 预计净增文档约 +200 字符; 不涉及 Reviewer 能力, 不需要能力 A/B.

预计净增: 代码约 -300 行 (非测试, 估计值, 实施时以 `git diff --numstat` 为准); 文档约 -400 字符 (含 D 的 +200); 测试只改被删对象的测试. 实施可分几个提交, 但仍是一个 issue.

预期验证: `pnpm test`, `pnpm typecheck`, `arw text check`, `arw terms check`, `git diff --check`, 完整 `pnpm test` 通过; 改了 `docs/manuals/development.md` 同步 `development.zh-CN.md`, 改了 Agent 规则文件后 `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`.

## Acceptance criteria

- [ ] A, B, C, D 各项已处理或在 `## Comments` 写明跳过原因 (观察: 逐项对照 `## What to build` 的列表).
- [ ] 公开 Interface, 持久状态和用户可见行为没有改动; `pnpm test` 与 `pnpm typecheck` 通过.
- [ ] 净增在预算内, 超出时在 `## Comments` 说明.

## Blocked by

- None - can start immediately

## Comments

- 来源: `~/projects/.tasks/ARW/daily-report-1117.md`; 逐条结论 `.tasks/ARW/strata-review/triage/2026-11-17.jsonl` 与 `2026-11-16.jsonl`.
- Spec Readiness 记 `not-applicable` (清理与文字修正, 无设计决定, 不依赖共用 spec; 依据 `~/projects/docs/ARW.md` "拆分工作时" 一条), 单独成 effort.
- 2026-11-18: 并入 D 项 (Issue Y, 提交前文本检查提前); 原因: `ARW/daily` 规则要求小 issue 合并, D 是无设计决定的文档改动. 草稿: `~/projects/.tasks/ARW/daily-1118-issue-draft.md`.
