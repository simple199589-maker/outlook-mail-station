# Outlook Mail Station API Integration

本文档描述当前系统实际可用的接口能力、认证方式和数据权限规则。

## 1. 接口分层

系统接口分为三类：

### 后台管理接口

- 路径前缀：`/api/*`
- 认证方式：管理员 Bearer Token
- 作用：后台页面、用户管理、站点管理、邮箱池维护

### 业务开放接口

- 路径前缀：`/api/open/*`
- 认证方式：普通用户自己的 API Key
- 作用：业务系统领取邮箱、查信、生成分享、按站点回退

### 公开分享接口

- 路径前缀：`/api/public/*`
- 认证方式：分享 token
- 作用：分享页读取邮箱和邮件内容

## 2. 业务开放接口认证

开放接口支持两种传参方式：

### 方式 A

```http
X-API-Key: user-owned-api-key
```

### 方式 B

```http
Authorization: Bearer user-owned-api-key
```

认证通过后，服务端会把本次请求绑定到该 API Key 所属的普通用户。

## 3. 数据权限规则

业务开放接口遵循以下规则：

- 每个 API Key 只对应一个普通用户
- 每个普通用户只访问自己的邮箱池
- 邮箱查询、分享、回退都必须命中该用户池中的邮箱
- 站点占用回退时，还会校验占用记录属于当前用户

这意味着：

- 不需要额外传 `user_id`
- 不允许跨用户池读取邮箱
- 不允许跨用户池释放站点占用

## 4. 业务模型

### 用户池

- 普通用户拥有自己的邮箱池
- API Key 与用户池一一绑定

### 站点占用

- 业务系统消费邮箱时必须带 `site_code`
- 同一个邮箱不能被同一个站点重复占用
- 一个邮箱可以被多个不同站点分别占用
- 回退必须带 `site_code`

### 分享链接

- 分享链接从单个邮箱生成
- 分享链接对应一个分享 token
- 分享页使用 token 做只读访问

## 5. 业务开放接口一览

### 5.1 随机消费邮箱

```http
POST /api/open/random-email
Content-Type: application/json
```

请求体：

```json
{
  "site_code": "OPENAI",
  "batch_code": "batch-20260405",
  "domain": "outlook.com"
}
```

字段说明：

- `site_code`：必填，站点编码
- `batch_code`：可选，批次过滤
- `domain`：可选，邮箱域名过滤

响应示例：

```json
{
  "id": 1,
  "email": "demo@outlook.com",
  "domain": "outlook.com",
  "site_code": "OPENAI",
  "site_name": "OpenAI",
  "batch_code": "batch-20260405"
}
```

### 5.2 获取最新一封收件

```http
GET /api/open/mailboxes/{email}/latest?refresh=true
```

查询参数：

- `refresh`：可选，默认 `true`

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
    "sent_at": "2026-04-05T08:11:22Z",
    "body_text": "Your OpenAI code is 853703",
    "body_html": "<p>Your OpenAI code is 853703</p>"
  }
}
```

### 5.3 获取邮件列表

```http
GET /api/open/mailboxes/{email}/messages?refresh=true&folder=inbox&since=2026-04-05T00:00:00+08:00
```

查询参数：

- `refresh`：可选，默认 `true`
- `folder`：可选，默认 `inbox`
- `since`：可选，ISO8601 时间

返回规则：

- `folder=inbox` 时返回 `inbox + junk`
- `folder=sent` 时返回发件箱缓存

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
      "sent_at": "2026-04-05T08:11:22Z"
    }
  ]
}
```

### 5.4 生成分享链接

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

响应示例：

```json
{
  "token": "ud561d2XWtKFtZPnfAWlZKN1j3M898YA",
  "url": "http://localhost:8015/share/ud561d2XWtKFtZPnfAWlZKN1j3M898YA",
  "expires_at": "2026-05-05T08:11:22Z"
}
```

### 5.5 废止分享链接

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

### 5.6 按站点回退邮箱占用

```http
POST /api/open/mailboxes/{email}/sites/{site_code}/release
```

响应示例：

```json
{
  "ok": true,
  "email": "demo@outlook.com",
  "message": "邮箱已从站点 OpenAI 退回"
}
```

## 6. 公开分享接口

公开分享接口依赖分享 token，不要求 API Key。

### 6.1 获取分享页数据

```http
GET /api/public/shares/{token}
```

