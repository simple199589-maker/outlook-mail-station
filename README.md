# Outlook Mail Station

独立 Outlook 邮件站点，用于维护批量导入邮箱、同步收件箱/发件箱、发送邮件与生成临时授权公开链接。

对接文档见：

```text
./docs/API_INTEGRATION.md
```

## 技术栈

- Python 3.12.10 + `uv`
- FastAPI + SQLModel + SQLite
- React + TypeScript + Vite

## 快速开始

### 1. 准备 Python

```bash
pyenv install 3.12.10
pyenv local 3.12.10
uv sync
```

### 2. 启动后端

```bash
uv run python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8015
```

Windows 也可以直接使用：

```powershell
.\start_backend.ps1
```

或：

```bat
start_backend.bat
```

建议先复制环境变量模板：

```bash
cp .env.example .env
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

后端 API 地址：

```text
http://localhost:8015
```

### 4. 构建前端

```bash
cd frontend
npm install
npm run build
```

构建后静态资源会输出到：

```text
./backend/static
```

此时直接运行后端即可访问完整站点：

```text
http://localhost:8015
```

## 导入格式

支持两种导入格式：

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

## 默认能力

- 左侧邮箱列表与搜索
- 当前邮箱卡片
- 收件箱 / 发件箱切换
- 10 秒自动刷新倒计时
- Outlook IMAP 同步
- SMTP 发信
- 临时授权公开链接
- 同邮箱仅保留一条最新临时授权，默认有效期 30 天
- 管理员登录
- 固定密钥 / 固定 Bearer 的开放 API

## 管理员登录

通过以下环境变量启用：

```text
OUTLOOK_MAIL_STATION_ADMIN_PASSWORD=你的后台密码
OUTLOOK_MAIL_STATION_ADMIN_JWT_SECRET=你的JWT签名密钥
```

前端会在访问后台页面时要求管理员登录。

## 开放接口认证

开放接口不入库，直接读取环境变量中的固定密钥：

```text
OUTLOOK_MAIL_STATION_OPEN_API_KEY=replace-with-fixed-key
OUTLOOK_MAIL_STATION_OPEN_API_BEARER=replace-with-fixed-bearer
```

调用时任选一种：

```http
X-API-Key: replace-with-fixed-key
```

或：

```http
Authorization: Bearer replace-with-fixed-bearer
```

## 开放接口

### 1. 批量导入邮箱

```http
POST /api/open/import
```

请求体示例：

```json
{
  "batch_code": "batch-20260405",
  "enabled": true,
  "data": "demo@outlook.com----password----client_id----refresh_token"
}
```

### 2. 随机取邮箱

```http
POST /api/open/random-email
```

请求体示例：

```json
{
  "domain": "outlook.com",
  "batch_code": "batch-20260405",
  "lease_seconds": 1800
}
```

### 3. 获取指定邮箱最后一封收件

```http
GET /api/open/mailboxes/{email}/latest?refresh=true
```

### 4. 获取指定邮箱邮件列表

```http
GET /api/open/mailboxes/{email}/messages?refresh=true
```

支持按时间过滤：

```http
GET /api/open/mailboxes/{email}/messages?refresh=true&since=2026-04-05T00:00:00+08:00
```

### 5. 为指定邮箱生成临时授权链接

```http
POST /api/open/mailboxes/{email}/share
```

请求体示例：

```json
{
  "days": 30
}
```

### 6. 手动废止指定邮箱临时授权

```http
POST /api/open/mailboxes/{email}/share/revoke
```

### 7. 释放随机取到的邮箱租约

```http
POST /api/open/mailboxes/{email}/lease/release
```

## 邮件同步策略

- 不做全量后台轮询
- 默认在开放接口调用时按需触发同步
- 同一邮箱在短时间内会复用最近缓存，避免重复 IMAP 拉取
- 这个时间窗口由 `OUTLOOK_MAIL_STATION_OPEN_API_SYNC_COOLDOWN_SECONDS` 控制

## Docker

### 部署清单

部署前请确认这几项：

1. 准备好 `.env`
2. 准备好宿主机持久化目录 `./data`
3. 在项目根目录执行 `docker compose up -d --build`

目录建议长这样：

```text
outlook-mail-station/
├── .env
├── docker-compose.yml
├── Dockerfile
└── data/
```

### 哪些会挂载到硬盘

当前 `docker-compose.yml` 里，**只有一个目录会挂载到宿主机硬盘**：

```text
./data  ->  /app/data
```

用途：

- 存放 SQLite 数据库文件
- 容器重建后数据仍然保留

如果你使用默认配置，数据库最终会在宿主机这里：

```text
./data/outlook_mail_station.db
```

### 哪些不会挂载到硬盘

下面这些内容不会单独挂载：

- 前端静态资源
  说明：已经在镜像构建时打包进镜像里
- 后端源码
  说明：同样已经打进镜像
- `.env`
  说明：不是挂载进去，而是通过 `env_file: .env` 在启动时注入成容器环境变量

### `.env` 会不会自动生效

会。

当前 `docker-compose.yml` 已经写了：

```yaml
env_file:
  - .env
```

只要你在项目根目录下有 `.env`，并且在这个目录执行：

```bash
docker compose up -d --build
```

Compose 就会自动读取它。

### 本地构建与运行

```bash
docker compose up -d --build
```

默认访问：

```text
http://localhost:8015
```

数据目录：

```text
./data
```

### 通过 GHCR 直接启动

仓库默认会把镜像发布到：

```text
ghcr.io/simple199589-maker/outlook-mail-station
```

如果你想在服务器上直接拉取镜像启动，使用：

```bash
docker pull ghcr.io/simple199589-maker/outlook-mail-station:latest
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

默认拉取的 tag 是：

```text
ghcr.io/simple199589-maker/outlook-mail-station:latest
```

如果你要改成自己的仓库或固定版本，可以覆盖环境变量：

```bash
export OUTLOOK_MAIL_STATION_IMAGE=ghcr.io/<你的用户名或组织>/outlook-mail-station:v1.0.0
docker compose -f docker-compose.ghcr.yml up -d
```

完整说明见：

```text
./docs/GHCR_DEPLOY.md
```

### Linux 部署时建议挂载方式

如果你在服务器上部署，建议显式准备一个持久化目录，例如：

```text
/srv/outlook-mail-station/data
```

然后把 compose 里的挂载改成：

```yaml
volumes:
  - /srv/outlook-mail-station/data:/app/data
```

### Windows 部署时建议挂载方式

如果你在 Windows 上直接部署，保持当前相对路径就够了：

```yaml
volumes:
  - ./data:/app/data
```

这样数据库会落在项目目录下的：

```text
outlook-mail-station\data\outlook_mail_station.db
```

### 最小上线要求

最少需要准备这些：

1. `.env`
   这里至少改掉管理员密码、JWT 密钥、开放接口固定密钥
2. `./data`
   这是唯一必须持久化挂载的目录
3. `8015` 端口
   确保宿主机没被占用

## GitHub 发布

仓库已包含：

```text
.github/workflows/docker-publish.yml
```

推送到 `main` 或 `v*` tag 时，会自动发布镜像到：

```text
ghcr.io/simple199589-maker/outlook-mail-station
```

默认分支推送成功后，至少会生成这些标签：

```text
latest
main
sha-<commit>
```

如果你打了 `v*` tag，还会额外生成对应版本标签，例如：

```text
v1.0.0
```
