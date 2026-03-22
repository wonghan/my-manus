# My Manus 技术方案

## 文档说明

这份文档面向两个目标：

1. 帮你从产品和工程两个角度理解当前仓库到底实现到了哪一步。
2. 让你后续继续开发、调试、部署时，不需要反复重新梳理架构。

如果你想看“这一路是怎么演进过来的”，请结合 [iteration-history.md](/Users/hundred/Documents/code/my-manus/docs/iteration-history.md) 一起看。

## 1. 产品定位

当前项目不是“黑盒式全自动电脑代理”，而是一个以 `artifact` 为核心的 AI Agent v1。

它的核心目标有 3 个：

1. Agent 在做什么，用户要能看见。
2. Agent 生成的界面要有统一协议，而不是前端到处拼私有组件。
3. 最终结果要沉淀成可查看、可追问、可导出的 artifact。

这版设计参考了 `figma` 原型中的交互方式，但实现时遵守了一个明确边界：

- 参考原型的页面布局、工作区形态、交互节奏。
- 不参考其他分支的旧代码实现。

## 2. 当前版本的范围

### 2.1 当前已经覆盖的能力

- Monorepo 基础结构已经建立。
- `web + api + agent + shared + db` 五层分工已经固定。
- 前端已经按 `figma` 的双栏工作区思路落成静态壳层。
- `AG-UI` 已作为唯一的 SSE 事件总线。
- `A2UI v0.8` 已作为所有 Agent-owned UI 的统一描述协议。
- 支持 `mock` 和 `live` 两种 research 模式。
- 支持 deepagents planning 驱动的动态步骤树。
- 支持按步骤回看独立 artifact，而不是只看最后一个结果。
- 支持 clarification、approval、artifact actions 这些基础 HITL 交互。

### 2.2 当前还没有完成的能力

- 真实 PostgreSQL 持久化还没有接到主链路，当前主链路仍是内存 store。
- Redis / 队列 / worker 调度还没有接到主链路。
- run 取消、超时恢复、重试策略还没有补完整。
- 文件导出现在还是协议和审批流程为主，还没有真正生成下载文件。
- 登录和多用户权限还没有开始做。
- 浏览器级电脑代理、沙箱执行、代码运行审批还只是后续扩展位。

## 3. 为什么选 AG-UI + A2UI

### 3.1 AG-UI 的职责

`AG-UI` 负责所有运行态事件，也就是“Agent 发生了什么”。

当前实现里主要使用这些事件：

- `RUN_STARTED`
- `RUN_FINISHED`
- `RUN_ERROR`
- `TEXT_MESSAGE_START`
- `TEXT_MESSAGE_CONTENT`
- `TEXT_MESSAGE_END`
- `TOOL_CALL_START`
- `TOOL_CALL_ARGS`
- `TOOL_CALL_END`
- `TOOL_CALL_RESULT`
- `STATE_DELTA`
- `ACTIVITY_SNAPSHOT`
- `ACTIVITY_DELTA`
- `CUSTOM`

这些事件的 schema 定义在 [ag-ui.ts](/Users/hundred/Documents/code/my-manus/packages/shared/src/protocols/ag-ui.ts)。

### 3.2 A2UI 的职责

`A2UI` 负责所有 Agent-owned UI，也就是“Agent 希望界面长什么样、显示什么数据、用户点了之后怎么回给 Agent”。

当前不是只把 A2UI 用在审批弹窗上，而是用在这些 surface：

- 欢迎空态
- assistant 正文
- 步骤时间线
- artifact 主体展示区
- artifact 操作区
- clarification 表单
- approval 面板
- error surface

这些 schema 定义在 [a2ui.ts](/Users/hundred/Documents/code/my-manus/packages/shared/src/protocols/a2ui.ts)。

### 3.3 两者怎么协同

当前设计是：

- `AG-UI` 是唯一的流式传输协议。
- `A2UI` 不额外开第二条 SSE 通道。
- `A2UI` 通过 `AG-UI CUSTOM` 事件嵌入传输。

桥接格式固定为：

```json
{
  "type": "CUSTOM",
  "name": "a2ui.message",
  "value": {
    "version": "v0.8",
    "type": "surfaceUpdate"
  }
}
```