### 6.2 刷新分享页数据

```http
POST /api/public/shares/{token}/sync
```

### 6.3 获取分享页邮件详情

```http
GET /api/public/shares/{token}/messages/{message_id}
```

## 7. 后台管理相关接口

以下接口主要供后台页面使用，认证方式为管理员 Bearer Token：

- `GET /api/admin/auth/status`
- `POST /api/admin/auth/login`
- `GET /api/users`
- `POST /api/users`
- `GET /api/users/{user_id}/api-key`
- `POST /api/users/{user_id}/api-key/regenerate`
- `PATCH /api/users/{user_id}`
- `GET /api/sites`
- `POST /api/sites`
- `PATCH /api/sites/{site_id}`
- `POST /api/accounts/import`
- `GET /api/accounts`
- `GET /api/accounts/export`
- `POST /api/accounts/batch-move`
- `POST /api/accounts/random-consume`
- `GET /api/accounts/pool-summary`
- `GET /api/accounts/{account_id}`
- `PATCH /api/accounts/{account_id}`
- `POST /api/accounts/{account_id}/consume`
- `POST /api/accounts/{account_id}/release`
- `DELETE /api/accounts/{account_id}`
- `POST /api/accounts/{account_id}/sync`
- `GET /api/accounts/{account_id}/messages`
- `GET /api/messages/{message_id}`
- `POST /api/accounts/{account_id}/send`
- `POST /api/accounts/{account_id}/shares`

## 8. 邮件同步说明

- 开放接口默认按需同步
- 收件相关查询优先同步 `inbox + junk`
- 同一个邮箱在冷却时间内优先复用缓存
- 被站点占用的活跃邮箱会参与后台预热同步

相关配置：

```env
OUTLOOK_MAIL_STATION_OPEN_API_SYNC_COOLDOWN_SECONDS=60
OUTLOOK_MAIL_STATION_ACTIVE_MAILBOX_SYNC_INTERVAL_SECONDS=5
OUTLOOK_MAIL_STATION_ACTIVE_MAILBOX_SYNC_STALE_SECONDS=8
OUTLOOK_MAIL_STATION_ACTIVE_MAILBOX_SYNC_LIMIT=30
```

## 9. 常见错误

未提供 API Key：

```json
{
  "detail": "未提供开放接口 API Key"
}
```

API Key 校验失败：

```json
{
  "detail": "开放接口认证失败"
}
```

邮箱不在当前用户池：

```json
{
  "detail": "邮箱不存在或不属于当前用户池"
}
```

当前站点无可用邮箱：

```json
{
  "detail": "目标用户池中没有可分配给当前站点的邮箱"
}
```

当前站点占用记录不存在：

```json
{
  "detail": "当前邮箱不存在对应站点的有效使用记录"
}
```

## 10. cURL 示例

### 10.1 随机消费邮箱

```bash
curl -X POST "http://localhost:8015/api/open/random-email" \
  -H "X-API-Key: user-owned-api-key" \
  -H "Content-Type: application/json" \
  -d "{\"site_code\":\"OPENAI\",\"domain\":\"outlook.com\",\"batch_code\":\"batch-20260405\"}"
```

### 10.2 获取最新收件

```bash
curl "http://localhost:8015/api/open/mailboxes/demo@outlook.com/latest?refresh=true" \
  -H "X-API-Key: user-owned-api-key"
```

### 10.3 获取邮件列表

```bash
curl "http://localhost:8015/api/open/mailboxes/demo@outlook.com/messages?refresh=true&folder=inbox&since=2026-04-05T00:00:00+08:00" \
  -H "X-API-Key: user-owned-api-key"
```

### 10.4 生成分享链接

```bash
curl -X POST "http://localhost:8015/api/open/mailboxes/demo@outlook.com/share" \
  -H "X-API-Key: user-owned-api-key" \
  -H "Content-Type: application/json" \
  -d "{\"days\":30}"
```

### 10.5 废止分享链接

```bash
curl -X POST "http://localhost:8015/api/open/mailboxes/demo@outlook.com/share/revoke" \
  -H "X-API-Key: user-owned-api-key"
```

### 10.6 按站点回退邮箱

```bash
curl -X POST "http://localhost:8015/api/open/mailboxes/demo@outlook.com/sites/OPENAI/release" \
  -H "X-API-Key: user-owned-api-key"
```
