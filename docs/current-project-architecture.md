# Current Project Architecture

当前仓库已经是一个基于 `AG-UI + A2UI` 的 monorepo：

- `apps/web`
  - Next.js 16 前端壳层
  - 会话列表、聊天输入框、工作区容器
  - `A2UI` surface 渲染器
- `apps/api`
  - Express API
  - run 创建、SSE、`A2UI userAction`
  - `AG-UI` / `A2UI` 协议桥
- `apps/agent`
  - Deep Agents / mock runtime
  - 负责 research 结果生成
- `packages/shared`
  - 协议 schema、共享类型、surface builders
- `packages/db`
  - Drizzle PostgreSQL schema

核心交互链路：

1. 前端提交 prompt
2. API 创建 run
3. API 协调器发 `AG-UI` 事件
4. 需要渲染 UI 时，通过 `CUSTOM/a2ui.message` 发 `A2UI`
5. 前端把 surface 渲染到聊天区和工作区
6. 用户点击 surface 里的按钮，再回传 `A2UI userAction`

补充说明：

- 当前主链路仍以 `InMemoryAppStore` 为主，`packages/db` 里的 PostgreSQL schema 还没有完全接入运行时。
- 当前 API 默认直接在进程内调用 `@my-manus/agent`，远程 agent transport 还处于预留状态。

更完整说明见：

- [ai-agent-technical-design.md](/Users/hundred/Documents/code/my-manus/docs/ai-agent-technical-design.md)
- [iteration-history.md](/Users/hundred/Documents/code/my-manus/docs/iteration-history.md)