这件事在代码里由 [ag-ui.ts](/Users/hundred/Documents/code/my-manus/packages/shared/src/protocols/ag-ui.ts) 的 `createA2UiCustomEvent` 负责。

## 4. 仓库结构

当前 monorepo 的职责划分如下：

### `apps/web`

- Next.js 16 App Router 前端。
- 负责静态 app shell。
- 负责消费 `/runs/:runId/stream` 返回的 `AG-UI` SSE。
- 负责把 `CUSTOM/a2ui.message` 交给 A2UI renderer。

关键文件：

- [page.tsx](/Users/hundred/Documents/code/my-manus/apps/web/app/page.tsx)
- [app-shell.tsx](/Users/hundred/Documents/code/my-manus/apps/web/src/components/app-shell.tsx)
- [protocol-surface.tsx](/Users/hundred/Documents/code/my-manus/apps/web/src/components/protocol-surface.tsx)
- [protocol-state.ts](/Users/hundred/Documents/code/my-manus/apps/web/src/lib/protocol-state.ts)
- [api.ts](/Users/hundred/Documents/code/my-manus/apps/web/src/lib/api.ts)

### `apps/api`

- Express API。
- 负责 session、run、artifact、SSE、A2UI userAction。
- 负责把 agent 语义转换成协议事件。

关键文件：

- [app.ts](/Users/hundred/Documents/code/my-manus/apps/api/src/app.ts)
- [run-coordinator.ts](/Users/hundred/Documents/code/my-manus/apps/api/src/services/run-coordinator.ts)
- [sse.ts](/Users/hundred/Documents/code/my-manus/apps/api/src/services/sse.ts)
- [in-memory-store.ts](/Users/hundred/Documents/code/my-manus/apps/api/src/store/in-memory-store.ts)

### `apps/agent`

- 当前提供 research 能力。
- 支持 `mock` 和 `live`。
- 当前 API 主链路默认是“直接在进程内调用 `@my-manus/agent`”，并没有强制走远程 agent HTTP。

关键文件：

- [config.ts](/Users/hundred/Documents/code/my-manus/apps/agent/src/config.ts)
- [mock.ts](/Users/hundred/Documents/code/my-manus/apps/agent/src/mock.ts)
- [research.ts](/Users/hundred/Documents/code/my-manus/apps/agent/src/research.ts)
- [server.ts](/Users/hundred/Documents/code/my-manus/apps/agent/src/server.ts)

### `packages/shared`

- 放共享领域类型、协议 schema、surface builder。
- 这是当前仓库最重要的“中间层合同”。

关键文件：

- [domain.ts](/Users/hundred/Documents/code/my-manus/packages/shared/src/domain.ts)
- [ag-ui.ts](/Users/hundred/Documents/code/my-manus/packages/shared/src/protocols/ag-ui.ts)
- [a2ui.ts](/Users/hundred/Documents/code/my-manus/packages/shared/src/protocols/a2ui.ts)
- [surfaces.ts](/Users/hundred/Documents/code/my-manus/packages/shared/src/builders/surfaces.ts)

### `packages/db`

- 已经定义好 Drizzle schema。
- 当前还没有完全接到运行主链路。

关键文件：

- [schema.ts](/Users/hundred/Documents/code/my-manus/packages/db/src/schema.ts)
- [client.ts](/Users/hundred/Documents/code/my-manus/packages/db/src/client.ts)

## 5. Figma 对齐后的界面理解

当前页面不是自由发挥式设计，而是以 `figma` 原型为准，保留了这些交互骨架：

- 左侧 session 列表
- 中间聊天主区域
- 右侧工作区 workspace
- 空态建议入口
- 聊天区中的步骤与正文并行展示
- 工作区中不同 artifact 的切换节奏

从产品角度看，`figma` 原型主要表达的是下面这条体验链路：

1. 用户发出任务。
2. Agent 先展示“正在理解和规划”。
3. 聊天区显示正文和步骤。
4. 工作区逐步出现 artifact。
5. 用户基于 artifact 继续追问、导出或调整。

当前实现已经比较贴近这个框架，但还存在两个不足：

