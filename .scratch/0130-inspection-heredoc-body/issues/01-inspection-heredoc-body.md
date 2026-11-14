# Reviewer 能力测试的路径检查不再把 cat 写入文件的 heredoc 正文当作访问

Status: completed

## What to build

背景: `lib/reviewer-capability/inspection.mjs` 的 `inspect` 把每次调用的命令文本按空白和 shell 标点切词, 保留含 `/` 的词, 逐个按 `cwd` 解析成路径, 受审实例之外且存在 (或是实例的祖先目录) 的路径记为 `path` flag. Reviewer 用 `cat > <报告> <<EOF ... EOF` 写报告时, 命令文本含整份报告正文, 正文里独立的 ` / ` (除号, 分隔符) 被解析成根目录 `/`, 根目录包含实例, 于是判越界, 实例被作废 (ARW/v1-splitrun3 auditP1 两个实例, 约 6 个 Codex 5 小时窗口点). 同样影响 X/H 整审和 ARW 自身的 Reviewer 能力测试. Claude 一侧写报告用 `Write` 的 `content`, `readRecord` 已把 `content`, `new_string`, `old_string` 排除出被检查的文本; Codex 一侧的对应写入渠道是 heredoc 正文, 目前没有排除.

最终状态: 命令文本中 `cat > 文件 <<标记` (或 `>>`, `cat <<标记 > 文件`; 该行只有 `cat` 与重定向到文件 (目标不是 `&1`, `/dev/`, `/proc/` 一类流设备), 前面至多有 `bash -lc` 一类 shell 包装 (Claude `Bash` 的包装可带引号) 和 `cd 目录 &&`) 写入文件的 heredoc 正文 (`<<` 行之后到结束标记行之前) 不再参与路径检查, `<<` 行本身 (含写入目标) 和之后的其他命令照旧检查. 不排除的情形 (照旧检查): 标记行后还接管道, `;`, `&` 等其他命令 (如 `cat <<EOF | bash`); 由其他命令读取的 heredoc (如 `bash <<EOF`, `python - <<PY`, 命令名或参数里含 `cat` 字样的 `python3 scripts/cat.py <<PY`, 没有写入文件的 `cat <<EOF`, 嵌在命令替换里的 `bash -c "$(cat <<EOF ...`), 它们的正文是会被执行的代码; 标记未加引号, 或 shell 包装用了双引号 (外层 shell 先展开), 且正文含 `$(` 或反引号 (shell 会执行命令替换). 理由: 排除范围只限 Reviewer 自己写出的文本, 与 Claude `Write` 内容的处理对称; 只去掉独立的 `/` 词不行, 因为 `find / -name x`, `ls /` 中的 `/` 是真越界 (既有测试已守护), 词本身无法区分; 引号内文本 (如 `echo "a / b"`) 不在本次范围, 实测未出现.

预计净增: 代码 +6 行 (非测试); 测试约 +40 行; 规格 `docs/specs/agent-repository-workflow-development/spec.md` 的 `inspect` 规则补一句排除范围 (约 +200 字符).

预期验证: 在 `tests/reviewer-capability/inspection.test.mjs` 新增 mock 测试 (回调不超过 100 毫秒, 不起真进程): 正文含独立 ` / `, 存在于实例外的绝对路径和 `..` 的 `cat > 报告 <<'EOF'`, `cat >> 报告 <<EOF`, `cat <<-EOF > 报告` 三种写法, 以及 Claude 一侧的 `Bash` 同样三种写法, 都没有 flag (修复前以 `path:/` 失败); 同时这些情形仍有 flag: 写入目标在实例外 (`cat > ../x <<EOF`), 结束标记之后的命令读实例外路径, `bash <<EOF` 正文 `ls /`, `cat <<EOF | bash` 正文读实例外路径, 未加引号的正文含 `$(cat ../x)` 或反引号, 命令名或参数含 `cat` 字样的 heredoc, 没有重定向的 `cat <<EOF`, 嵌在命令替换里的 `cat <<EOF`, 重定向到 `&2` 或 `/dev/stdout` 的 `cat`; 带引号的 `bash -lc "cat > 报告 <<'EOF' ..."` 在 Claude 侧无 flag, 其正文含 `$(` 时有 flag. `pnpm typecheck`, `pnpm test`, `arw text check`, `arw terms check --include .scratch/0130-inspection-heredoc-body/`, `git diff --check`.

## Acceptance criteria

- [x] 新的无 flag 测试在修复前以 `path:/` flag 失败, 修复后通过.
- [x] 上述仍应有 flag 的各情形有测试, 修复后 flag 与预期一致; 既有测试 `calls that leave the instance, and tools outside the allow list, are flagged` 继续通过.
- [x] 公开 Interface 和持久状态没有改动; 规格 `inspect` 规则的路径检查句补写该排除和不排除的情形, 与实现一致; 测试回调耗时不超过 100 毫秒.

