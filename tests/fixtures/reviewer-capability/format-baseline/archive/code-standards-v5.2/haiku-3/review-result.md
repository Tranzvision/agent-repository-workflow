- `src/catering/catering-states.mjs:35` 使用 `export default advanceOrder`, `src/catering/catering-service.mjs:10` 使用默认导入. 违反 `src/AGENTS.md` 第 1 条 (模块必须使用具名导出, 禁止默认导出).
  影响: 违反仓库强制规则, 导出名称由导入方决定, 与同目录其他模块的导入方式不一致.
  修复: 改为 `export const advanceOrder`, 并把 `src/catering/catering-service.mjs:10` 改为具名导入.

- `src/catering/kitchen-manifest.mjs:1` 在规则模块中导入 `node:crypto`, 用于 `src/catering/kitchen-manifest.mjs:46` 的 SHA-256 摘要计算. 违反 `src/AGENTS.md` 第 2 条 (只有 store 模块和 platform 模块可以导入 Node.js 内置模块).
  影响: 规则模块依赖了运行环境能力, 违反分层约束.
  修复: 将摘要计算放入 `src/platform/` 下的通用模块 (不依赖业务语义), 由 `src/catering/kitchen-manifest.mjs` 导入该模块.

- `src/catering/menu.mjs:11` 导出的 `DIETARY_TAGS = Object.keys(DIETARY_LABELS)` 是数组, 且没有冻结. 违反 `src/AGENTS.md` 第 3 条 (直接导出的数组和普通对象必须在导出前冻结).
  影响: 调用方可以修改共享的标签列表, 影响 `src/catering/catering-statements.mjs` 中的统计.
  修复: 改为 `export const DIETARY_TAGS = Object.freeze(Object.keys(DIETARY_LABELS));`.

- `src/catering/menu.mjs:35-44` 的 `loadMenu` 是规则模块, 却在 `src/catering/menu.mjs:37` 使用 `try`/`catch` 捕获 `JSON.parse` 的错误. 违反 `src/AGENTS.md` 第 4.1 条 (规则模块不得捕获错误, 必须让错误传播给调用方).
  影响: 规则模块在吞掉或改写错误, 错误处理策略分散到了不该处理错误的层.
  修复: 删除该 `try`/`catch`, 让 `SyntaxError` 向上传播. `src/catering/catering-service.mjs:16-22` 的 `menuFor` 已把 `loadMenu` 抛出的任何错误包装为带 `cause` 的错误, 原始错误不会丢失.

- `src/catering/catering-service.mjs:35` 的 `throw new Error(..., error)` 把被捕获的错误作为第二个参数传入, 但没有写成 `{cause: error}`, 因此 `cause` 没有被设置. 违反 `src/AGENTS.md` 第 4.2 条 (替换被捕获错误的新错误必须以 `cause` 保留原错误). 同文件 `:21` 与 `:162` 已正确使用 `{cause: error}`.
  影响: 供应商通知失败时的原始错误在上层丢失, 诊断信息不完整.
  修复: 改为 `throw new Error(`vendor of order ${order.id} was not notified`, {cause: error});`.

- `src/catering/catering-store.mjs:33-41` 的 `save` 在 `:39` 执行 `.catch(() => undefined)` 之后, 在 `:40` 返回 `this.#writes`. 写入失败时返回的 promise 解析为 `undefined`, 原始错误被吞掉. 违反 `src/AGENTS.md` 第 4.3 条 (存储模块只能为保持写队列可用而捕获错误, 返回给调用方的 promise 仍必须以原错误拒绝).
  影响: 写入失败或 `requestKey` 冲突 (`:36-37`) 时, `src/platform/records.mjs:7-10` 的 `saveThenNotify` 拿到 `undefined`, 随后 `src/catering/catering-notices.mjs:14-15` 的 `placedNotice` 读取 `order.id` 抛出 TypeError. 原始错误不可见, 且会在没有保存成功的情况下继续执行通知路径.
  修复: 保存 `const result = this.#writes.then(...)`, 令 `this.#writes = result.catch(() => undefined)` 维持队列, 并返回 `result`. 可参照 `src/audit/audit-store.mjs:5-9` 的 `enqueue` 写法.