- 视觉层级虽然已经尽量贴近原型，但一些细节仍然是工程版，而不是 100% 设计稿像素级还原。
- 原型中很多区域本来只是“展示完成态”，而真实工程里还需要补状态转换、错误态和刷新恢复。

## 6. A2UI surface 目录

当前已经固定的 surface 规划如下：

| surfaceId 形式 | 用途 |
| --- | --- |
| `session-empty-state` | 欢迎空态 |
| `message:{messageId}` | assistant 正文 |
| `steps:{runId}` | 步骤时间线 |
| `artifact:{artifactId}` | 单个 artifact 主体 |
| `artifact:{runId}:actions` | artifact 操作区 |
| `clarification:{runId}` | clarification 表单 |
| `approval:{runId}` | 审批面板 |
| `error:{runId}` | 错误 surface |

需要特别注意的是：

- `steps:{runId}` 的 data model 现在除了 `steps` 之外，还会携带 `latestArtifactId`。
- 右侧 workspace 默认显示最新 artifact。
- 用户点击某个叶子步骤后，前端会把当前 run 切到 pinned 状态，右侧继续显示该步骤对应的 artifact，直到用户主动再切换。

当前 A2UI renderer 支持的 catalog 组件包括：

- `Column`
- `Row`
- `Card`
- `Text`
- `Markdown`
- `Badge`
- `Button`
- `ButtonGroup`
- `Divider`
- `Input`
- `Textarea`
- `Select`
- `List`
- `Table`
- `CodeBlock`
- `StepTimeline`
- `ArtifactHeader`
- `ReferenceList`
- `Notice`

这些组件定义虽然是前端实现，但它们的输入合同由 `packages/shared` 控制，这样可以避免协议和前端渲染分叉。

## 7. 数据模型

### 7.1 当前运行时数据模型

当前 API 主链路用的是 [in-memory-store.ts](/Users/hundred/Documents/code/my-manus/apps/api/src/store/in-memory-store.ts)。

内存 store 里维护了这些核心结构：

- `sessions`
- `messages`
- `runs`
- `runSteps`
- `artifacts`
- `approvals`
- `runEvents`
- `pendingClarifications`

这里最关键的是 `runEvents`：

- 它保存每个 run 的完整 `AG-UI` 事件序列。
- 刷新页面后，前端依赖它进行 replay。
- 这也是当前版本唯一的“可重放历史”。

### 7.2 目标数据库模型

`packages/db` 已经定义了这些 PostgreSQL 表：

- `sessions`
- `messages`
- `runs`
- `run_steps`
- `artifacts`
- `approval_requests`
- `run_events`

每张表的作用可以简单理解成：

- `sessions`：会话容器
- `messages`：聊天消息
- `runs`：每次执行任务的主记录
- `run_steps`：执行步骤时间线
- `artifacts`：结构化结果物
- `approval_requests`：HITL 审批单
- `run_events`：标准化 AG-UI 事件日志

为什么 `run_events` 要单独存表：

1. 前端刷新恢复依赖它。
2. 排查问题时最有价值的是事件流，而不是最终文案。
3. 将来切 Redis pub/sub 或队列时，它也能作为落地审计日志。

## 8. API 设计

当前 Express API 已经暴露这些核心接口：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `GET` | `/bootstrap` | 获取空态 surface |
| `GET` | `/sessions` | 获取会话列表 |
| `POST` | `/sessions` | 创建会话 |
| `GET` | `/sessions/:sessionId` | 获取会话详情 |
| `POST` | `/runs` | 创建新 run |
| `GET` | `/runs/:runId/events` | 查看保存的事件流 |
| `GET` | `/runs/:runId/artifacts` | 查看 artifact 记录 |
| `GET` | `/runs/:runId/stream` | 订阅 SSE |
| `POST` | `/ui/actions` | 回传 A2UI userAction |

### 8.1 `/runs`

`POST /runs` 负责：

1. 校验 prompt。
2. 创建 session。
3. 创建 user message 和 assistant message。
4. 创建 run。
5. 异步触发 `RunCoordinator.startRun()`。

### 8.2 `/runs/:runId/stream`

