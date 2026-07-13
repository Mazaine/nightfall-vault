import asyncio
import logging
from uuid import uuid4
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.admin import router as admin_router
from app.api.auctions import router as auctions_router
from app.api.auth import router as auth_router
from app.api.categories import router as categories_router
from app.api.checkout import router as checkout_router
from app.api.follow import router as follow_router
from app.api.health import router as health_router
from app.api.newsletter import router as newsletter_router
from app.api.notifications import router as notifications_router
from app.api.orders import router as orders_router
from app.api.pickup_points import router as pickup_points_router
from app.api.products import router as products_router
from app.api.shipping import router as shipping_router
from app.api.test_email import router as test_email_router
from app.api.users import router as users_router
from app.api.watchlist import router as watchlist_router
from app.core.config import settings
from app.core.logging_config import configure_logging
from app.db.session import SessionLocal
from app.services.security_audit import create_admin_audit_log
from app.services.auction_scheduler import scheduler_loop

logger = logging.getLogger(__name__)
configure_logging()
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

_scheduler_stop_event: asyncio.Event | None = None
_scheduler_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _scheduler_stop_event, _scheduler_task
    _scheduler_stop_event = asyncio.Event()
    logger.info("Backend startup: scheduler starting")
    _scheduler_task = asyncio.create_task(scheduler_loop(_scheduler_stop_event))
    try:
        yield
    finally:
        if _scheduler_stop_event is not None:
            logger.info("Backend shutdown: scheduler stopping")
            _scheduler_stop_event.set()
        if _scheduler_task is not None:
            _scheduler_task.cancel()
            try:
                await _scheduler_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title=settings.project_name, lifespan=lifespan)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}

FIELD_LABELS = {
    "email": "email",
    "password": "password",
    "confirm_password": "password confirmation",
    "username": "username",
    "full_name": "full name",
    "accepted_terms": "terms",
    "accepted_privacy": "privacy policy",
}


def validation_message(field: str, message: str) -> str:
    label = FIELD_LABELS.get(field, field)
    if "Field required" in message or "missing" in message.lower():
        return f"The {label} field is required."
    if "valid email" in message.lower():
        return "Enter a valid email address."
    if "at least 8" in message or "greater than or equal to 8" in message or "String should have at least 8" in message:
        return "The password must be at least 8 characters long."
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
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    if request.url.path == "/api/auth/register":
        return JSONResponse(status_code=422, content={"message": "Registration failed.", "errors": registration_validation_errors(exc)})
    errors = []
    for error in exc.errors():
        loc = list(error.get("loc", []))
        field = str(loc[-1]) if loc else "request"
        errors.append({"field": field, "message": validation_message(field, str(error.get("msg", "")))})
    return JSONResponse(status_code=422, content={"detail": {"message": "Submitted data validation failed.", "errors": errors}})


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
app.include_router(admin_router)
app.include_router(auctions_router)
app.include_router(categories_router)
app.include_router(checkout_router)
app.include_router(follow_router)
app.include_router(newsletter_router)
app.include_router(notifications_router)
app.include_router(orders_router)
app.include_router(pickup_points_router)
app.include_router(products_router)
app.include_router(shipping_router)
app.include_router(test_email_router)
app.include_router(users_router)
app.include_router(watchlist_router)
