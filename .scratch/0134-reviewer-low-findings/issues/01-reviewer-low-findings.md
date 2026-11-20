# Reviewer 报告只列高级和中级问题, 低级问题不报告

Status: completed

## What to build

将已补测的 `reviewlow` 候选 `8205010` 合入 `main`. 三个独立审核角色完成全部适用检查. 报告和中途通知只列高级和中级问题. 低级问题不写入任何文件, 无高级或中级问题时报告精确为 `No problems.`. 正确性, 数据丢失, 安全和并发缺陷至少评中级, 不确定时评中级. 分发副本与源规则保持一致, 相关英文读者文档和变更日志同步更新.

依据: Strata 的 717 条经人工分诊的发现中, 607 条为低级, 55 条已修复 (9%); 高级为 7/7, 中级为 26/79. 该数据来自整库扫描, 审核门的质量与耗时由下方独立补测判断. `low.txt` 是早期候选, 已在受测方案中取消.

预计净增: 文档约 1800 字符, 含分发副本. 预期验证: 复核既有能力 A/B, 运行源码仓库验证命令及非实施提交机械检查, 按 `commit` Skill 对审核规则和规范的变更进行一轮要求符合审核.

## Acceptance criteria

- [x] `docs/agents/reviewer.md` 的 Report 和 Communication and observation 节规定报告与中途通知只列高级和中级问题, 低级问题不写文件, 只有低级或无发现时报告精确为 `No problems.`. 正确性, 数据丢失, 安全及并发缺陷至少为中级, 分级拿不准时也为中级.
- [x] Spec Readiness 角色, 问题分流, 长期规范和分发副本与已补测的规则一致. 英文读者文档与变更日志说明报告范围.

## Blocked by

- None - can start immediately

## Validation

补测使用 Codex `gpt-6-luna` `xhigh`, 对照 `1857223`, 候选为对照加 `8205010`. 分数按高级和中级的报告范围交集计算. `capretest-report-1119.md` 的最终判定如下, 区间下界是本次仍无法排除的降幅.

| 场景 | 每组样本 | 候选减对照 | 95% 区间 | 判定 |
| --- | --- | --- | --- | --- |
| Spec Readiness | 10 | +0.093 | +0.009 到 +0.176 | 接受 |
| Code Spec | 10 | +0.014 | -0.045 到 +0.074 | 接受 |
| Commit Audit | 3 | +0.160 | -0.486 到 +0.805 | 接受 |
| Code Standards | 3 | +0.026 | -0.089 到 +0.142 | 接受 |

补测未见稳定提速. Spec Readiness 平均由 31.9 分钟升至 35.9 分钟, 慢约 12%. 候选在 Spec Readiness 和 Code Standards 场景仍报告部分低级问题, 范围外 `k` 均值分别为 1.09 和 1.19.

- `inspect` 的 awk 正则误报已由 `4ad3403` 修复, 当前 `tests/reviewer-capability/inspection.test.mjs` 对应回归通过.
- 空挂载点导致 `list_agents` 返回 `report-binding-invalid` 已由 `4ad3403` 修复, 当前 `tests/background-agent/host.test.mjs` 对应列表与卸载回归通过.
- `pnpm test` 在沙盒外通过全部 1046 项. `pnpm typecheck`, `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0134-reviewer-low-findings/` 和 `git diff --check` 均通过. 三份分发副本与源文件逐字节相同, 审核规则与受测候选一致.
- 文档净增 1538 字符, 含英文文档和分发副本, 未新增代码或测试.

## Comments

- Main Agent 按任务要求确认合入 `8205010` 中的审核规则与规范措辞. 该候选只改规则与 Markdown, 按 `implement` 和 `commit` Skill 的非实施流程提交. 能力补测沿用既有结果. 英文文档和变更日志的中文翻译交 Main 排队.
- 要求符合 Reviewer (`gpt-6-luna` `xhigh`) 完整返回一条问题. Commit Audit 设计理由沿用旧报告范围. 已核实并改为引用同一规范的 Reports and result authority 节, 提交门禁明确处理报告中的问题. 按非实施流程完成单轮审核与处置.