这个接口返回标准 SSE。

当前行为是：

- 默认 `replay=1`
- 会先重放该 run 已保存的 `runEvents`
- 然后再订阅后续增量事件

这也是前面调试时容易看到“旧错误被 replay 出来”的原因。

### 8.3 `/ui/actions`

这个接口统一接收所有需要回传给 Agent 的 A2UI 动作。

当前已经处理的 action 包括：

- `start-suggestion`
- `request-export`
- `approve-approval`
- `reject-approval`
- `submit-clarification`
- `continue-research`

这样做的好处是前端不需要为每个按钮再造一组私有接口。

## 9. Run 生命周期

一次正常 run 的主流程如下：

1. 前端调用 `POST /runs`
2. API 创建 run 和首轮消息
3. `RunCoordinator` 将 run 状态改为 `running`
4. 发出 `RUN_STARTED`
5. 初始化 3 类 surface
   - assistant message
   - steps
   - artifact actions
6. 发出 assistant 文本事件
7. 如果命中 clarification 条件，切到 `waiting_clarification`
8. 否则进入 `performResearch`
9. `performResearch()` 先调用 `planResearchRun()` 拿到动态步骤树
10. API 把步骤树 materialize 成 `RunStep[]`，同步到 `steps:{runId}` surface
11. 协调器逐个执行叶子步骤，每完成一步就创建独立 `ArtifactRecord`
12. 每个 artifact 通过 `artifact:{artifactId}` surface 渲染到右侧 workspace
13. assistant 正文补充总结，run 进入完成态，或根据结果进入 approval / error

### 9.1 当前步骤设计

当前步骤已经不再是固定三步，而是：

1. 先由 `planResearchRun()` 生成两层步骤树。
2. 顶层步骤负责表达阶段分组。
3. 叶子步骤负责真正执行，并且一个叶子步骤最多绑定一个 artifact。

这么设计的原因有两个：

- 用户可以从时间线回看“某个步骤到底产出了什么”。
- browser、table、markdown、code 等 artifact 不会再互相覆盖。

### 9.2 Clarification

如果 prompt 缺少必要上下文，agent 会先停在 clarification。

当前链路：

1. `getClarificationRequest(prompt)` 判断是否需要追问
2. 生成 clarification surface
3. run 状态切到 `waiting_clarification`
4. 前端提交 `submit-clarification`
5. API 把补充信息拼回 prompt
6. run 回到 `running`

### 9.3 Approval

当前已实现的是导出审批：

1. 用户点击 `request-export`
2. API 创建 `approval_request`
3. run 状态切到 `waiting_approval`
4. 前端渲染 approval surface
5. 用户批准或拒绝
6. API 删除审批 surface，并更新 assistant message

## 10. Agent 层设计

### 10.1 Mock 模式

`mock` 模式的目标不是“假装很聪明”，而是：

- 先保证前端协议和交互链路能开发
- 避免新手一开始就卡在模型和联网配置
- 让测试具有稳定输出

### 10.2 Live 模式

`live` 模式当前通过这些环境变量驱动：

```bash
AGENT_EXECUTION_MODE=live
OPENAI_API_BASE=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
OPENAI_COMPLEX_MODEL=gpt-5.1
TAVILY_API_KEY=
```

当前 live research 的思路是：

1. 先用 `createDeepAgent()` + 结构化 schema 生成 `AgentPlan`。
2. 再按叶子步骤执行，每次只产出一个 artifact。
3. 需要研究内容时，调用真正的 research 生成统一 `ResearchResult`。
4. 根据不同 `artifactKind`，从 `ResearchResult` 中切出 browser / table / markdown / code 等产物。

也就是说，deepagents 在当前版本里主要承担两类角色：

- planning
- live research 的结构化生成

前端协议、workspace 展示策略、artifact 回溯关系，仍然由我们自己的共享合同和 `RunCoordinator` 负责。

### 10.3 当前调试里已经踩过的坑

这部分很重要，因为后面再碰到类似问题时，你能快速定位：