- `src/catering/catering-service.mjs:70-78` 的导出函数 `addLine` 对调用方传入的 `order` 做浅拷贝 (`:73`), 随后在 `:74` 执行 `amended.lines.push(...)`, 修改了仍与调用方共享的 `lines` 数组. 违反 `src/AGENTS.md` 第 5 条 (导出函数不得修改调用方传入的对象或数组).
  影响: 若 `:75` 的 `itemsFor` 抛错, 调用方的订单已被修改但没有保存.
  修复: 构造新数组, 例如 `const amended = {...order, lines: [...order.lines, prepareLine(line)]};`, 之后只保存和返回新对象.

- `src/catering/catering-service.mjs:81-88` 的 `changeHeadcount` 在 `:83` 直接执行 `order.headcount = ...`, 修改了调用方传入的对象. `store.find` 返回的记录同样属于调用方对象. 违反 `src/AGENTS.md` 第 5 条.
  影响: 若 `:84` 的供应商检查失败, 内存中的订单已经变更, 与存储中的记录不一致.
  修复: 基于 `{...order, headcount}` 生成副本, 对副本做检查, 保存并返回副本.

- `src/catering/catering-service.mjs:89-96` 的 `postponeOrder` 在 `:94` 对 `store.find` 返回的记录执行 `Object.assign(order, ...)`, 然后才在 `:95` 调用可能抛错的 `checkDeliverySlot`. 违反 `src/AGENTS.md` 第 5 条.
  影响: 失败路径会留下已被原地修改的存储记录, 没有任何回滚.
  修复: 生成 `{...order, deliverAt, postponedAt}` 副本, 对副本执行检查并保存.

- `src/catering/kitchen-manifest.mjs:27` 的 `inDeliveryOrder` 执行 `orders.sort(byDelivery)` 原地排序, 而 `:50` 的导出函数 `kitchenManifests` 把调用方的 `orders` 直接交给它 (`:51`). 违反 `src/AGENTS.md` 第 5 条. 这个只用一次的辅助函数名称也没有表达它会修改输入.
  影响: 调用 `kitchenManifests` 会改变调用方数组的顺序.
  修复: 删除 `inDeliveryOrder`, 在 `:51-52` 中先 `filter` (生成新数组) 再 `sort(byDelivery)`.

- `src/catering/catering-notices.mjs:54` 在规则模块 `vendorNotice` 中执行 `Date.now()` 作为 `sentAt`. 违反 `src/AGENTS.md` 第 6.1 条 (只有 service 模块可以读取当前时间, 且只能调用注入的 `now`).
  影响: 通知内容的时间依赖隐藏的系统时钟, 无法在测试中固定, 也无法与 `placeOrder` 中的 `at` (`src/catering/catering-service.mjs:51`) 保持一致.
  修复: `vendorNotice` 增加 `sentAt` 参数. `notifyVendor` 增加 `at` 参数, 由 `src/catering/catering-service.mjs:66` 的 `placeOrder` 传入已读取的 `at`.

- `src/catering/catering-pricing.mjs:35` 的规则函数 `cancellationFee(order, context)` 接收含 `now` 的 `context` 并调用 `context.now()`. 违反 `src/AGENTS.md` 第 6.2 条 (规则模块接收时间瞬间, 不得接收 `now` 函数). 同时 `src/catering/catering-service.mjs:111` 的 `cancelOrder` 在一次调用中读取两次时间 (`now()` 用于 `advanceOrder`, `context.now()` 用于手续费), 违反第 6.3 条 (服务函数每次调用最多读取一次时间).
  影响: 同一次取消中两个时间点可能不一致, 手续费与取消时间可能对应不同的瞬间.
  修复: `cancelOrder` 中执行一次 `const at = now();`, 传给 `advanceOrder(order, 'cancel', at)`; `cancellationFee` 改为 `(order, at) => ...`, 由 `cancelOrder` 传入 `at`.

- `src/catering/catering-service.mjs:122-126` 的 `upcomingOrders` 在 `filter` 的每个元素上调用 `isUpcoming(now)` 中的 `now()` (`:122`). 违反 `src/AGENTS.md` 第 6.3 条.
  影响: 对 N 个订单读取 N 次时间, 同一次查询中不同订单的比较基准可能不同.
  修复: 函数开头执行一次 `const at = now();`, 过滤时使用 `at`.

