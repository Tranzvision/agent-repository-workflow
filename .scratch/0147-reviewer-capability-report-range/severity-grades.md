# 答案键严重度评级结果

本文件是 `spec.md` 严重度节所述评级的结果, 实施时原样写入答案键.

一个独立 Agent (Claude `opus`, 未看过任何报告, 分数或检出率) 只凭 spec 的级别定义, 场景文件和每题的 `expectation` 评级. 题号为 `<场景>:<scope 序号>:<问题题序号>` (从 0 起, 按答案键声明顺序); 配对两题同级同理由. 新题 `code-standards:0:28` 由作者评级. 评级后, 级别定义的正确性地板在就绪审核中澄清为 "当前代码已存在的缺陷" (将来漏改才出错的重复按现状评级); 评级理由都按现状判断, 与澄清后的定义一致, 没有改级.

| 题号 | 严重度 | 理由 |
|---|---|---|
| `code-standards:0:0` | `low` | The default export of advanceOrder breaks the named-export convention but changes no behaviour. |
| `code-standards:0:1` | `medium` | vendorNotice stamps sentAt from the real clock instead of the injected now, so the notice time diverges from the service instant under any injected clock. |
| `code-standards:0:2` | `low` | Importing node:crypto in a rule module breaks the module-layer import rule, but the deterministic hash changes no behaviour. |
| `code-standards:0:3` | `low` | The catch in loadMenu keeps the cause and menuFor wraps again, so the rule-4.1 breach only adds a redundant error layer without changing behaviour. |
| `code-standards:0:4` | `medium` | cancelOrder reads the clock twice, so canceledAt and the cancellation-fee instant can disagree at the cutoff boundary, and a rule module takes a now function. |
| `code-standards:0:5` | `medium` | upcomingOrders reads the clock once per order, so orders in one call are compared against different instants and the result can be inconsistent at the boundary. |
| `code-standards:0:6` | `high` | postponeOrder mutates the stored record before validating, so a rejected postponement still leaves the stored order with the new deliverAt and postponedAt. |
| `code-standards:0:7` | `medium` | The catering service depends on another feature's service module and passes it its store, a cross-feature service coupling the import rules forbid although a rule-module alternative exists. |
| `code-standards:0:8` | `high` | A failed save resolves with undefined instead of rejecting, so callers treat a rejected duplicate-request-key write as success and notify with an undefined record. |
| `code-standards:0:9` | `low` | DIETARY_TAGS is exported unfrozen, a freeze-convention breach that no current code exploits to change behaviour. |
| `code-standards:0:10` | `medium` | The replacement error drops the notifier error as its cause, so the original failure is lost to callers and diagnostics. |
| `code-standards:0:11` | `medium` | kitchenManifests sorts the caller's orders array in place, so any caller passing its own array has its data reordered. |
| `code-standards:0:12` | `high` | addLine pushes into the caller's (and stored record's) lines array before validation, so even a rejected line stays in the original order. |
| `code-standards:0:13` | `low` | Implementing the store as a class instead of a factory closure is a style deviation with no behavioural effect. |
| `code-standards:0:14` | `low` | findMenuItem is a pure forwarding wrapper that adds an extra name without changing behaviour. |
| `code-standards:0:15` | `low` | catering-time.mjs is a forwarding re-export module that only adds an indirection without changing behaviour. |
| `code-standards:0:16` | `low` | kitchenFor duplicates the vendorFor rule and currently yields the same vendor, so it is a duplication to merge with no present behaviour change. |
| `code-standards:0:17` | `low` | The hard-coded 14-day term restates PAYMENT_TERMS and currently matches it, so it is a duplication to derive with no present behaviour change. |
| `code-standards:0:18` | `low` | The private share helper duplicates roundedTax with equal results for these amounts, a duplication with no behaviour change. |
| `code-standards:0:19` | `low` | listOrders re-implements pageOf with the same result, a duplication with no behaviour change. |
| `code-standards:0:20` | `low` | The inline suspension test duplicates isSuspended with the same result, a duplication with no behaviour change. |
| `code-standards:0:21` | `low` | fitsReservation recomputes the access window with literals equal to accessWindow's settings, a duplication with no present behaviour change. |
| `code-standards:0:22` | `low` | deskDeliveries writes out the same delivery-window selection as kitchenManifests, a duplication with no behaviour change. |
| `code-standards:0:23` | `low` | Course facts are kept in three tables that currently agree, a duplication that changes no present behaviour though they must be edited together. |
| `code-standards:0:24` | `low` | deliveredNotice re-sums servings instead of calling servingsOf, a duplication with no behaviour change. |
| `code-standards:0:25` | `low` | The unused withCanceled option is speculative machinery that can be removed without changing behaviour. |
| `code-standards:0:26` | `high` | Removing the nothing-to-invoice check lets issueInvoice save and notify an empty invoice, which then occupies the period so findByPeriod returns it instead of a later real invoice. |
| `code-standards:0:27` | `low` | The retryDelayMs seam exists only to speed the test, a rule breach that adds a production parameter but leaves default behaviour unchanged. |
| `code-spec:0:0` | `high` | A room whose amenity list has case-variant duplicates is never eligible even when it has every requested amenity. |
| `code-spec:0:1` | `high` | Confirm, cancel and reschedule append to the received reservation's history array, mutating the caller's object against the spec. |
| `code-spec:0:2` | `high` | Rescheduling accepts a snapped window longer than 240 minutes. |
| `code-spec:0:3` | `high` | A badge event key already recorded in another building is not found, so the event is recorded twice. |
| `code-spec:0:4` | `high` | A confirmed reservation starting exactly at the month's first instant is left out of the member's used minutes. |
| `code-spec:0:5` | `high` | Actor summaries stop counting at the query limit, so counts are wrong whenever more entries match. |
| `code-spec:0:6` | `high` | Fields with two or more double quotes are written as malformed CSV. |
| `code-spec:0:7` | `high` | send receives the message before the sent record is saved, and a failed save surfaces only after the message was already sent. |
| `code-spec:0:8` | `high` | Clearing a planned window keeps the old window, so the ticket still blocks other windows and can never be planned again. |
| `code-spec:0:9` | `high` | Dropping issuedAt makes the due instant NaN, so intents for late invoices get no late fee and an amount equal to the total. |
| `code-spec:0:10` | `high` | A closure with under one minute left is treated as ended, so adding it is rejected and it is missing from upcoming closures. |
| `code-spec:0:11` | `high` | A waiting entry within 60 minutes of its start cannot be withdrawn although the limit applies only to offered entries. |
| `code-spec:0:12` | `high` | Rooms without an active value are defaulted to active and wrongly included in the utilization report. |
| `code-spec:0:13` | `high` | Credit reasons are stored trimmed, so the saved invoice data differs from what was supplied against the explicit requirement. |
| `code-spec:0:14` | `high` | Authorization holds expire 604,800,000 minutes late, so stale authorizations keep blocking new intents and remain capturable. |
| `code-spec:0:15` | `high` | Payment status always reports paid 0 because no intent's invoiceId equals the invoice object. |
| `code-spec:0:16` | `high` | The 10080-minute audit window limit never triggers, so over-long query windows are accepted. |
| `code-spec:0:17` | `high` | Quiet-hours messages created off a minute boundary get a releaseAt one minute late. |
| `code-spec:0:18` | `high` | List items starting with =, +, - or @ are exported with a quote prefix instead of as stored. |
| `code-spec:0:19` | `high` | The expiry check never fires, so an expired waitlist offer can be accepted. |
| `commit-audit:0:0` | `high` | The public dispatch entry does not export the executor, so callers cannot reach the execution operations the issue and spec require. |
| `commit-audit:0:1` | `high` | A server-provided retryAfter of 0 is ignored and the computed backoff is used instead. |
| `commit-audit:0:2` | `high` | Dispatch runs before the authorization result is applied, so an unauthorized caller's plan is dispatched before rejection. |
| `commit-audit:0:3` | `high` | Reassigned stops are returned for their original driver and missing for their assigned driver. |
| `commit-audit:0:4` | `high` | A blackout departure is moved outside its departure window instead of being refused. |
| `commit-audit:0:5` | `medium` | The store contract leaves onCommit timing undefined, so whether plan.created fires only after successful storage cannot be established and needs clarification. |
| `commit-audit:0:6` | `high` | Concatenating depot ID and route key without a separator makes distinct routes collide and be reported as duplicates. |
| `commit-audit:0:7` | `high` | Non-decimal text such as '0x2', ' 2' or '' is accepted as a valid retry count. |
| `commit-audit:0:8` | `high` | Handed-over stops, which count as delivered, are still returned as pending. |
| `commit-audit:0:9` | `high` | Destination groups keep insertion order instead of ascending lexical order. |
| `commit-audit:0:10` | `medium` | The geocoder contract does not define the unknown-address outcome, so whether such stops are dropped, kept or reject the call is ambiguous. |
| `commit-audit:0:11` | `high` | A package total exactly equal to the vehicle limit is rejected. |
| `commit-audit:0:12` | `high` | An actor holding routes:admin through an active claim is wrongly refused depot ownership. |
| `commit-audit:0:13` | `high` | A suspended actor keeps its active-claim scopes and can still plan routes, an authorization bypass. |
| `commit-audit:0:14` | `high` | Removing the store.get copy removes nothing, so the manifest stays stored after the announcement failure. |
| `commit-audit:0:15` | `high` | Credentials inside arrays under auth are not redacted and leak into telemetry. |
| `commit-audit:0:16` | `high` | buildManifest mutates the supplied driver records by assigning labels onto them. |
| `commit-audit:0:17` | `high` | Validation results are always-truthy promises, so manifests with invalid entries are stored. |
| `commit-audit:0:18` | `high` | Failures marked non-transient but carrying retryAfter are retried, so publication keeps retrying a permanent failure. |
| `commit-audit:0:19` | `high` | Package IDs differing only in whitespace survive as duplicates across destination groups. |
| `commit-audit:1:0` | `high` | Route duration omits the 5 parking minutes per stop, so every route duration is understated. |
| `commit-audit:1:1` | `high` | Credentials inside arrays under auth are not redacted and leak into telemetry. |
| `commit-audit:1:2` | `high` | Removing the store.get copy removes nothing, so the manifest stays stored after the announcement failure. |
| `commit-audit:1:3` | `high` | Package IDs differing only in whitespace survive as duplicates across destination groups. |
| `commit-audit:1:4` | `high` | After a failed rename the locked temporary bytes are never removed, so atomic writes leave temporary data behind against the spec. |
| `commit-audit:1:5` | `high` | A package total exactly equal to the vehicle limit is rejected. |
| `commit-audit:1:6` | `high` | The public dispatch entry does not export the executor, so callers cannot reach the execution operations the issue and spec require. |
| `commit-audit:1:7` | `high` | Nested keys are not sorted, so equal plans differing only in nested field order get different checksums. |
| `commit-audit:1:8` | `high` | A text priority such as '7' lands in no partition, so that stop is dropped from the queue. |
| `commit-audit:1:9` | `high` | On a non-UTC host a time inside the blackout is not moved. |
| `commit-audit:1:10` | `medium` | The store contract leaves onCommit timing undefined, so whether plan.created fires only after successful storage cannot be established and needs clarification. |
| `commit-audit:1:11` | `high` | Text sequences are coerced to numbers, so stops without a finite numeric sequence are ordered wrongly among equal-priority stops. |
| `commit-audit:1:12` | `high` | A batch whose first route fails depot ownership is authorized, an authorization bypass. |
| `commit-audit:1:13` | `medium` | The weighing contract does not state scale.read's unit, so whether package weights are in grams is ambiguous and the capacity comparison may be off. |
| `commit-audit:1:14` | `high` | Dispatch runs before the authorization result is applied, so an unauthorized caller's plan is dispatched before rejection. |
| `commit-audit:1:15` | `high` | Non-decimal text such as '0x2', ' 2' or '' is accepted as a valid retry count. |
| `commit-audit:1:16` | `high` | Failures marked non-transient but carrying retryAfter are retried, so publication keeps retrying a permanent failure. |
| `commit-audit:1:17` | `high` | A suspended actor keeps its active-claim scopes and can still plan routes, an authorization bypass. |
| `commit-audit:1:18` | `high` | Notices go to the raw phone, so entries whose phone contains spaces or hyphens are not notified at their contact number. |
| `commit-audit:1:19` | `high` | A server-provided retryAfter of 0 is ignored and the computed backoff is used instead. |
| `spec-readiness:1:0` | `medium` | Runtime Migration fixes an exact success shape without summary while Result Summary requires it, so the two specs contradict on the public result. |
| `spec-readiness:1:1` | `medium` | Runtime Migration fixes an exact filesystem-failure shape without operation while Promotion Runtime requires it, so the specs contradict on the failure result. |
| `spec-readiness:2:0` | `low` | The rationale lacks the rejected alternative, a justification gap that does not change what to build or invite a misreading. |
| `spec-readiness:3:0` | `medium` | The new public recovery-result contract and failure lifecycle are waved through as an existing ADR responsibility, so a new durable decision goes unevaluated although ADR 0001 says it does not cover them. |
| `spec-readiness:4:0` | `medium` | Result Summary claims the Module Design exemption for a caller-visible Interface change, a misapplied rule that skips the required design. |
| `spec-readiness:4:1` | `medium` | Runtime Migration publishes caller-visible behaviour and exact results without the required Module Design section, leaving module ownership undefined. |
| `spec-readiness:5:0` | `low` | The applicable parser exemption only lacks a specific explanation, a wording gap that changes nothing and invites no misreading. |
| `spec-readiness:6:0` | `medium` | Readiness and Promotion both own request and artifact validation, contradictory ownership that leaves an implementer unsure which module validates. |
| `spec-readiness:6:1` | `medium` | Promotion and Recovery both validate the recovery input and Promotion may return the diagnostic without the Recovery handoff, contradicting the unconditional rollback handoff and propagation elsewhere. |
| `spec-readiness:7:0` | `medium` | reviewAccess takes no verified-principal input although decisions must be made only for a verified principal, so the security boundary cannot be implemented as specified without another round. |
| `spec-readiness:7:1` | `medium` | No result is defined for Policy Adapter execution failure although tests must cover it, so implementers must invent that contract. |
| `spec-readiness:7:2` | `medium` | The rollback-failure failureCode is ambiguous between the commit and the rollback failure, so implementations can return different codes. |
| `spec-readiness:7:3` | `medium` | Testing Decisions leave the rollback-failure result of recoverPromotion untested through its public lifecycle, so that public result can ship unverified. |
| `spec-readiness:7:4` | `medium` | unexpected-field has no position in the validation order, so the single first diagnostic is undefined when it coexists with other errors. |
| `spec-readiness:7:5` | `medium` | renderReport leaves the source input type and the artifact-read-failed path derivation undefined, so implementations can differ on invalid sources and read failures. |
| `spec-readiness:8:0` | `medium` | Both the Policy Adapters and Access Review Module own the operation check, contradictory ownership of the authorization policy that can make adapter and module decisions disagree. |
| `spec-readiness:9:0` | `low` | The required Source/Authority table is missing but the sources are stated in prose, a layout gap that invites no misreading. |
| `spec-readiness:9:1` | `medium` | Promotion Flow omits the read from artifact storage, so which module calls the Seam and the dependency direction are undefined. |
| `spec-readiness:10:0` | `low` | The module rationale omits the keep-authorization-in-caller alternative and its rejection, a justification gap that does not change what to build. |
| `spec-readiness:10:1` | `medium` | The security-relevant choice of deployment configuration over a request-supplied authorization policy is left without alternative, cost or rejection reason. |
| `spec-readiness:10:2` | `low` | The rationale does not justify the Access Review to Policy Evaluation Seam dependency direction, a justification gap that does not change what to build. |
| `code-standards:0:28` | `high` | changeHeadcount writes the new headcount into the caller's order before the vendor check, so a rejected change still leaves the caller's order, and a stored record passed in, with the new headcount. |
