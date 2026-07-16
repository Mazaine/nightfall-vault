import asyncio
import logging
from uuid import uuid4
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.admin import router as admin_router
from app.api.auctions import router as auctions_router
from app.api.auth import router as auth_router
from app.api.blocks import router as blocks_router
from app.api.categories import router as categories_router
from app.api.follow import router as follow_router
from app.api.health import router as health_router
from app.api.newsletter import router as newsletter_router
from app.api.notifications import router as notifications_router
from app.api.realtime import router as realtime_router
from app.api.reports import router as reports_router
from app.api.searches import router as searches_router
from app.api.test_email import router as test_email_router
from app.api.transactions import router as transactions_router
from app.api.moderation_actions import router as moderation_actions_router
from app.api.users import router as users_router
from app.api.watchlist import router as watchlist_router
from app.core.config import settings
from app.core.logging_config import configure_logging
from app.media import ImmutableMediaFiles
from app.db.session import SessionLocal
from app.services.security_audit import create_admin_audit_log
from app.services.auction_scheduler import scheduler_loop
from app.storage import storage

logger = logging.getLogger(__name__)
configure_logging()

_scheduler_stop_event: asyncio.Event | None = None
_scheduler_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _scheduler_stop_event, _scheduler_task
    embedded_scheduler = settings.auction_scheduler_mode.lower() == "embedded"
    if embedded_scheduler:
        _scheduler_stop_event = asyncio.Event()
        logger.info("Backend startup: embedded scheduler starting")
        _scheduler_task = asyncio.create_task(scheduler_loop(_scheduler_stop_event))
    else:
        logger.info("Backend startup: external scheduler mode")
    try:
        yield
    finally:
        if embedded_scheduler and _scheduler_stop_event is not None:
            logger.info("Backend shutdown: embedded scheduler stopping")
            _scheduler_stop_event.set()
        if _scheduler_task is not None:
            _scheduler_task.cancel()
            try:
                await _scheduler_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title=settings.project_name, lifespan=lifespan)
app.mount(settings.media_url_prefix, ImmutableMediaFiles(directory=storage.root, follow_symlink=False), name="media")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}

PRIVATE_API_PREFIXES = (
    "/api/admin",
    "/api/auth/me",
    "/api/blocks",
    "/api/notifications",
    "/api/reports",
    "/api/realtime",
    "/api/searches",
    "/api/watchlist",
    "/api/transactions",
)

FIELD_LABELS = {
    "email": "e-mail-cím",
    "password": "jelszó",
    "confirm_password": "jelszó-megerősítés",
    "username": "felhasználónév",
    "full_name": "teljes név",
    "accepted_terms": "felhasználási feltételek",
    "accepted_privacy": "adatkezelési tájékoztató",
}


def validation_message(field: str, message: str) -> str:
    label = FIELD_LABELS.get(field, field)
    if "Field required" in message or "missing" in message.lower():
        return f"A(z) {label} mező kitöltése kötelező."
    if "valid email" in message.lower():
        return "Adj meg érvényes e-mail-címet."
    if "at least 8" in message or "greater than or equal to 8" in message or "String should have at least 8" in message:
        return "A jelszónak legalább 8 karakter hosszúnak kell lennie."
    if "Value error," in message:
        return message.split("Value error,", 1)[1].strip()
    return message


def registration_validation_errors(exc: RequestValidationError) -> dict[str, str]:
    errors: dict[str, str] = {}
    for error in exc.errors():
        loc = list(error.get("loc", []))
        field = str(loc[-1]) if loc else "request"
        errors[field] = validation_message(field, str(error.get("msg", "")))
    return errors


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    for header_name, header_value in SECURITY_HEADERS.items():
        response.headers.setdefault(header_name, header_value)
    if request.headers.get("authorization") or request.url.path.startswith(PRIVATE_API_PREFIXES):
        response.headers["Cache-Control"] = "no-store, private"
        response.headers["Pragma"] = "no-cache"
        vary = {item.strip() for item in response.headers.get("Vary", "").split(",") if item.strip()}
        vary.add("Authorization")
        response.headers["Vary"] = ", ".join(sorted(vary))
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    if request.url.path == "/api/auth/register":
        return JSONResponse(status_code=422, content={"message": "A regisztráció nem sikerült.", "errors": registration_validation_errors(exc)})
    errors = []
    for error in exc.errors():
        loc = list(error.get("loc", []))
        field = str(loc[-1]) if loc else "request"
        errors.append({"field": field, "message": validation_message(field, str(error.get("msg", "")))})
    return JSONResponse(status_code=422, content={"detail": {"message": "A megadott adatok ellenőrzése nem sikerült.", "errors": errors}})


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if request.url.path == "/api/auth/register" and isinstance(exc.detail, dict) and "errors" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.middleware("http")
async def admin_audit_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/admin"):
        db = SessionLocal()
        try:
            create_admin_audit_log(db, request, response.status_code)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Admin audit log save failed.")
        finally:
            db.close()
    return response


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.exception("Unhandled backend error: %s %s request_id=%s", request.method, request.url.path, request_id)
    return JSONResponse(status_code=500, content={"detail": "Unexpected server error.", "request_id": request_id})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(blocks_router)
app.include_router(admin_router)
app.include_router(auctions_router)
app.include_router(categories_router)
app.include_router(follow_router)
app.include_router(newsletter_router)
app.include_router(notifications_router)
app.include_router(realtime_router)
app.include_router(reports_router)
app.include_router(searches_router)
app.include_router(test_email_router)
app.include_router(users_router)
app.include_router(watchlist_router)
app.include_router(transactions_router)
app.include_router(moderation_actions_router)
