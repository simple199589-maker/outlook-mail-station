# GHCR 部署与启动

本文档用于从 `ghcr.io` 直接拉取镜像并启动 Outlook Mail Station。

## 1. 镜像地址

当前仓库默认发布到：

```text
ghcr.io/simple199589-maker/outlook-mail-station
```

默认分支 `main` 推送成功后，会更新：

```text
:latest
:main
:sha-<commit>
```

打 `v*` tag 时，还会额外发布对应版本 tag。

## 2. 服务器准备

最少需要准备：

1. Docker Engine + Docker Compose
2. `.env`
3. 数据目录 `./data`

建议目录结构：

```text
outlook-mail-station/
├── .env
├── docker-compose.ghcr.yml
└── data/
```

## 3. 从拉取到部署完成

当前这个 GHCR 镜像是公开的，不需要执行 `docker login`。

下面按顺序执行即可。

### 第 1 步：准备环境变量和数据目录

先复制示例文件：

```bash
cp .env.example .env
mkdir -p data
```

至少要改这些：

- `OUTLOOK_MAIL_STATION_ADMIN_PASSWORD`
- `OUTLOOK_MAIL_STATION_ADMIN_JWT_SECRET`
- `OUTLOOK_MAIL_STATION_OPEN_API_KEY` 或 `OUTLOOK_MAIL_STATION_OPEN_API_BEARER`

### 第 2 步：拉取镜像

```bash
docker pull ghcr.io/simple199589-maker/outlook-mail-station:latest
```

如果你要拉固定版本，也可以改成：

```bash
docker pull ghcr.io/simple199589-maker/outlook-mail-station:v1.0.0
```

### 第 3 步：启动容器

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

### 第 4 步：检查容器是否启动成功

```bash
docker ps
```

你应该能看到容器名：

```text
outlook-mail-station
```

### 第 5 步：确认页面可访问

```text
http://localhost:8015
```

如果访问不通，可以查看日志：

```bash
docker logs -f outlook-mail-station
```

到这里就算 Docker 部署完成了。

## 4. 使用指定 tag 或你自己的仓库

默认 compose 会拉取：

```text
ghcr.io/simple199589-maker/outlook-mail-station:latest
```

如果你要切换成自己的镜像或固定版本，可以在启动前覆盖：

```bash
export OUTLOOK_MAIL_STATION_IMAGE=ghcr.io/<你的用户名或组织>/outlook-mail-station:v1.0.0
docker compose -f docker-compose.ghcr.yml up -d
```

PowerShell 写法：

```powershell
$env:OUTLOOK_MAIL_STATION_IMAGE = "ghcr.io/<你的用户名或组织>/outlook-mail-station:v1.0.0"
docker compose -f docker-compose.ghcr.yml up -d
```

## 5. 更新镜像

后续更新时执行：

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

## 6. 数据持久化

当前 compose 会把宿主机目录挂载到容器内：

```text
./data -> /app/data
```

数据库默认会落到：

```text
./data/outlook_mail_station.db
```
