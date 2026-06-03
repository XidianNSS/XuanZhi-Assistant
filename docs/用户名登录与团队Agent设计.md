# 用户名登录与团队 Agent 设计

更新日期：2026-06-03

## 设计目的

玄知面向的是一台设备上部署一套 OpenClaw 的小团队场景。团队成员不应该在登录页选择 agent，而应该只输入用户名和密码；后端根据账号自动切换到该用户绑定的 OpenClaw agent 和 workspace。

`main` 被视为主 agent 对应的管理员账号。它使用 OpenClaw 默认 workspace，并在前端拥有团队管理入口，用于查看其他用户、agent、workspace 和状态。

## 账号密码保存在哪里

OpenClaw 当前不直接承担玄知 Web 登录账号，因此账号注册表是玄知需要补齐的能力。当前实现不使用数据库，默认写入后端运行目录：

```text
.xuanzhi/accounts.json
```

也可以通过环境变量指定到设备侧或 OpenClaw 目录附近：

```text
XUANZHI_ACCOUNT_FILE=/home/lin123/.openclaw/xuanzhi/accounts.json
```

该文件只保存用户基础信息与 bcrypt 密码哈希，不保存明文密码。测试环境会跳过文件写入，避免污染测试夹具。本地账号文件已加入 `.gitignore`，防止误提交。

## workspace 命名规则

用户名来自注册初始化界面输入的用户名。后端负责把用户名转换为 OpenClaw workspace：

| 用户 | workspace |
|---|---|
| `main` | `/home/lin123/.openclaw/workspace` |
| 普通用户 | `/home/lin123/.openclaw/workspace-xuanzhi-<username>` |

用户名会做路径安全化处理，保留字母、数字、下划线、短横线以及 Unicode 字母数字。

## 后端职责

- `/api/auth/register` 使用用户名和密码创建账号，并为该用户创建本地 agent 映射。
- `/api/auth/login` 使用用户名和密码校验，登录成功后返回当前用户绑定的 agent。
- `main` 登录后绑定 `gatewayAgentId: main`，workspace 指向 OpenClaw 主 workspace。
- 普通用户登录后按用户名推导独立 workspace。
- 前端账号切换和 agent 绑定不直接操作 OpenClaw；全部由后端统一编排。
- OpenClaw 已能完成的 agent、session、workspace、file sync、chat send 操作继续走 OpenClaw RPC。

## 前端职责

- 登录页只展示用户名和密码。
- 注册页收集用户名、显示名称和密码。
- 登录后只显示当前用户对应的 agent，不展示 agent 选择列表作为登录入口。
- `main` 管理员拥有“团队管理”工作区，可以查看用户与 agent 的绑定关系。

## 为什么这样设计

这个方案把团队账号体系留在玄知，把 agent/session/workspace 的事实来源继续交给 OpenClaw。这样既能满足小团队“一个人一个 agent”的使用方式，又避免玄知重新实现一套数据库式 agent 平台。

长期方向是继续减少玄知后端的状态：账号体系如 OpenClaw 后续提供 identity 能力，也可以迁移到 OpenClaw；但在当前阶段，用户名密码登录是玄知为了团队使用体验必须补齐的边界能力。
