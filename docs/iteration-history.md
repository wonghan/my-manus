# My Manus 迭代历史

## 说明

这份文档不是严格的 Git commit 历史，而是基于当前分支已经完成的功能，对这次重构和实现过程做的阶段性整理。

它的作用是：

1. 帮你回忆“我们已经做过什么”。
2. 解释“为什么会这样设计”。
3. 让后面的迭代能接着当前脉络继续走，而不是重复推翻。

## 迭代 0：重置实现前提

### 目标

明确这次不是修旧项目，而是基于空仓库思路重建一版 v1。

### 关键决策

- 不参考其他分支的旧实现。
- 只把 `figma` 文件夹作为交互和视觉的主要输入。
- 产品定位定为“artifact-first 的研究型 Agent”，不是完整电脑代理。

### 结果

后面的代码结构没有被旧分支绑死，协议、目录、状态机都能按新的思路落。

## 迭代 1：建立 monorepo 骨架

### 目标

把仓库拆成清晰的前端、API、Agent、共享协议、数据库五层。

### 关键决策

- 使用 `pnpm workspace` 管 monorepo。
- 固定目录为：
  - `apps/web`
  - `apps/api`
  - `apps/agent`
  - `packages/shared`
  - `packages/db`

### 结果

项目从一开始就避免了“前后端、协议、类型全混在一起”的问题。

## 迭代 2：确定协议主线

### 目标

避免页面和 Agent 之间到处都是私有 JSON 结构。

### 关键决策

- `AG-UI` 作为唯一 SSE 事件总线。
- `A2UI v0.8` 作为所有 Agent-owned UI 的统一描述协议。
- `A2UI` 不单独走第二条 SSE，而是通过 `AG-UI CUSTOM` 嵌套传输。

### 结果

系统有了清晰的协议分工：

- `AG-UI` 说“发生了什么”
- `A2UI` 说“界面长什么样”

## 迭代 3：共享类型和 surface builder 落地

### 目标

让前端、API、Agent 三边使用同一套数据定义。

### 关键决策

- 在 `packages/shared` 放领域类型和协议 schema。
- 在 `packages/shared/src/builders/surfaces.ts` 里集中构造 surface。
- 明确 surfaceId 规划，不让前端和后端各自命名。

### 结果

当前这些核心 surface 都已经固定：

- `session-empty-state`
- `message:{messageId}`
- `steps:{runId}`
- `artifact:{artifactId}`
- `artifact:{runId}:actions`
- `clarification:{runId}`
- `approval:{runId}`
- `error:{runId}`

## 迭代 4：API 协调器和内存 store 跑通

### 目标

先让整条运行链路在本地可跑，再谈数据库和 worker。

### 关键决策

- 用 `InMemoryAppStore` 先接住 session、message、run、artifact、approval、run_events。
- 用 `RunCoordinator` 统一驱动：
  - run 状态
  - AG-UI 事件
  - A2UI surface
  - clarification / approval / error

### 结果

当前项目已经具备完整的“创建 run -> 流式推送 -> surface 更新 -> 用户动作回传”的最小闭环。

## 迭代 5：前端壳层和轻量 A2UI renderer

### 目标

先把产品体验做成能看的形态，而不是只有 API。

### 关键决策

- `Next.js 16` 负责静态 app shell。
- 自己实现轻量 `A2UI renderer`，不额外引入复杂运行时。
- 前端只做两件事：
  - 维护协议状态
  - 渲染协议结果

### 结果

页面已经具备：

- 左侧会话列表
- 中间聊天区
- 右侧工作区
- 底部输入框
- 空态建议、步骤、assistant message、artifact、approval、clarification

## 迭代 6：按 Figma 原型重做页面骨架

### 目标

不再自己发挥，尽量贴近 `figma` 文件夹里的交互骨架。

### 关键决策

- 工作区采用原型中的右侧 panel 逻辑。
- 空态、聊天区、步骤区、workspace 的节奏按原型调整。
- artifact 不再堆成一屏，而是按“浏览器加载 -> 内容展示 -> 结果沉淀”的顺序出现。

### 结果

当前 UI 已经不是纯技术 demo，而是明显朝产品交互形态靠近。

## 迭代 7：研究链路从 mock 扩展到 live

### 目标

让项目不只是看起来能跑，而是真的能发起研究请求。

### 关键决策

- 保留 `mock` 作为默认模式，方便本地演示和稳定测试。
- 引入 `live` 模式，支持：
  - `OPENAI_API_KEY`
  - `OPENAI_API_BASE`
  - `TAVILY_API_KEY`
- agent research 逻辑改成可走真实模型和搜索。

### 结果

项目现在已经可以在本地切到 `live`，并得到真实 research 结果。

## 迭代 8：live 模式联调与修复

### 目标

排查“为什么命令行探针能成功，但页面 run 仍然失败”。

### 关键问题

