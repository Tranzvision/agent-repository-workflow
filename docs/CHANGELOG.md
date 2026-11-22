# Changelog

[English](CHANGELOG.md) | [简体中文](CHANGELOG.zh-CN.md)

## Unreleased

- Configuration editing rejects JSON objects with duplicate member names, and a Code Map root in the workflow lock must be a canonical Repository-relative path (no trailing slash, drive prefix, or NUL). Document Terms counts a lone CR as a line break and recognizes headings indented by up to three spaces.
- Installer: reinstalling after the user deleted the Windows PATH value records the new ownership, the provider-migration notice appears only after the configuration is written, and `release-manifest.json` must name `config.install.json` as `configSeed`. Uninstaller: restores PATH with the value kind found at uninstall time, reports `partial` after removing only empty directories, reports the configuration as removed even if a later database removal fails, and tolerates a linked `config.json` when it is not asked to remove the configuration.
- Option values that are empty are rejected, Spec Readiness `prepare` input that cannot be read reports its parse error, and the post-init handoff escapes checklist text.
- Configuration rejects a non-object `background.providers`. The issue parser rejects a malformed `None` blocker line and an External dependency in a Wayfinder issue. Application Source Issues no longer count as implementation issues in Commit Audit, which also rejects a second effort directory with the same number and ignores symlinked rule files.
- Background Agent: a failed launch reports its spawn error immediately, `followup_task` validates its settings, a failed batched message marks every message it carried as unknown, one failed provider lease return no longer stops the others, native unload keeps a single deadline, loaded-thread discovery finds members listed before their parent, and a resume whose record path changed unsubscribes the loaded thread.
- Reviewer capability `inspect` checks tools, paths, and returned answer-key text in saved Antigravity CLI (`agy`) headless streams, including interrupted runs with usable evidence.
- `arw commit-audit prepare` warns when staged code changes leave Gate 1 empty, prompting you to check whether a finished issue's status update is missing from the candidate. The warning is advisory.
- Spec Readiness prechecks report line ranges that extend past the end of a file and skip path examples in fenced code blocks.
- Reviewer capability scoring checks evidence against real lines in the Spec Readiness subject and uses the production issue parser to find the subject boundaries. Answer key validation uses the same case weights as scoring.
- Interactive uninstall now reports unsupported platforms as an uninstallation error.
- Reviewer capability setup reports unreadable handoff files and leaves no recovery directory when the Reviewer role is unknown.
- Release VM checks reject a missing installation archive or an unreadable or invalid checkout package identity before touching the VM.
- Reviewer capability scoring reads bare evidence locators in finding text, including bracketed references. The Code Standards format baseline now includes the recovered locators from its archived reports. Commit Audit blind pools use distinct problem decisions for each Gate. To rescore earlier Commit Audit reports, regenerate the candidates and pools and adjudicate them again.
- Run the Reviewer capability suite from an ARW installation with a command-line model such as `agy`. The `reviewer-capability` command can check configuration, plan calls, resume a run with usage limits, and pack completed results with SHA-256 checksums.
- Independent Reviewers report only high- and medium-severity findings. Correctness, data loss, security, and concurrency defects are always at least medium severity. A review with no high- or medium-severity findings returns `No problems.` in its report.
