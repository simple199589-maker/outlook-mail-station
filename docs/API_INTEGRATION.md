# Outlook Mail Station 对接文档

本文档面向以下两类对接方：

1. 管理后台页面调用方
2. 外部系统通过固定密钥调用开放接口的调用方

本文档对应项目目录：

```text
outlook-mail-station/
```

默认服务地址示例：

```text
http://localhost:8015
```

---

## 1. 认证说明

### 1.1 管理员后台认证

后台页面与普通管理接口使用管理员登录认证。

相关环境变量：

```env
OUTLOOK_MAIL_STATION_ADMIN_PASSWORD=你的后台密码
OUTLOOK_MAIL_STATION_ADMIN_JWT_SECRET=你的JWT签名密钥
```

登录成功后会返回一个 Bearer Token，后续后台接口需要带：

```http
Authorization: Bearer <管理员登录返回的 access_token>
```

### 1.2 开放接口认证

开放接口统一挂在：

```text
/api/open/*
```

开放接口不走管理员登录，不入库 API Key，直接读取环境变量中的固定值。

可选两种认证方式，任选一种：

#### 方式 A：固定 API Key

环境变量：

```env
OUTLOOK_MAIL_STATION_OPEN_API_KEY=your-fixed-key
```

请求头：

```http
X-API-Key: your-fixed-key
```

#### 方式 B：固定 Bearer

环境变量：

```env
OUTLOOK_MAIL_STATION_OPEN_API_BEARER=your-fixed-bearer
```

请求头：

```http
Authorization: Bearer your-fixed-bearer
```

---

## 2. 管理员接口

### 2.1 查询管理员登录状态

```http
GET /api/admin/auth/status
```

响应示例：

```json
{
  "enabled": true,
  "authenticated": false
}
```

字段说明：

- `enabled`
  说明：是否已配置管理员密码
- `authenticated`
  说明：当前请求头中的管理员 token 是否有效

### 2.2 管理员登录

```http
POST /api/admin/auth/login
Content-Type: application/json
```

请求体：

```json
{
  "password": "你的后台密码"
}
```

响应示例：

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

---

## 3. 开放接口总览

当前开放接口如下：

1. 批量导入邮箱
2. 随机取邮箱
3. 获取指定邮箱最新一封收件
4. 获取指定邮箱邮件列表
5. 为指定邮箱生成临时授权链接
6. 手动废止指定邮箱临时授权
7. 释放随机取到的邮箱租约

---

## 4. 开放接口详细说明

### 4.1 批量导入邮箱

```http
POST /api/open/import
Content-Type: application/json
```

认证：

```http
X-API-Key: your-fixed-key
```

请求体：

```json
{
  "batch_code": "batch-20260405",
  "enabled": true,
  "data": "demo@outlook.com----password----client_id----refresh_token"
}
```

字段说明：

- `batch_code`
  说明：导入批次标识，只入库，不在当前业务页面展示
- `enabled`
  说明：导入后是否启用该邮箱
- `data`
  说明：支持纯文本多行，也支持 JSON 数组

文本格式支持：

```text
邮箱----密码
邮箱----密码----client_id----refresh_token
邮箱----密码----client_id----refresh_token----备注
```

响应示例：

```json
{
  "total": 2,
  "created": 1,
  "updated": 1,
  "failed": 0,
  "items": [
    {
      "email": "demo1@outlook.com",
      "action": "created",
      "id": 11
    },
    {
      "email": "demo2@outlook.com",
      "action": "updated",
      "id": 12
    }
  ],
  "errors": []
}
```

### 4.2 随机取邮箱

```http
POST /api/open/random-email
Content-Type: application/json
```

请求体：

```json
{
  "domain": "outlook.com",
  "batch_code": "batch-20260405",
  "lease_seconds": 1800
}
```

字段说明：

- `domain`
  说明：指定邮箱域名，留空表示所有启用邮箱中随机