1. `gpt-5-mini` 对某些参数组合不兼容。
2. `deepagents` 的部分配置写法和预期不一致。
3. Tavily 工具失败时会把整条链路打崩。
4. 最关键的一次问题是：
   - 独立调用 `researchPrompt()` 时传入了 `OPENAI_API_BASE`
   - 但 `RunCoordinator -> researchPrompt()` 这条主链路漏传了 `openaiApiBase`
   - 结果 `/runs` 走的是默认 OpenAI 地址，于是企业代理 key 报 `401 Incorrect API key`

### 修复结果

- `research.ts` 修复了模型配置和 Tavily 容错。
- `run-coordinator.ts` 已把 `openaiApiBase` 沿主链路传入。
- 这说明页面 run 和命令行探针终于走到了同一套 live 配置上。

## 迭代 9：本地运行和调试稳定性整理

### 目标

让本地开发不至于因为环境问题反复卡住。

### 关键现象

- `node --watch` 容易触发 `EMFILE: too many open files, watch`
- 受限终端环境里，直接监听本地端口可能失败
- SSE `replay=1` 容易让旧失败事件看起来像“新请求又失败了”

### 当前经验

- 做局部验证时，优先用单进程、不带 watch 的方式启动服务。
- 调 SSE 问题时，要先确认看的是不是旧 run 的 replay。
- 调 live 问题时，先验证：
  - 当前 run 是否是新建的
  - 当前 API 是否真的是 `live`
  - `OPENAI_API_BASE` 是否沿 `/runs` 主链路传到了 research 层

## 迭代 10：动态步骤树与可回溯 artifact workspace

### 目标

解决“右侧 workspace 只剩最后一个结果、browser 会被 table 覆盖”的问题，让 artifact 真正变成可回溯的产物。

### 关键决策

- 不再把所有结果反复写进同一个 `artifact:{runId}:main`。
- 引入 `AgentPlan + PlannedStep`，把步骤树和 artifact 绑定关系显式建模。
- `RunStep` 新增：
  - `parentStepId`
  - `sequence`
  - `artifactId`
  - `artifactKind`
- `ArtifactRecord` 新增：
  - `stepId`
  - `sequence`
- `RunCoordinator` 改成：
  1. 先 `planResearchRun()`
  2. 再 materialize 成两层步骤树
  3. 逐个执行叶子步骤
  4. 每个叶子步骤最多产出一个 artifact
- 右侧 workspace 不再固定看某个 run 的单一 main surface，而是按 `artifactId` 显示独立 artifact surface。

### 结果

- browser、table、markdown、code 不会再互相覆盖。
- 中间步骤区点到哪个叶子步骤，右侧就能回看对应 artifact。
- 默认显示最新 artifact，但用户手动点回旧产物后，会进入 pinned 状态，不会再被新产物抢走。
- 刷新后可以通过 `run_events` replay 恢复步骤树和 artifact surface。

## 迭代 11：引入 Deep Agents planning 作为前置规划层

### 目标

不再把流程写死成固定三步，而是让 Agent 先规划，再按计划执行。

### 关键决策

- 在 `apps/agent` 增加两段能力：
  - `planResearchRun(prompt, options)`
  - `executePlannedStep(step, context, options)`
- `deepagents` 的角色被明确为：
  - 负责底层 planning 能力
  - 负责 live research 结构化结果生成
  - 不直接决定前端协议和 UI 生命周期
- raw todos 不直接暴露给前端，前端只消费我们自己定义的 `AgentPlan`。
- `mock` 和 `live` 都统一到“先规划、再逐步产物化”的合同。

### 结果

- 当前步骤树已经不是固定 `Shape the research plan / Search and review sources / Assemble artifact outputs`。
- 最终主结果也不再固定偏向 `table`。
- 哪些 artifact 会出现、出现顺序如何，已经可以由 agent planning 决定。

## 迭代 12：workspace 交互细节修正

### 目标

把已经跑通的工作区交互，修到真正可用。

### 关键问题

1. 点击左侧步骤时，父步骤会意外折叠。
2. 右侧 workspace 主体没有内边距。
3. 右侧 workspace 主体不能滚动，底部内容看不到。

### 修复结果

- `TimelineItem` 结构拆成“标题行”和“详情体”两层，点击事件显式 `stopPropagation()`，避免选中子步骤时把父节点折叠掉。
- workspace 主查看区增加了内边距。
- workspace 主查看区改成可纵向滚动。

### 当前体验

- 点击步骤切换 artifact 时，当前流程树不会被意外收起。
- 右侧 artifact 阅读体验明显更接近真实产品，而不是只够开发联调的工程态。

## 迭代 13：PostgreSQL + Redis 主链路接入

### 目标

把当前“页面能跑，但一刷新和一重启就丢历史”的状态，升级成真正可持久化、可排队执行的后端主链路。

### 为什么要接 PostgreSQL

- `PostgreSQL` 负责“存真相”。
- 它保存：
  - `sessions`
  - `messages`
  - `runs`
  - `run_steps`
  - `artifacts`
  - `approval_requests`
  - `run_events`
  - `pending_clarifications`
- 这样页面刷新、API 重启、重新部署后，历史会话和 artifact 都不会丢。

### 为什么要接 Redis

- `Redis` 负责“做实时和调度”。
- 一方面它承载 `run` 队列，让 API 不再自己跑长任务。
- 另一方面它负责实时事件分发，让 worker 推出来的 `AG-UI` 事件可以被 SSE 立刻转发到前端。

