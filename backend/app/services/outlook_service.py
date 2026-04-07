"""Outlook mail fetch and send service."""

from __future__ import annotations

import base64
import html
import imaplib
import re
import smtplib
from dataclasses import dataclass
from datetime import datetime, timezone
from email import message_from_bytes
from email.header import decode_header
from email.message import EmailMessage
from email.policy import default as email_default_policy
from email.utils import getaddresses, parsedate_to_datetime
from typing import Iterable, Mapping, Optional

import httpx

from ..models import OutlookAccount


MICROSOFT_TOKEN_ENDPOINTS = (
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    "https://login.live.com/oauth20_token.srf",
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
)
IMAP_SCOPE = "https://outlook.office.com/IMAP.AccessAsUser.All offline_access"
SMTP_SCOPE = "https://outlook.office.com/SMTP.Send offline_access"
IMAP_HOSTS = ("outlook.live.com", "outlook.office365.com")
SMTP_HOSTS = ("smtp.office365.com", "smtp-mail.outlook.com")
INBOX_CANDIDATES = ("INBOX",)
JUNK_CANDIDATES = ("Junk", "Junk Email", "Spam", "垃圾邮件")
SENT_CANDIDATES = ("Sent", "Sent Items", "Sent Messages", "已发送", "发件箱")


@dataclass
class TokenResult:
    """AI by zb: 保存微软 OAuth 刷新后的访问令牌结果。"""

    access_token: str
    refresh_token: str


@dataclass
class SyncedMessage:
    """AI by zb: 描述单封同步得到的邮件结构。"""

    folder: str
    message_key: str
    remote_uid: str
    internet_message_id: str
    sender_name: str
    sender_email: str
    recipient_summary: str
    subject: str
    preview: str
    body_text: str
    body_html: str
    sent_at: Optional[datetime]


@dataclass
class FolderSyncResult:
    """AI by zb: 描述单个文件夹一次同步得到的结果。"""

    folder: str
    resolved_folder: str
    messages: list[SyncedMessage]
    high_water_uid: Optional[int]