- `batch_code`
  说明：只从指定批次中取，留空表示不限批次
- `lease_seconds`
  说明：租约秒数，取到邮箱后会暂时锁定，避免重复发放

响应示例：

```json
{
  "id": 1,
  "email": "demo@outlook.com",
  "domain": "outlook.com",
  "batch_code": "batch-20260405",
  "lease_expires_at": "2026-04-05T12:30:00Z"
}
```

### 4.3 获取指定邮箱最后一封收件

```http
GET /api/open/mailboxes/{email}/latest?refresh=true
```

路径参数：

- `email`
  说明：目标邮箱地址

查询参数：

- `refresh`
  说明：是否尝试触发同步
  可选值：`true` / `false`
  默认值：`true`

响应示例：

```json
{
  "account_id": 1,
  "email": "demo@outlook.com",
  "message": {
    "id": 101,
    "folder": "inbox",
    "subject": "Your OpenAI code is 853703",
    "sender_name": "",
    "sender_email": "noreply@tm.openai.com",
    "recipient_summary": "demo@outlook.com",
    "preview": "Your OpenAI code is 853703 ...",
    "sent_at": "2026-04-05T08:11:22",
    "body_text": "Your OpenAI code is 853703 ...",
    "body_html": "<html>...</html>"
  }
}
```

如果邮箱没有邮件：

```json
{
  "account_id": 1,
  "email": "demo@outlook.com",
  "message": null
}
```

### 4.4 获取指定邮箱邮件列表

```http
GET /api/open/mailboxes/{email}/messages?refresh=true
```

查询参数：

- `refresh`
  说明：是否尝试触发同步
- `since`
  说明：只返回某个时间点之后的邮件
  格式：ISO8601
  例如：`2026-04-05T00:00:00+08:00`
- `folder`
  说明：文件夹类型
  可选值：`inbox` / `sent`
  默认值：`inbox`

说明：

- 当 `folder=inbox` 时，系统会同时返回 `inbox + junk`
- 当 `folder=sent` 时，只返回发件箱

响应示例：

```json
{
  "account_id": 1,
  "email": "demo@outlook.com",
  "count": 2,
  "items": [
    {
      "id": 101,
      "folder": "inbox",
      "subject": "Your OpenAI code is 853703",
      "sender_name": "",
      "sender_email": "noreply@tm.openai.com",
      "recipient_summary": "demo@outlook.com",
      "preview": "Your OpenAI code is 853703 ...",
      "sent_at": "2026-04-05T08:11:22"
    }
  ]
}
```

### 4.5 为指定邮箱生成临时授权链接

```http
POST /api/open/mailboxes/{email}/share
Content-Type: application/json
```

请求体：

```json
{
  "days": 30
}
```

说明：

- 同一个邮箱只保留一条最新授权
- 新授权生成时，会覆盖旧授权
- 旧授权链接会立即失效

响应示例：

```json
{
  "token": "ud561d2XWtKFtZPnfAWlZKN1j3M898YA",
  "url": "http://localhost:8015/share/ud561d2XWtKFtZPnfAWlZKN1j3M898YA",
  "expires_at": "2026-05-05T12:00:00Z"
}
```

### 4.6 手动废止指定邮箱临时授权

```http
POST /api/open/mailboxes/{email}/share/revoke
```

响应示例：

```json
{
  "ok": true,
  "email": "demo@outlook.com",
  "message": "当前邮箱的临时授权已废止"
}
```

### 4.7 释放随机取到的邮箱租约

```http
POST /api/open/mailboxes/{email}/lease/release
```

作用：

- 如果某个邮箱之前被 `/random-email` 接口分配过
- 且你不再需要继续占用它
- 可以主动释放，让它重新回到随机池

响应示例：

```json
{
  "ok": true,
  "email": "demo@outlook.com",
  "message": "邮箱租约已释放"
}
```

---

