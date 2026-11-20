# Changelog

## Unreleased

- Run the Reviewer capability suite from an ARW installation with a command-line model such as `agy`. The `reviewer-capability` command can check configuration, plan calls, resume a run with usage limits, and pack completed results with SHA-256 checksums.
- Independent Reviewers report only high- and medium-severity findings. Correctness, data loss, security, and concurrency defects are always at least medium severity. A review with no high- or medium-severity findings returns `No problems.` in its report.