- `src/catering/catering-service.mjs:4` 从 `../schedules/front-desk-service.mjs` (另一 feature 的 service 模块) 导入 `isFrontDeskOpen`, 并在 `:40` 调用. 违反 `src/AGENTS.md` 第 7.2 条 (feature 模块不得导入其他 feature 的 service 或 store 模块).
  影响: 下单流程依赖 schedules 的服务层实现, 两个 feature 的内部变更会互相传导.
  修复: 可以导入 `src/schedules/desk-policy.mjs` 中的规则函数 `isDeskOpen` (规则模块, 第 7.2 条允许), 但营业时间表和停业安排必须由调用方注入; 或由调用方注入营业检查函数. 不得导入 schedules 的 service 模块.

- `src/catering/catering-service.mjs:55` 手写 `at < (member.suspension?.expiresAt ?? at)` 判断会员是否被停权, 与 `src/members/suspension.mjs:6` 的 `isSuspended(member, at)` 逻辑重复. 该表达式还需要读者推断 `?? at` 的含义.
  影响: 停权规则有两份实现, 将来修改会员停权语义时需要同步修改两处.
  修复: 从 `src/members/suspension.mjs` 导入 `isSuspended` (规则模块, 第 7.1 与 7.2 条允许), 使用 `if (isSuspended(member, at)) throw ...`.

- `src/catering/kitchen-manifest.mjs:19-25` 的 `KITCHENS` 与 `kitchenFor` 复制了 `src/catering/vendors.mjs:9-12` 的 `vendorFor` 派单规则 (halal 派给 crescent, 人数超过阈值派给 banquet, 其余派给 deli). 两处阈值写法也不同 (`>= 31` 与 `> 30`). `kitchenFor` 返回的值被 `kitchenManifests` 当作 `vendorId` 分组使用, 名称 "kitchen" 与字段 `vendorId` 不一致.
  影响: 派单规则修改时需要同时修改两处. 两份规则分歧后, 厨房清单会把订单列入不属于该供应商的清单, 与订单实际的 `vendorId` 不一致.
  修复: 删除 `KITCHENS` 与 `kitchenFor`, 按订单已有的 `order.vendorId` 分组 (`placeOrder` 已用 `vendorFor` 写入该字段).

- `src/catering/catering-service.mjs:157-166` 的 `notifyVendorWithRetry` 与 `src/catering/catering-service.mjs:31-37` 的 `notifyVendor` 是同一供应商通知步骤的两套实现. 生产路径 `placeOrder` (`:66`) 只调用 `notifyVendor`, 没有重试. `notifyVendorWithRetry` 在仓库中没有生产调用方, 只有 `tests/catering/vendor-retry.spec.mjs` 导入它, 其 `attempts` 与 `retryDelayMs` 参数也没有调用方.
  影响: 同一步骤有两套错误包装 (见上文 `cause` 条目), 重试能力没有接入下单路径, 只形成了未使用的代码和只为它存在的测试.
  修复: 保留一条通知路径. 若需求要求重试, 让 `placeOrder` 使用带重试的版本并删除 `notifyVendor`; 若不要求, 删除 `notifyVendorWithRetry`, 它的参数以及 `tests/catering/vendor-retry.spec.mjs`. 该选择取决于需求, 需由维护者确认.

- `src/catering/catering-statements.mjs:14-16` 的 `vendorStatement` 带有 `{withCanceled = false}` 选项, 开启时 `:16` 的变量 `delivered` 还会包含已取消订单. 唯一调用方 `src/catering/catering-service.mjs:145` 没有传入该选项, 仓库中也没有其他调用. 违反根 `AGENTS.md` 效率原则第 3 条 (不为假设的未来需求增加选项).
  影响: 名为 `delivered` 的变量在某些调用下实际包含已取消订单, 命名与行为不符; 未使用的分支增加理解成本.
  修复: 删除 `withCanceled` 选项与 `counted` 中的取消分支, 改为 `orders.filter(order => ...)` 中直接使用 `deliveredIn(period)`.

