# Outlook Mail Station

Outlook Mail Station 是一个面向账号池管理和业务对接的 Outlook 邮件站。

它提供三类核心能力：

- 后台管理：用户、站点、邮箱池、邮件查看、发信、分享链接
- 业务开放接口：基于用户级 API Key 的邮箱消费、查信、分享、按站点回退
- 公开分享：基于分享 token 的只读访问页

接口说明见 [docs/API_INTEGRATION.md](./docs/API_INTEGRATION.md)。

## 技术栈

- Python 3.12
- FastAPI
- SQLModel + SQLite
- React + TypeScript + Vite

## 核心模型

### 用户池

- 每个普通用户拥有自己的邮箱池
- 每个普通用户拥有自己的 API Key
- 业务开放接口始终绑定到某一个普通用户

### 站点

- 站点由后台维护，使用唯一 `code`
- 业务系统消费邮箱时必须带 `site_code`
- 邮箱的消费和回退都按站点维度处理

### 邮箱

- 邮箱归属于某个用户池
- 邮箱可以同步收件箱、垃圾箱、发件箱
- 邮箱可以生成公开分享链接

### 公开分享

- 分享链接由单个邮箱生成
- 公开页通过分享 token 读取邮件内容
- 同一个邮箱同一时间只保留一条有效分享链接

## 权限模型

### 后台管理接口

- 后台页面和管理接口使用管理员 Bearer Token
- 用于用户管理、站点管理、邮箱导入、账号池维护

### 业务开放接口

- 业务开放接口统一使用普通用户自己的 API Key
- 每次请求都会先解析 API Key，再绑定到对应用户池
- 所有业务开放接口都只允许访问该用户池下的启用邮箱

### 公开分享接口

- 公开分享接口使用分享 token
- 分享 token 只提供只读访问能力

## 当前开放接口

业务开放接口统一挂在 `/api/open/*`：

- `POST /api/open/random-email`
- `GET /api/open/mailboxes/{email}/latest`
- `GET /api/open/mailboxes/{email}/messages`
- `POST /api/open/mailboxes/{email}/share`
- `POST /api/open/mailboxes/{email}/share/revoke`
- `POST /api/open/mailboxes/{email}/sites/{site_code}/release`

公开分享接口统一挂在 `/api/public/*`：

- `GET /api/public/shares/{token}`
- `POST /api/public/shares/{token}/sync`
- `GET /api/public/shares/{token}/messages/{message_id}`

## 快速开始

### 1. 准备环境

```bash
cp .env.example .env
uv sync
```

至少需要配置：

- `OUTLOOK_MAIL_STATION_ADMIN_PASSWORD`
- `OUTLOOK_MAIL_STATION_ADMIN_JWT_SECRET`

### 2. 启动后端

```bash
uv run python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8015
```

Windows 也可以直接使用：

```powershell
.\start_backend.ps1
```

或：

```bat
start_backend.bat
```

后端地址：

```text
http://localhost:8015
```

### 3. 启动前端开发服务器

```bash
cd frontend
npm install
npm run dev
```

前端开发地址：

```text
http://localhost:5174
```

### 4. 构建前端

```bash
cd frontend
npm install
npm run build
```

构建产物输出到：

```text
./backend/static
```

构建完成后，直接访问后端地址即可使用完整站点。

## 后台能力

- 管理员登录
- 用户管理
- 用户 API Key 查看与重置
- 站点管理
- 邮箱导入
- 邮箱池查询、筛选、导出
- 随机消费 / 手动消费 / 按站点回退
- 邮件同步与查看
- SMTP 发信
- 公开分享链接生成

## 导入格式

后台导入接口支持文本和 JSON 两种格式。

### 文本格式

```text
example@outlook.com----password
example@outlook.com----password----client_id----refresh_token
```

### JSON 格式

```json
[
  {
    "email": "example@outlook.com",
    "password": "password",
    "clientId": "xxxx",
    "refreshToken": "xxxx"
  }
]
```

## 业务开放接口使用方式

调用 `/api/open/*` 时，使用普通用户自己的 API Key：

```http
X-API-Key: user-owned-api-key
```

或：

```http
Authorization: Bearer user-owned-api-key
```

业务系统调用流程通常是：

1. 用 `/api/open/random-email` 按站点领取邮箱
2. 用 `/api/open/mailboxes/{email}/latest` 或 `/messages` 获取邮件
3. 需要外部查看时，用 `/api/open/mailboxes/{email}/share` 生成分享链接
4. 业务结束后，用 `/api/open/mailboxes/{email}/sites/{site_code}/release` 回退该站点占用

## 邮件同步策略

- 开放接口默认按需同步
- 收件相关接口优先同步 `inbox + junk`
- 同一邮箱在冷却时间内优先使用缓存
- 已被站点占用的活跃邮箱会进行后台轻量预热同步

相关配置：

```env
OUTLOOK_MAIL_STATION_OPEN_API_SYNC_COOLDOWN_SECONDS=60
OUTLOOK_MAIL_STATION_ACTIVE_MAILBOX_SYNC_INTERVAL_SECONDS=5
OUTLOOK_MAIL_STATION_ACTIVE_MAILBOX_SYNC_STALE_SECONDS=8
OUTLOOK_MAIL_STATION_ACTIVE_MAILBOX_SYNC_LIMIT=30
```

## Docker 部署

### 本地构建运行

```bash
docker compose up -d --build
```

默认访问地址：

```text
http://localhost:8015
```

### 数据持久化

当前默认挂载目录：

```text
./data:/app/data
```

数据库默认位于：

```text
./data/outlook_mail_station.db
```

### GHCR 部署

仓库默认镜像：

```text
ghcr.io/simple199589-maker/outlook-mail-station
```

完整部署说明见 [docs/GHCR_DEPLOY.md](./docs/GHCR_DEPLOY.md)。

## 项目文档

- [API 对接文档](./docs/API_INTEGRATION.md)
- [GHCR 部署文档](./docs/GHCR_DEPLOY.md)