1. `OPENAI_API_BASE` 不能只在 agent 独立调用时生效，也要沿着 `/runs -> RunCoordinator -> researchPrompt` 这条链路传进去。
2. `gpt-5-mini` 不接受 `temperature: 0` 这样的参数组合。
3. `deepagents` 的 schema 传法要用当前支持的形式，不能按旧示例随便套。
4. 即使页面里看到 `RUN_ERROR 401`，也要先确认是不是旧 run 的 `replay`，不一定是当前新请求又失败了。

## 11. 环境变量

当前根目录 `.env.example` 已经包含这些项：

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4300
API_PORT=4300
AGENT_PORT=4301
APP_STORAGE_MODE=memory
REDIS_URL=
DATABASE_URL=
OPENAI_API_BASE=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
OPENAI_COMPLEX_MODEL=gpt-5.1
TAVILY_API_KEY=
AGENT_EXECUTION_MODE=mock
```

说明如下：

- `NEXT_PUBLIC_API_BASE_URL`：前端连接哪个 API。
- `API_PORT`：Express 端口。
- `AGENT_PORT`：agent HTTP 端口。
- `APP_STORAGE_MODE`：当前保留位，后面可切 storage backend。
- `REDIS_URL`：后续接队列和缓存时使用。
- `DATABASE_URL`：后续接 PostgreSQL 时使用。
- `OPENAI_API_BASE`：企业代理或自定义 OpenAI base URL。
- `OPENAI_API_KEY`：模型访问密钥。
- `TAVILY_API_KEY`：搜索密钥。
- `AGENT_EXECUTION_MODE`：`mock` 或 `live`。

## 12. 当前部署建议

### 12.1 最适合当前阶段的方案

最推荐的仍然是 Render：

- `web` 用 Render Web Service
- `api` 用 Render Web Service
- `agent` 用 Render Worker 或 Web Service
- PostgreSQL 用 Render Postgres
- Redis 用 Render Key Value

这样做的理由：

1. 新手部署门槛低。
2. 前后端拆分清晰。
3. 将来加数据库和队列时迁移成本小。

### 12.2 当前阶段不建议做的事情

- 先不要急着上 Kubernetes。
- 先不要为了 worker 调度提前做过度复杂的微服务拆分。
- 先不要在没有登录和限流的情况下直接公开开放公网。

## 13. 测试策略

当前测试建议分 3 层：

### 13.1 单元测试

- 协议 schema 校验
- A2UI surface builder 输出
- reducer 状态变化
- run 状态机

### 13.2 集成测试

- `POST /runs`
- SSE 输出
- clarification 回传
- approval 回传
- artifact 记录生成

### 13.3 页面级验证

- 空态是否正确展示
- 提问后 assistant surface 是否流式更新
- steps surface 是否变化
- workspace 是否出现 artifact
- 点击步骤后是否能切换到对应 artifact
- 用户手动切回旧产物后，workspace 是否保持 pinned
- approval 是否可点击
- clarification 是否能继续推进 run

## 14. 当前局限与技术债

当前你最需要知道的技术债有 6 个：

1. `InMemoryAppStore` 只适合本地开发，不适合重启后恢复真实数据。
2. `api` 还没有把 run 调度拆到真正独立 worker。
3. remote agent transport 只是配置预留，还不是主路径。
4. 前端虽然已经接入 A2UI，但 renderer 还是 v1 轻量实现，组件能力有限。
5. artifact 目前以 research 类型为主，还没有真正扩展到代码执行、文件处理、浏览器自动化。
6. 本地开发时容易遇到 Node `watch` 的 `EMFILE`，所以当前更适合用不带 watch 的方式做局部调试。

## 15. 推荐的下一步迭代顺序

如果按“最稳、最不容易返工”的顺序推进，我建议是：

1. 先把 PostgreSQL 持久化接上。
2. 把 `run_events` 真正落库。
3. 再把 Redis / BullMQ / worker 调度接上。
4. 然后把 remote agent transport 真正启用。
5. 再补导出文件落地、run cancel / retry。
6. 最后再上登录、权限、公开部署。

## 16. 相关阅读

- [current-project-architecture.md](/Users/hundred/Documents/code/my-manus/docs/current-project-architecture.md)
- [iteration-history.md](/Users/hundred/Documents/code/my-manus/docs/iteration-history.md)