class OutlookService:
    """AI by zb: 提供 Outlook IMAP 同步与 SMTP 发信能力。"""

    def __init__(self, account: OutlookAccount):
        """AI by zb: 基于指定 Outlook 账号初始化服务实例。"""
        self.account = account
        self.email = str(account.email or "").strip()
        self.password = str(account.password or "").strip()
        self.client_id = str(account.client_id or "").strip()
        self.refresh_token = str(account.refresh_token or "").strip()
        self._imap_token_result: Optional[TokenResult] = None

    def fetch_folder_messages(
        self,
        folder: str,
        limit: int = 30,
        *,
        last_uid: int | None = None,
        imap_conn: imaplib.IMAP4_SSL | None = None,
    ) -> FolderSyncResult:
        """AI by zb: 同步指定文件夹最近若干封或增量新增邮件。"""
        owns_connection = imap_conn is None
        active_conn = imap_conn
        if active_conn is None:
            active_conn = self._open_imap_connection()
        try:
            resolved_folder = self._select_folder(active_conn, folder)
            remote_ids, high_water_uid = self._search_folder_message_ids(active_conn, last_uid=last_uid)
            if not remote_ids:
                return FolderSyncResult(
                    folder=folder,
                    resolved_folder=resolved_folder,
                    messages=[],
                    high_water_uid=high_water_uid,
                )

            messages: list[SyncedMessage] = []
            target_ids = remote_ids if last_uid is not None else remote_ids[-limit:]
            for remote_id in reversed(target_ids):
                synced = self._fetch_single_message(active_conn, remote_id, folder)
                if synced is not None:
                    messages.append(synced)
            return FolderSyncResult(
                folder=folder,
                resolved_folder=resolved_folder,
                messages=messages,
                high_water_uid=high_water_uid,
            )
        finally:
            if owns_connection and active_conn is not None:
                self._safe_logout(active_conn)

    def fetch_mailbox_messages(
        self,
        limit: int = 30,
        *,
        folders: Iterable[str] | None = None,
        last_uids: Mapping[str, int | None] | None = None,
    ) -> dict[str, FolderSyncResult]:
        """AI by zb: 在单次 IMAP 会话中同步指定邮箱文件夹。"""
        target_folders = [item for item in (folders or ("inbox", "junk", "sent")) if item in {"inbox", "junk", "sent"}]
        results: dict[str, FolderSyncResult] = {}
        imap_conn = self._open_imap_connection()
        try:
            for folder in target_folders:
                try:
                    results[folder] = self.fetch_folder_messages(
                        folder,
                        limit=limit,
                        last_uid=(last_uids or {}).get(folder),
                        imap_conn=imap_conn,
                    )
                except Exception:
                    if folder != "junk":
                        raise
                    results[folder] = FolderSyncResult(
                        folder=folder,
                        resolved_folder=folder,
                        messages=[],
                        high_water_uid=(last_uids or {}).get(folder),
                    )
            return results
        finally:
            self._safe_logout(imap_conn)

    def send_mail(
        self,
        *,
        to: str,
        cc: str,
        bcc: str,
        subject: str,
        body_text: str,
        body_html: str,
    ) -> None:
        """AI by zb: 使用 Outlook SMTP 发送邮件。"""
        recipients = self._split_addresses([to, cc, bcc])
        if not recipients:
            raise RuntimeError("至少需要一个有效收件人")

        message = EmailMessage()
        message["From"] = self.email
        if to.strip():
            message["To"] = to.strip()
        if cc.strip():
            message["Cc"] = cc.strip()
        message["Subject"] = subject.strip()
        if body_text.strip():
            message.set_content(body_text)
        else:
            message.set_content(self._html_to_text(body_html))
        if body_html.strip():
            message.add_alternative(body_html, subtype="html")

        token_result = self._refresh_access_token(scope=SMTP_SCOPE)
        errors: list[str] = []
        for host in SMTP_HOSTS:
            oauth_error: Exception | None = None
            if token_result:
                try:
                    with smtplib.SMTP(host, 587, timeout=30) as smtp:
                        smtp.ehlo()
                        smtp.starttls()
                        smtp.ehlo()
                        self._smtp_auth_oauth(smtp, token_result.access_token)
                        smtp.send_message(message, to_addrs=recipients)
                        return
                except Exception as exc:
                    oauth_error = exc
                    errors.append(f"{host} OAuth: {exc}")

            if self.password:
                try:
                    with smtplib.SMTP(host, 587, timeout=30) as smtp:
                        smtp.ehlo()
                        smtp.starttls()
                        smtp.ehlo()
                        smtp.login(self.email, self.password)
                        smtp.send_message(message, to_addrs=recipients)
                        return
                except Exception as exc:
                    errors.append(f"{host} Password: {exc}")
                    continue

            if oauth_error is not None:
                continue

        raise RuntimeError(self._build_smtp_error_message(errors))

    def refresh_token_for_storage(self) -> str:
        """AI by zb: 返回当前账号可持久化的新 refresh_token。"""
        token_result = self._get_imap_token_result()
        if token_result and token_result.refresh_token:
            self.refresh_token = token_result.refresh_token
            return token_result.refresh_token
        return self.refresh_token

    def _open_imap_connection(self) -> imaplib.IMAP4_SSL:
        """AI by zb: 建立 Outlook IMAP 连接并完成认证。"""
        token_result = self._get_imap_token_result()
        last_error: Exception | None = None
        for host in IMAP_HOSTS:
            try:
                imap_conn = imaplib.IMAP4_SSL(host, 993, timeout=30)
                if token_result:
                    self._imap_auth_oauth(imap_conn, token_result.access_token)
                elif self.password:
                    imap_conn.login(self.email, self.password)
                else:
                    raise RuntimeError("当前账号缺少可用的 IMAP 认证方式")
                return imap_conn
            except Exception as exc:
                last_error = exc
                try:
                    imap_conn.logout()
                except Exception:
                    pass
        raise RuntimeError(f"Outlook IMAP 登录失败: {last_error}")

    def _get_imap_token_result(self) -> Optional[TokenResult]:
        """AI by zb: 复用当前服务实例内已经刷新出的 IMAP 令牌。"""
        if self._imap_token_result is not None:
            return self._imap_token_result
        self._imap_token_result = self._refresh_access_token(scope=IMAP_SCOPE)
        if self._imap_token_result and self._imap_token_result.refresh_token:
            self.refresh_token = self._imap_token_result.refresh_token
        return self._imap_token_result

    def _refresh_access_token(self, scope: str) -> Optional[TokenResult]:
        """AI by zb: 使用 refresh_token 获取可用于 IMAP 或 SMTP 的访问令牌。"""
        if not self.client_id or not self.refresh_token:
            return None

        for endpoint in MICROSOFT_TOKEN_ENDPOINTS:
            try:
                with httpx.Client(timeout=20) as client:
                    response = client.post(
                        endpoint,
                        data={
                            "client_id": self.client_id,
                            "refresh_token": self.refresh_token,
                            "grant_type": "refresh_token",
                            "scope": scope,
                        },
                    )
                if response.status_code >= 400:
                    continue
                payload = response.json() if response.content else {}
                access_token = str(payload.get("access_token") or "").strip()
                if access_token:
                    next_refresh = str(payload.get("refresh_token") or "").strip() or self.refresh_token
                    return TokenResult(access_token=access_token, refresh_token=next_refresh)
            except Exception:
                continue
        return None

    def _select_folder(self, imap_conn: imaplib.IMAP4_SSL, folder: str) -> str:
        """AI by zb: 根据 folder 类型自动选择 Outlook 中实际可用的文件夹。"""
        if folder == "inbox":
            candidates = INBOX_CANDIDATES
        elif folder == "junk":
            candidates = JUNK_CANDIDATES
        else:
            candidates = SENT_CANDIDATES
        for candidate in candidates:
            status, _ = imap_conn.select(candidate, readonly=True)
            if status == "OK":
                return candidate

        status, payload = imap_conn.list()
        if status == "OK":
            available = self._parse_folder_list(payload or [])
            for candidate in candidates:
                for item in available:
                    if item.casefold() == candidate.casefold():
                        status, _ = imap_conn.select(item, readonly=True)
                        if status == "OK":
                            return item
        raise RuntimeError(f"未找到可用的 {folder} 文件夹")

    def _search_folder_message_ids(
        self,
        imap_conn: imaplib.IMAP4_SSL,
        *,
        last_uid: int | None = None,
    ) -> tuple[list[bytes], int | None]:
        """AI by zb: 优先按 UID 增量查询远端邮件编号，失败时回退到全量过滤。"""
        if last_uid is not None and last_uid > 0:
            try:
                status, data = imap_conn.uid("search", None, "UID", f"{last_uid + 1}:*")
                if status == "OK":
                    remote_ids = data[0].split() if data and data[0] else []
                    high_water_uid = last_uid
                    if remote_ids:
                        high_water_uid = self._parse_uid(remote_ids[-1]) or last_uid
                    return remote_ids, high_water_uid
            except Exception:
                pass

        status, data = imap_conn.uid("search", None, "ALL")
        remote_ids = data[0].split() if status == "OK" and data and data[0] else []
        if not remote_ids:
            return [], last_uid

        high_water_uid = self._parse_uid(remote_ids[-1]) or last_uid
        if last_uid is None or last_uid <= 0:
            return remote_ids, high_water_uid

        filtered_ids = [item for item in remote_ids if (self._parse_uid(item) or 0) > last_uid]
        return filtered_ids, high_water_uid

    def _fetch_single_message(
        self,
        imap_conn: imaplib.IMAP4_SSL,
        remote_id: bytes,
        folder: str,
    ) -> Optional[SyncedMessage]:
        """AI by zb: 拉取并解析单封邮件内容。"""
        status, payload = imap_conn.uid("fetch", remote_id, "(RFC822)")
        if status != "OK":
            return None

        raw_message = None
        for item in payload or []:
            if isinstance(item, tuple) and item[1]:
                raw_message = item[1]
                break
        if not raw_message:
            return None

        message = message_from_bytes(raw_message, policy=email_default_policy)
        subject = self._decode_header_value(message.get("Subject", ""))
        sender_name, sender_email = self._parse_single_address(message.get("From", ""))
        recipient_summary = self._build_recipient_summary(message)
        body_text, body_html = self._extract_message_bodies(message)
        preview = self._build_preview(body_text or body_html)
        remote_uid = remote_id.decode("utf-8", errors="ignore")
        internet_message_id = str(message.get("Message-ID") or "").strip()
        sent_at = self._parse_message_date(message.get("Date", ""))
        message_key = f"{self.email}:{folder}:{internet_message_id or remote_uid}"

        return SyncedMessage(
            folder=folder,
            message_key=message_key,
            remote_uid=remote_uid,
            internet_message_id=internet_message_id,
            sender_name=sender_name,
            sender_email=sender_email,
            recipient_summary=recipient_summary,
            subject=subject,
            preview=preview,
            body_text=body_text,
            body_html=body_html,
            sent_at=sent_at,
        )

    def _imap_auth_oauth(self, imap_conn: imaplib.IMAP4_SSL, access_token: str) -> None:
        """AI by zb: 使用 XOAUTH2 完成 IMAP OAuth 登录。"""
        auth_string = f"user={self.email}\x01auth=Bearer {access_token}\x01\x01"
        imap_conn.authenticate("XOAUTH2", lambda _: auth_string.encode("utf-8"))

    def _smtp_auth_oauth(self, smtp: smtplib.SMTP, access_token: str) -> None:
        """AI by zb: 使用 XOAUTH2 完成 SMTP OAuth 登录。"""
        auth_string = f"user={self.email}\x01auth=Bearer {access_token}\x01\x01"
        encoded = base64.b64encode(auth_string.encode("utf-8")).decode("utf-8")
        first_code, first_message = smtp.docmd("AUTH", "XOAUTH2")
        if first_code != 334:
            detail = first_message.decode("utf-8", errors="ignore") if isinstance(first_message, bytes) else str(first_message)
            raise RuntimeError(f"SMTP OAuth 启动失败: {detail}")
        code, message = smtp.docmd(encoded)
        if code >= 400:
            detail = message.decode("utf-8", errors="ignore") if isinstance(message, bytes) else str(message)
            raise RuntimeError(f"SMTP OAuth 登录失败: {detail}")

    def _build_smtp_error_message(self, errors: list[str]) -> str:
        """AI by zb: 组装更明确的 SMTP 发信失败诊断信息。"""
        merged = " | ".join([item for item in errors if item]).strip()
        lowered = merged.lower()
        if "5.7.3 authentication unsuccessful" in lowered:
            return (
                "Outlook 发信失败: SMTP OAuth 已拿到令牌，但服务端返回 535 5.7.3。"
                "这通常不是页面问题，而是该 Outlook/Outlook.com 邮箱的 SMTP AUTH 在服务端未启用或当前消费者账号的 SMTP OAuth 未被微软侧放行。"
                "目前收件 IMAP 可以正常工作，但发件 SMTP 被拒绝。"
            )
        if merged:
            return f"Outlook 发信失败: {merged}"
        return "Outlook 发信失败: 未获得可用的 SMTP 认证结果"

    def _extract_message_bodies(self, message) -> tuple[str, str]:
        """AI by zb: 提取邮件正文中的文本版与 HTML 版内容。"""
        text_parts: list[str] = []
        html_parts: list[str] = []
        if message.is_multipart():
            for part in message.walk():
                if part.get_content_maintype() == "multipart":
                    continue
                content_type = part.get_content_type()
                content = self._decode_message_part(part)
                if not content:
                    continue
                if content_type == "text/html":
                    html_parts.append(content)
                elif content_type == "text/plain":
                    text_parts.append(content)
        else:
            content = self._decode_message_part(message)
            if message.get_content_type() == "text/html":
                html_parts.append(content)
            else:
                text_parts.append(content)

        body_html = "\n".join([item for item in html_parts if item]).strip()
        body_text = "\n".join([item for item in text_parts if item]).strip()
        if not body_text and body_html:
            body_text = self._html_to_text(body_html)
        if not body_html and body_text:
            body_html = "<pre>" + html.escape(body_text) + "</pre>"
        return body_text, body_html

    def _decode_message_part(self, part) -> str:
        """AI by zb: 解码邮件片段到 UTF-8 文本。"""
        payload = part.get_payload(decode=True)
        if payload is None:
            return str(part.get_payload() or "")
        charset = part.get_content_charset() or "utf-8"
        try:
            return payload.decode(charset, errors="ignore")
        except Exception:
            return payload.decode("utf-8", errors="ignore")

    def _parse_folder_list(self, payload: Iterable[bytes]) -> list[str]:
        """AI by zb: 从 IMAP LIST 结果中提取可选文件夹名称。"""
        folders: list[str] = []
        for item in payload:
            raw = item.decode("utf-8", errors="ignore") if isinstance(item, bytes) else str(item)
            match = re.search(r'"[^"]*"\s+"?([^"]+)"?$', raw)
            if match:
                folders.append(match.group(1))
        return folders

    def _parse_uid(self, value: bytes | str | int | None) -> Optional[int]:
        """AI by zb: 将 IMAP UID 安全转换成整数，便于增量同步比较。"""
        if value is None:
            return None
        if isinstance(value, int):
            return value
        text = value.decode("utf-8", errors="ignore") if isinstance(value, bytes) else str(value)
        text = text.strip()
        if not text.isdigit():
            return None
        try:
            return int(text)
        except Exception:
            return None

    def _decode_header_value(self, value: str) -> str:
        """AI by zb: 安全解码 RFC2047 邮件头。"""
        decoded: list[str] = []
        for part, charset in decode_header(value or ""):
            if isinstance(part, bytes):
                try:
                    decoded.append(part.decode(charset or "utf-8", errors="ignore"))
                except Exception:
                    decoded.append(part.decode("utf-8", errors="ignore"))
            else:
                decoded.append(str(part))
        return "".join(decoded).strip()

    def _parse_single_address(self, value: str) -> tuple[str, str]:
        """AI by zb: 解析单个邮件地址并返回名称与邮箱。"""
        addresses = getaddresses([value or ""])
        if not addresses:
            return "", ""
        name, email = addresses[0]
        return self._decode_header_value(name), str(email or "").strip()

    def _build_recipient_summary(self, message) -> str:
        """AI by zb: 汇总 To 与 Cc 用于前端展示。"""
        items = []
        for header_name in ("To", "Cc"):
            addresses = getaddresses([message.get(header_name, "")])
            for name, email in addresses:
                display_name = self._decode_header_value(name)
                label = f"{display_name} <{email}>" if display_name else email
                if label.strip():
                    items.append(label.strip())
        return ", ".join(items)

    def _build_preview(self, value: str) -> str:
        """AI by zb: 生成邮件摘要预览。"""
        plain = self._html_to_text(value)
        compact = re.sub(r"\s+", " ", plain).strip()
        return compact[:160]

    def _html_to_text(self, value: str) -> str:
        """AI by zb: 将 HTML 内容压缩为适合列表展示的纯文本。"""
        plain = html.unescape(str(value or ""))
        plain = re.sub(r"(?is)<style.*?>.*?</style>", " ", plain)
        plain = re.sub(r"(?is)<script.*?>.*?</script>", " ", plain)
        plain = re.sub(r"(?is)<br\s*/?>", "\n", plain)
        plain = re.sub(r"(?is)</p>", "\n", plain)
        plain = re.sub(r"(?is)<[^>]+>", " ", plain)
        return re.sub(r"\n{3,}", "\n\n", plain).strip()

    def _parse_message_date(self, value: str) -> Optional[datetime]:
        """AI by zb: 解析邮件 Date 头到带时区时间。"""
        if not value:
            return None
        try:
            parsed = parsedate_to_datetime(value)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except Exception:
            return None

    def _split_addresses(self, parts: Iterable[str]) -> list[str]:
        """AI by zb: 将多个逗号分隔地址合并为扁平收件人列表。"""
        values: list[str] = []
        for part in parts:
            for _, address in getaddresses([part or ""]):
                item = str(address or "").strip()
                if item:
                    values.append(item)
        return values

    def _safe_logout(self, conn: imaplib.IMAP4_SSL) -> None:
        """AI by zb: 安全关闭 IMAP 连接。"""
        try:
            conn.logout()
        except Exception:
            pass