## Blocked by

- None - can start immediately

## Validation

```text
code: +2 lines (files: 1)
  lib/reviewer-capability/inspection.mjs +2
documents: +273 characters (files: 1)
  docs/specs/agent-repository-workflow-development/spec.md +273
tests: +41 lines (files: 1)
  tests/reviewer-capability/inspection.test.mjs +41
next ADR number: 0041
```

- 根因 (复现): 新测试 `a heredoc body that cat writes to a file is the Reviewer own writing, not a path access` 在修复前得到 `path` flag, `match` 为 `/` (正文里的 ` / `) 和正文里实例外的绝对路径; 修复后通过 (5 毫秒). 第二个新测试 (仍应有 flag 的十一种情形) 修复前后都通过, 守护修复不放过真越界.
- 在 `HOME`, `TMPDIR` 为 `/tmp/ARW/inspslash/` 下的目录时 `pnpm typecheck` 通过, 完整 `pnpm test` 970 项全部通过 (3.0 秒). `arw text check`, `arw terms check --include .scratch/0130-inspection-heredoc-body/`, `git diff --check` 通过.

## Comments

- Spec Readiness 记 `not-applicable`: 修复测试检查器的误报, 不改变 Reviewer 能力测试的行为合同 (规格已要求越界读写被报告, 本修复只把检查对象限定为命令而非 Reviewer 自己写出的文本), 不新增规则, 不改公开 Interface 和持久状态, 按 `~/projects/docs/ARW.md` 单独成 effort, 不写 spec.
- 体积: 代码预计 +6 行, 实际 +2 行 (一个正则替换函数和一处调用); 测试预计约 +40 行, 实际 +41 行; 规格预计约 +200 字符, 实际 +273.
- 提交审核第 1 轮 (首版 `\bcat\b` 匹配加可选重定向): 代码标准指出命令名或参数含 `cat` 字样 (`python3 scripts/cat.py <<PY`) 的 heredoc 正文被误排除, 成立; 要求符合审核指出 (1) 规格 `inspect` 规则句写明 `/` 词一律标记, 实现已不符, 成立, 规格补写排除范围, issue 的 "不改规格" 相应改写并重生成例外记录; (2) 没有重定向的 `cat <<EOF` 被排除得过宽, 成立; (3) 嵌在命令替换里的 `bash -c "$(cat <<EOF`, 成立; (4) Claude 侧只测了三种写法之一, 成立. 修复: 正则只接受行首 (或 shell 包装与 `cd 目录 &&` 之后) 的 `cat`, 且该行必须有重定向, 补测试.
- 提交审核第 2 轮: 代码标准 `No problems.`; 要求符合审核指出 (1) 重定向目标 `&1`, `&2`, `/dev/stdout` 不是文件却被当作写文件 (可借多行 `$(` 被外层命令执行), 成立, 目标改为排除这些流设备; (2) Claude `Bash` 带引号的 shell 包装 (`bash -lc "cat > 报告 <<'EOF' ..."`) 未被识别, 成立, 包装后允许开引号, 结束标记行允许闭引号. 测试补相应情形.
- 提交审核第 3 轮: 代码标准指出 `/dev/`, `/proc/` 的否定前瞻分支没有被测试守护 (原用例 `>/dev/stdout` 无空格, 本就不匹配), 且 `writers.slice(0, 3)` 的含义不明, 成立; 要求符合审核指出双引号包装时内层加引号的标记也会被外层 shell 展开 `$(...)`, 与本 issue 的预期验证冲突, 成立. 修复: 包装用双引号时与未加引号同样保留含 `$(` 或反引号的正文; 测试补带空格的 `> /dev/stdout`, `> /proc/self/fd/1`, 多行 `eval "$(` 形式, 双引号包装 `$(ls /)`, 并经变异检查 (去掉流设备前瞻, 去掉双引号包装条件) 都使测试失败; Codex 与 Claude 的写法拆开 (`quoted` 只测 Claude 侧, 注释写明理由).
- 提交审核第 4 轮: 代码标准 `No problems.`; 要求符合审核只指出标记之后的流设备目标 (`cat <<EOF > /dev/stdout`, `cat <<EOF >&2`) 没有测试. 行为本身正确 (手工验证这四种写法的正文都保留, `cat <<EOF > r.json` 的正文被排除), 属于测试覆盖缺口, 不是行为缺陷, 已是第 3 轮之后.
- 台账: `tests/reviewer-capability/inspection.test.mjs` 的流设备用例 (标记之后的 `> /dev/stdout`, `>&2` 写法) 记录不修 同一否定前瞻在标记之前的位置已有用例和变异检查守护, 标记之后的位置行为已手工核对, 第 3 轮之后不为测试覆盖开修复轮.