- `src/catering/menu.mjs:52` 的 `findMenuItem` 与同文件 `src/catering/menu.mjs:46-50` 的 `requireMenuItem` 行为完全相同, 只是转发调用, 没有增加策略. 仅 `src/catering/catering-notices.mjs:2` 与 `:10` 使用它.
  影响: 同一查找有两个名称, 增加阅读成本.
  修复: 删除 `findMenuItem`, 调用处改为 `requireMenuItem`.

- `src/catering/catering-time.mjs:1` 只把 `src/platform/time.mjs` 的 `DAY` 与 `addMinutes` 重新导出, 不隐藏任何复杂性. 调用方 `src/catering/catering-policy.mjs:4` 与 `src/catering/catering-service.mjs:11` 因此间接依赖一个转发模块.
  影响: 多出一个只做转发的中间模块, 平台时间函数的来源不直观.
  修复: 删除 `src/catering/catering-time.mjs`, 调用方直接从 `../platform/time.mjs` 导入.

- `src/catering/catering-service.mjs:137-138` 手写了配送窗口判断 (`deliverAt - deliveryLead` 与 `deliverAt <= day + DAY`). `src/catering/catering-policy.mjs:22` 的 `deliveryWindow` 与 `src/platform/periods.mjs:3` 的 `contains` 已表达同一判断, `src/catering/kitchen-manifest.mjs:52` 也使用后者.
  影响: 配送窗口有两种定义. 修改 `deliveryWindow` 时, 服务台查询与厨房清单会对同一订单给出不同结论.
  修复: 改为 `contains({startAt: day, endAt: day + DAY}, deliveryWindow(order))`, 与 `src/catering/kitchen-manifest.mjs:52` 的写法一致, 语义相同.

- 菜品课程的知识分散在三处: `src/catering/menu.mjs:13` 的 `COURSES` (合法课程), `src/catering/catering-notices.mjs:7` 的 `SERVING_ORDER` (出餐顺序), `src/catering/catering-policy.mjs:6-14` 的 `prepMinutes` switch (备餐时长).
  影响: 新增课程需要同时修改三处. 漏改任一处会在运行时出错: `prepMinutes` 抛错, 或 `SERVING_ORDER` 返回 `undefined` 导致排序结果不确定.
  修复: 在 `src/catering/menu.mjs` 用一张课程表同时定义合法性, 出餐顺序和备餐时长, 其他模块从该表读取.

- `src/catering/catering-policy.mjs:12` 的 `prepMinutes` 在 `default` 分支中再次校验课程, 但课程已在 `src/catering/menu.mjs:21` 加载菜单时校验 (`COURSES.includes`). 这是信任边界之内对已校验数据的重复判断, 违反根 `AGENTS.md` 效率原则第 3 条.
  影响: 增加不可达的错误路径和代码行.
  修复: 删除 `default` 分支, 随上一条课程表合并一并处理.

- `src/catering/catering-pricing.mjs:7` 的 `lineCost` 只在 `:15` 使用一次, `src/catering/catering-pricing.mjs:9-12` 的 `share` 只在 `:18` 使用一次, 二者都没有封装复杂逻辑. 违反根 `AGENTS.md` 效率原则第 4 条 (只用一次的逻辑直接写在调用处). `share` 的名称也没有表达它是按基点计算税额 (Mysterious Name).
  影响: 增加跳转成本, 名称误导读者.
  修复: 将两者内联到 `orderCharge` 中, 税额直接写为 `Math.round((taxable * taxBasisPoints) / 1e4)`, 并删除 `share` 与 `lineCost`.

- `src/catering/catering-service.mjs` 同时承担下单, 取消, 配送台查询, 厨房清单, 供应商统计, 会员账单桥接, 列表分页和供应商通知重试等职责. 只读的查询与报表 (`listOrders`, `deskDeliveries`, `vendorStatements`, `memberInvoiceCharges`, `vendorManifests`, 位于 `:128-153`) 与订单状态变更无关, 却共用同一文件, 并依赖 `src/catering/catering-statements.mjs`, `src/catering/kitchen-manifest.mjs` 与 `src/catering/menu.mjs` (`:9`, `:12`, `:13`).
  影响: 修改报表或清单需要改动并复审订单变更所在的模块, 而两者之间没有共同的变更原因.
  修复: 将只读查询及其依赖的 `menuFor` 移入单独的 service 模块, 下单和状态变更留在 `src/catering/catering-service.mjs`.
