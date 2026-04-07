"""FastAPI application for Outlook Mail Station."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .auth import require_admin_authorization
from .database import init_db
from .routers.admin_auth import router as admin_auth_router
from .routers.accounts import router as accounts_router
from .routers.messages import router as messages_router
from .routers.open_api import router as open_api_router
from .routers.public_share import router as public_share_router
from .routers.sites import router as sites_router
from .routers.users import router as users_router
from .schemas import HealthResponse
from .services.mail_sync_service import run_active_mailbox_sync_loop
from .settings import API_PREFIX, APP_NAME, FRONTEND_DIR, STATIC_DIR


def _resolve_static_dir() -> Path | None:
    """AI by zb: 解析可被 FastAPI 托管的前端静态目录。"""
    candidates = [STATIC_DIR, FRONTEND_DIR / "dist"]
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """AI by zb: 应用启动时初始化数据库。"""
    init_db()
    stop_event = asyncio.Event()
    sync_task = asyncio.create_task(run_active_mailbox_sync_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        await sync_task


app = FastAPI(title=APP_NAME, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_ADMIN_BYPASS_PATHS = {
    f"{API_PREFIX}/health",
    f"{API_PREFIX}/admin/auth/status",
    f"{API_PREFIX}/admin/auth/login",
}


@app.middleware("http")
async def admin_auth_middleware(request: Request, call_next):
    """AI by zb: 为后台管理接口统一增加管理员会话校验。"""
    path = request.url.path
    if not path.startswith(API_PREFIX):
        return await call_next(request)
    if path in _ADMIN_BYPASS_PATHS or path.startswith(f"{API_PREFIX}/open/") or path.startswith(f"{API_PREFIX}/public/"):
        return await call_next(request)
    try:
        require_admin_authorization(request.headers.get("Authorization"))
    except HTTPException as exc:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    return await call_next(request)


app.include_router(admin_auth_router, prefix=API_PREFIX)
app.include_router(accounts_router, prefix=API_PREFIX)
app.include_router(messages_router, prefix=API_PREFIX)
app.include_router(users_router, prefix=API_PREFIX)
app.include_router(sites_router, prefix=API_PREFIX)
app.include_router(open_api_router, prefix=API_PREFIX)
app.include_router(public_share_router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """AI by zb: 提供前后端联调用的健康检查接口。"""
    return HealthResponse(ok=True, app=APP_NAME)


_static_dir = _resolve_static_dir()
if _static_dir and (_static_dir / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(_static_dir / "assets")), name="assets")


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    """AI by zb: 统一返回标准 JSON 错误对象。"""
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    """AI by zb: 托管前端路由并保留 API 404 行为。"""
    if full_path.startswith(("api/", "docs", "redoc", "openapi.json")):
        raise HTTPException(status_code=404, detail="Not Found")
    if _static_dir and (_static_dir / "index.html").is_file():
        return FileResponse(_static_dir / "index.html")
    raise HTTPException(status_code=404, detail="前端静态资源尚未构建")
