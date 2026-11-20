# Changelog

## Unreleased

- Reviewer capability scoring reads bare evidence locators in finding text, including bracketed references. The Code Standards format baseline now includes the recovered locators from its archived reports. Commit Audit blind pools use distinct problem decisions for each Gate. To rescore earlier Commit Audit reports, regenerate the candidates and pools and adjudicate them again.
- Run the Reviewer capability suite from an ARW installation with a command-line model such as `agy`. The `reviewer-capability` command can check configuration, plan calls, resume a run with usage limits, and pack completed results with SHA-256 checksums.
- Independent Reviewers report only high- and medium-severity findings. Correctness, data loss, security, and concurrency defects are always at least medium severity. A review with no high- or medium-severity findings returns `No problems.` in its report.