### 关键决策

- 保留 `memory` 和 `postgres` 双模式切换。
- `memory` 模式继续适合本地轻量开发。
- `postgres` 模式下强制要求：
  - `DATABASE_URL`
  - `REDIS_URL`
- `apps/agent` 默认转成纯 worker。
- `packages/db` 不再只是 schema，占用了真正的基础设施职责：
  - `PostgresAppStore`
  - `RedisRunEventBus`
  - BullMQ queue / worker helper
  - drizzle migration

### 结果

- API 在 `postgres` 模式下只负责写库、入队、返回状态。
- worker 负责真正执行 run。
- `run_events` 已经可以落 PostgreSQL，并通过 Redis 实时分发。
- 本地已经补上：
  - `docker-compose.yml`
  - `pnpm infra:up`
  - `pnpm infra:down`
  - `pnpm db:generate`
  - `pnpm db:migrate`
- `drizzle` 初始 migration 已生成。

## 迭代 14：本地基础设施联调与端口隔离

### 目标

把数据库和缓存真正跑起来，并解决“本机已有 PostgreSQL / Redis 导致串库、串缓存”的环境问题。

### 关键问题

1. 机器本地已经有 PostgreSQL 占用 `5432`。
2. 机器本地已经有 Redis 占用 `6379`。
3. `drizzle-kit` 默认不会自动读取根目录 `.env`，导致迁移脚本拿不到 `DATABASE_URL`。

### 修复结果

- Docker Compose 端口改成：
  - PostgreSQL：`55432`
  - Redis：`56379`
- `.env` 和 `.env.example` 已同步切到新的本地端口。
- `packages/db/drizzle.config.ts` 增加了根目录 `.env` 兜底读取逻辑。
- 本地已经实际完成：
  - `pnpm infra:up`
  - `pnpm db:migrate`
  - `pnpm dev`

### 当前结果

- PostgreSQL 和 Redis 已经能和当前项目稳定隔离运行。
- `postgres` 模式不再误连到你电脑里其他项目的本地数据库。
- 数据表已经真正建到 PostgreSQL 中，不再只是“代码里声明了 schema”。

## 迭代 15：数据库接入后的前端验收与刷新恢复修复

### 目标

确认数据库接入后，前端不是“只能看到一次结果”，而是真的能在刷新和切换 session 后恢复上下文。

### 验收结论

- 新建 session 成功。
- 新建 run 成功，并且能通过队列交给 worker 执行。
- `run_steps / artifacts / run_events` 都能落 PostgreSQL。
- 刷新页面后，session 列表和历史 run 能重新加载回来。
- 点击步骤切换 `browser / table / markdown / code` artifact 正常。

### 暴露出来的问题

用户如果手动切到旧 artifact，例如 `browser`，刷新后右侧 workspace 会重新回到 `latestArtifactId`，不会保留用户刚刚选中的 artifact。

### 修复结果

- 前端增加了本地 UI 状态持久化，保存：
  - `activeSessionId`
  - `activeRunIdBySession`
  - `selectedArtifactIdByRun`
  - `isArtifactPinnedByRun`
- 首屏恢复阶段增加了 “Restoring saved workspace...” 状态，避免先闪空态再回填。
- 刷新后如果用户之前手动切到了旧 artifact，workspace 现在会继续停留在该 artifact 上。

### 当前体验

- “数据库里有历史” 和 “前端真的恢复到了用户刚才看的位置” 这两件事现在已经对齐。
- 同一浏览器里，刷新页面后能恢复：
  - 当前 session
  - 当前 run
  - 当前选中的 artifact
- 这让 workspace 从“有历史数据”真正变成了“可持续继续工作”的状态。

## 当前状态总结

到目前为止，这个仓库已经完成了这些关键目标：

- 架构层：monorepo 已稳定
- 协议层：AG-UI + A2UI 已落地
- 页面层：Figma 方向的壳层已成型，workspace 可按步骤回看产物
- 运行层：mock / live 已打通
- 交互层：clarification / approval / artifact actions 已可用
- 规划层：deepagents planning 已接入主链路
- 基础设施层：PostgreSQL + Redis 已接入主链路
- 恢复层：刷新后可以恢复 session / run / artifact workspace

但它还不是生产版，当前最明显的缺口仍然是：

- BullMQ 重试、死信队列和运行监控还没补
- run 取消、超时、恢复策略还不完整
- 登录和权限没开始
- 导出文件还停留在审批和交互层，没有真正生成交付文件

## 下一阶段建议

最推荐的迭代顺序是：

1. 补 BullMQ 重试、死信队列和运行监控
2. 增加 run 取消、超时和恢复策略
3. 让 remote agent transport 成为正式路径
4. 再做导出文件、登录、部署收口

## 关联文档

- [ai-agent-technical-design.md](/Users/hundred/Documents/code/my-manus/docs/ai-agent-technical-design.md)
- [current-project-architecture.md](/Users/hundred/Documents/code/my-manus/docs/current-project-architecture.md)
