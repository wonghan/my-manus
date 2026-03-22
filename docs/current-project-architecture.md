# Current Project Architecture

当前仓库已经是一个基于 `AG-UI + A2UI` 的 monorepo：

- `apps/web`
  - Next.js 16 前端壳层
  - 会话列表、聊天输入框、工作区容器
  - `A2UI` surface 渲染器
  - 步骤点击后本地切换 artifact 的 workspace 状态
  - 本地持久化当前 `session / run / artifact` 选择，刷新后优先恢复
- `apps/api`
  - Express API
  - run 创建、SSE、`A2UI userAction`
  - `AG-UI` / `A2UI` 协议桥
  - `memory` 模式下直接执行 run
  - `postgres` 模式下负责写库、入队和读取状态
- `apps/agent`
  - Deep Agents / mock runtime
  - 作为纯 worker 消费 Redis 队列
  - 负责 research planning 和按步骤执行
- `packages/shared`
  - 协议 schema、共享类型、surface builders
  - `AgentPlan`、`RunStep`、`ArtifactRecord` 等核心合同
- `packages/db`
  - Drizzle PostgreSQL schema
  - `PostgresAppStore`
  - `RedisRunEventBus`
  - BullMQ queue / worker helpers

核心交互链路：

1. 前端提交 prompt
2. API 创建 session / messages / run
3. `memory` 模式下，API 直接调用 `RunCoordinator`
4. `postgres` 模式下，API 把 run 写入 PostgreSQL，并投递到 Redis/BullMQ 队列
5. `apps/agent` worker 消费 job，调用 `RunCoordinator`
6. `RunCoordinator` 先调用 `planResearchRun()` 拿到两层步骤树
7. 执行叶子步骤，逐步产出独立 artifact
8. 事件一边落 PostgreSQL `run_events`，一边通过 Redis pub/sub 实时分发
9. 前端通过 SSE 收到 `AG-UI`，把 `CUSTOM/a2ui.message` 渲染成步骤区和 workspace
10. 用户点击步骤时，前端本地切换右侧 workspace 到对应 artifact
11. clarification / approval / export 等动作，再通过 API 回传 `A2UI userAction`

补充说明：

- 当前已经支持 `InMemoryAppStore` 和 `PostgresAppStore` 双模式切换。
- `postgres` 模式要求同时提供 `DATABASE_URL` 和 `REDIS_URL`。
- 当前 API 默认直接在进程内调用 `@my-manus/agent` 的 planner / execution logic，但长任务执行已经可以从 API 进程拆到 worker。
- 当前 workspace 已经不是“单一 main artifact 覆盖模型”，而是“最新 artifact 默认展示 + 可按步骤回看旧产物”的模式。
- 当前前端已经补了刷新恢复：同一浏览器里，用户手动切到旧 artifact 后刷新，workspace 仍会保持在该 artifact，而不是掉回最新结果。

更完整说明见：

- [ai-agent-technical-design.md](/Users/hundred/Documents/code/my-manus/docs/ai-agent-technical-design.md)
- [iteration-history.md](/Users/hundred/Documents/code/my-manus/docs/iteration-history.md)
