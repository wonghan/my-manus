# My Manus

一个基于 `artifact` 的 AI Agent 平台原型。

当前重点是把 Agent 的执行过程、步骤树、artifact 结果和人机协作过程做成可观察、可回溯、可恢复的产品体验，而不是只返回一段黑盒答案。

## 界面预览

### 首页空态

![My Manus home preview](./docs/images/preview_home.png)

### 对话与工作区

![My Manus chat preview](./docs/images/preview_chat.png)

当前版本采用：

- `Next.js 16` 作为前端壳层
- `Express` 作为 API 服务
- `LangChain / deepagents` 作为 Agent 研究链路
- `AG-UI` 作为 SSE 事件协议
- `A2UI v0.8` 作为 Agent-owned UI 协议
- `PostgreSQL` 作为持久化真相源
- `Redis + BullMQ` 作为队列和实时事件层

这版项目的目标不是做“黑盒自动代理”，而是做一套可观察、可追问、可沉淀 artifact 的研究型 Agent 平台。

## 当前平台能做什么

- 支持会话列表、聊天区、右侧工作区的基础产品形态
- 支持 `mock` 和 `live` 两种 Agent 模式
- 支持步骤时间线、assistant 正文、artifact 展示
- 支持动态步骤树，以及点击步骤回看对应 artifact
- 支持 clarification 和 approval 这两类基础 HITL 交互
- 支持通过 `AG-UI + A2UI` 协议流式驱动前端界面
- 支持 `memory` 和 `postgres` 两种存储模式切换
- 支持刷新后恢复历史 session / run / artifact workspace
- 支持手动切到旧 artifact 后刷新仍保持当前查看结果

## PostgreSQL 和 Redis 各负责什么

- `PostgreSQL` 负责“存真相”。
  保存 `sessions / messages / runs / run_steps / artifacts / approval_requests / run_events / pending_clarifications`，这样页面刷新、服务重启、重新部署后，历史会话和 artifact 不会丢。
- `Redis` 负责“做实时和调度”。
  一方面作为 `run` 队列和 worker 调度层，避免 API 进程直接跑长任务；另一方面负责实时事件分发，让 SSE 可以接到 worker 推出来的 run 事件。

## 仓库结构

- `apps/web`
  - Next.js 前端
- `apps/api`
  - Express API
- `apps/agent`
  - Agent 运行时
- `packages/shared`
  - 协议、共享类型、surface builders
- `packages/db`
  - Drizzle PostgreSQL schema
- `docs`
  - 技术方案、架构说明、迭代历史

## 快速启动

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制一份环境变量模板：

```bash
cp .env.example .env
```

默认情况下：

- `AGENT_EXECUTION_MODE=mock`
- 不需要任何 API key
- 适合先把页面和交互链路跑起来
- `APP_STORAGE_MODE=memory`
- 不需要 PostgreSQL / Redis

如果你想使用真实模型和搜索，需要在 `.env` 中补充：

```bash
AGENT_EXECUTION_MODE=live
OPENAI_API_BASE=
OPENAI_API_KEY=
TAVILY_API_KEY=
```

如果你想启用持久化和 worker 模式，推荐这样启动：

```bash
pnpm infra:up
cp .env.example .env
```

然后把 `.env` 里改成：

```bash
APP_STORAGE_MODE=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/my_manus
REDIS_URL=redis://localhost:56379
```

再执行：

```bash
pnpm db:migrate
pnpm dev
```

### 3. 启动项目

```bash
pnpm dev
```

默认端口：

- `web`: `http://localhost:3000`
- `api`: `http://localhost:4300`
- `agent`: worker 进程，不再作为主链路 HTTP 服务运行

## 常用命令

```bash
pnpm dev
pnpm infra:up
pnpm infra:down
pnpm db:generate
pnpm db:migrate
pnpm check
pnpm test
pnpm build
```

## 当前实现说明

当前项目已经支持两种运行模式：

- `memory`
  - 最适合本地快速开发
  - API 直接执行 run
  - agent worker 进程会保持空闲
- `postgres`
  - 适合作为后续部署主路径
  - API 只负责写库、入队、返回状态
  - agent 作为纯 worker 消费 Redis 队列

当前仍然不是最终生产版，因为还没有补分布式锁、重试退避、死信队列、登录权限这些生产级能力。

如果你想看更完整的设计说明，请看：

- [技术方案](./docs/ai-agent-technical-design.md)
- [当前架构](./docs/current-project-architecture.md)
- [迭代历史](./docs/iteration-history.md)

## 小提示

如果本地开发时遇到 Node `watch` 上限导致的 `EMFILE`，先关闭重复的开发进程，再重新执行 `pnpm dev`。