## 5. 邮件同步策略

当前系统不是后台定时轮询，而是 **按需同步**。

规则如下：

1. 调用开放接口时，如果 `refresh=true`，系统会尝试同步邮箱
2. 但同一个邮箱不会每次请求都重新 IMAP 拉取
3. 如果距离上次同步还没超过冷却时间，就优先使用缓存

冷却时间由环境变量控制：

```env
OUTLOOK_MAIL_STATION_OPEN_API_SYNC_COOLDOWN_SECONDS=60
```

含义：

- 例如设置为 `60`
- 那么同一个邮箱 60 秒内重复请求，会优先复用本地缓存

---

## 6. 常见错误码

### 401

表示认证失败。

常见原因：

- 没带 `X-API-Key`
- `X-API-Key` 不正确
- `Authorization: Bearer ...` 不正确
- 后台管理员 token 失效

响应示例：

```json
{
  "detail": "开放接口认证失败"
}
```

或：

```json
{
  "detail": "未登录管理员账号"
}
```

### 404

表示目标资源不存在。

常见原因：

- 邮箱不存在
- 分享链接不存在或已被覆盖
- 邮件不存在

响应示例：

```json
{
  "detail": "邮箱不存在"
}
```

### 400

表示请求格式错误或业务执行失败。

常见原因：

- `since` 时间格式不对
- SMTP 发信失败
- Outlook IMAP 登录失败

---

## 7. cURL 示例

### 7.1 导入邮箱

```bash
curl -X POST "http://localhost:8015/api/open/import" \
  -H "X-API-Key: your-fixed-key" \
  -H "Content-Type: application/json" \
  -d "{\"batch_code\":\"batch-20260405\",\"enabled\":true,\"data\":\"demo@outlook.com----password----client_id----refresh_token\"}"
```

### 7.2 随机取邮箱

```bash
curl -X POST "http://localhost:8015/api/open/random-email" \
  -H "X-API-Key: your-fixed-key" \
  -H "Content-Type: application/json" \
  -d "{\"domain\":\"outlook.com\",\"lease_seconds\":1800}"
```

### 7.3 获取最新一封邮件

```bash
curl "http://localhost:8015/api/open/mailboxes/demo@outlook.com/latest?refresh=true" \
  -H "X-API-Key: your-fixed-key"
```

### 7.4 获取某时间之后的邮件列表

```bash
curl "http://localhost:8015/api/open/mailboxes/demo@outlook.com/messages?refresh=true&since=2026-04-05T00:00:00+08:00" \
  -H "X-API-Key: your-fixed-key"
```

### 7.5 生成临时授权

```bash
curl -X POST "http://localhost:8015/api/open/mailboxes/demo@outlook.com/share" \
  -H "X-API-Key: your-fixed-key" \
  -H "Content-Type: application/json" \
  -d "{\"days\":30}"
```

### 7.6 废止临时授权

```bash
curl -X POST "http://localhost:8015/api/open/mailboxes/demo@outlook.com/share/revoke" \
  -H "X-API-Key: your-fixed-key"
```

### 7.7 释放邮箱租约

```bash
curl -X POST "http://localhost:8015/api/open/mailboxes/demo@outlook.com/lease/release" \
  -H "X-API-Key: your-fixed-key"
```

---

## 8. 对接建议

推荐你在对接侧这样使用：

1. 用 `/random-email` 先取一个邮箱
2. 把返回的 `email` 用于你的业务流程
3. 业务发信后，轮询 `/mailboxes/{email}/latest` 或 `/messages`
4. 不再使用该邮箱时，调用 `/lease/release`
5. 如果要给外部人员查看邮箱内容，调用 `/share`

如果你有更细的业务需求，比如：

- 想按批次只随机一个邮箱
- 想过滤发件人
- 想只取验证码邮件

可以在现有开放接口上继续追加参数，而不需要重做整套鉴权方案。

