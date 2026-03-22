# Current Project Architecture

当前仓库已经是一个基于 `AG-UI + A2UI` 的 monorepo：

- `apps/web`
  - Next.js 16 前端壳层
  - 会话列表、聊天输入框、工作区容器
  - `A2UI` surface 渲染器
  - 步骤点击后本地切换 artifact 的 workspace 状态
- `apps/api`
  - Express API
  - run 创建、SSE、`A2UI userAction`
  - `AG-UI` / `A2UI` 协议桥
  - `RunCoordinator` 负责把规划结果转换成步骤树和 artifact surface
- `apps/agent`
  - Deep Agents / mock runtime
  - 负责 research planning 和按步骤执行
- `packages/shared`
  - 协议 schema、共享类型、surface builders
  - `AgentPlan`、`RunStep`、`ArtifactRecord` 等核心合同
- `packages/db`
  - Drizzle PostgreSQL schema

核心交互链路：

1. 前端提交 prompt
2. API 创建 run
3. `RunCoordinator` 先调用 `planResearchRun()` 拿到两层步骤树
4. API 发 `AG-UI` 事件，并通过 `CUSTOM/a2ui.message` 下发 A2UI surface
5. `RunCoordinator` 逐个执行叶子步骤，每个叶子步骤最多产出一个 artifact
6. 前端把聊天区、步骤区和 `artifact:{artifactId}` 工作区分别渲染出来
7. 用户点击步骤时，前端本地切换右侧 workspace 到对应 artifact
8. 如果用户点击 clarification / approval / export 这类动作，再回传 `A2UI userAction`

补充说明：

- 当前主链路仍以 `InMemoryAppStore` 为主，`packages/db` 里的 PostgreSQL schema 还没有完全接入运行时。
- 当前 API 默认直接在进程内调用 `@my-manus/agent`，远程 agent transport 还处于预留状态。
- 当前 workspace 已经不是“单一 main artifact 覆盖模型”，而是“最新 artifact 默认展示 + 可按步骤回看旧产物”的模式。

更完整说明见：

- [ai-agent-technical-design.md](/Users/hundred/Documents/code/my-manus/docs/ai-agent-technical-design.md)
- [iteration-history.md](/Users/hundred/Documents/code/my-manus/docs/iteration-history.md)
