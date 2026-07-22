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
from app.core.production import validate_production_settings
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
    validate_production_settings(settings)
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
    "title": "név",
    "description": "leírás",
    "category": "kategória",
    "condition": "állapot",
    "starting_price": "kezdőár",
    "bid_increment": "licitlépcső",
    "buy_now_price": "villámár",
    "starts_at": "kezdési dátum",
    "ends_at": "lejárati dátum",
    "seller_declaration_accepted": "értékesítői nyilatkozat",
    "amount": "összeg",
    "rating": "értékelés",
    "comment": "megjegyzés",
    "reason": "indoklás",
    "request": "kérés",
}


VALUE_ERROR_MESSAGES = {
    "ends_at must be later than starts_at.": "A lejárati dátumnak későbbinek kell lennie a kezdési dátumnál.",
    "buy_now_price is required when buy now is enabled.": "Bekapcsolt villámár esetén add meg a villámár összegét.",
    "buy_now_price must be greater than starting_price.": "A villámárnak nagyobbnak kell lennie a kezdőárnál.",
    "buy_now_price must be empty when buy now is disabled.": "Kikapcsolt villámár esetén ne adj meg villámár összeget.",
    "Seller declaration must be accepted.": "Az aukció létrehozásához el kell fogadnod az értékesítői nyilatkozatot.",
}


HTTP_DETAIL_MESSAGES = {
    "Winner not found": "A nyertes nem található.",
    "User not found": "A felhasználó nem található.",
    "Audit log not found": "Az auditnapló-bejegyzés nem található.",
    "Auction not found": "Az aukció nem található.",
    "Auction ownership required": "Ehhez a művelethez az aukció tulajdonosának kell lenned.",
    "Newsletter campaign not found.": "A hírlevélkampány nem található.",
    "No active newsletter subscribers selected.": "Nincs kiválasztva aktív hírlevél-feliratkozó.",
    "No active newsletter subscribers found.": "Nem található aktív hírlevél-feliratkozó.",
    "Email is already subscribed.": "Ez az e-mail-cím már feliratkozott.",
    "Subscriber not found.": "A feliratkozó nem található.",
    "Deleted auction cannot be suspended.": "Törölt aukció nem függeszthető fel.",
    "Auction is already suspended.": "Az aukció már fel van függesztve.",
    "Deleted auction cannot be restored.": "Törölt aukció nem állítható vissza.",
    "Only suspended auctions can be restored.": "Csak felfüggesztett aukció állítható vissza.",
    "Datetime must include timezone information.": "A dátumnak időzóna-információt is tartalmaznia kell.",
    "Only draft auctions can be activated.": "Csak piszkozat aukció aktiválható.",
    "Auction content is incomplete.": "Az aukció adatai hiányosak.",
    "Auction time window is invalid.": "Az aukció időtartama nem érvényes.",
    "Auction prices are invalid.": "Az aukció árai nem érvényesek.",
    "Buy now price is invalid.": "A villámár nem érvényes.",
    "Buy now price must be empty when buy now is disabled.": "Kikapcsolt villámár esetén ne adj meg villámár összeget.",
    "Seller declaration is required.": "Az értékesítői nyilatkozat elfogadása kötelező.",
    "Auction activation requires 1 to 5 images.": "Az aukció aktiválásához 1–5 kép szükséges.",
    "Auction activation requires exactly one cover image.": "Az aukció aktiválásához pontosan egy borítóképet válassz.",
    "Only ended auctions can be finalized.": "Csak befejeződött aukció zárható le.",
    "Sold auction requires a winner.": "Eladott aukciónál kötelező nyertest megadni.",
    "Seller cannot be the winner.": "Az eladó nem lehet az aukció nyertese.",
    "Unsold auction cannot have a winner.": "El nem adott aukciónak nem lehet nyertese.",
    "Closed auction participant access required.": "Ehhez csak a lezárt aukció résztvevői férhetnek hozzá.",
    "Message is required.": "Az üzenet megadása kötelező.",
    "Message is too long.": "Az üzenet túl hosszú.",
    "This auction participant has already been reviewed.": "Ezt az aukciós partnert már értékelted.",
    "Saved search not found": "A mentett keresés nem található.",
    "Ervenytelen aukcio statusz.": "Érvénytelen aukcióállapot.",
    "Ervenytelen rendezes.": "Érvénytelen rendezés.",
    "Elado nem talalhato.": "Az eladó nem található.",
    "Sajat profilt nem lehet kovetni.": "Saját profilt nem lehet követni.",
    "A kovetes nem talalhato.": "A követés nem található.",
    "Felhasznalo nem talalhato.": "A felhasználó nem található.",
    "Jelent?s nem tal?lhat?.": "A jelentés nem található.",
    "?rv?nytelen jelent?si ok.": "Érvénytelen jelentési ok.",
    "Aukci? nem tal?lhat?.": "Az aukció nem található.",
    "Saj?t aukci?t nem lehet jelenteni.": "Saját aukciót nem lehet jelenteni.",
    "Saj?t profilt nem lehet jelenteni.": "Saját profilt nem lehet jelenteni.",
    "Felhaszn?l? nem tal?lhat?.": "A felhasználó nem található.",
    "Tiltott jelent?s st?tuszv?lt?s.": "Ez a jelentési állapotváltás nem engedélyezett.",
    "Saj?t profilt nem lehet blokkolni.": "Saját profilt nem lehet blokkolni.",
    "Ez a felhaszn?l? m?r blokkolva van.": "Ez a felhasználó már blokkolva van.",
    "A blokkol?s nem tal?lhat?.": "A blokkolás nem található.",
    "??rv??nytelen leiratkoz??si link.": "Érvénytelen leiratkozási link.",
}


def translate_http_detail(detail: str) -> str:
    if detail.startswith("Invalid auction status transition:"):
        return "Ez az aukcióállapot-váltás nem engedélyezett."
    return HTTP_DETAIL_MESSAGES.get(detail, detail)


def validation_message(field: str, message: str, error_type: str = "", context: dict | None = None) -> str:
    label = FIELD_LABELS.get(field, field)
    context = context or {}
    if error_type == "missing" or "Field required" in message or "missing" in message.lower():
        return f"A(z) {label} mező kitöltése kötelező."
    if field == "email" and (error_type == "value_error" or "valid email" in message.lower()):
        return "Adj meg érvényes e-mail-címet."
    if error_type in {"value_error", "assertion_error"}:
        value_message = message.split("Value error,", 1)[-1].strip()
        return VALUE_ERROR_MESSAGES.get(value_message, "A megadott adatok nem felelnek meg a feltételeknek.")
    if error_type == "string_too_short":
        minimum = context.get("min_length")
        return f"A(z) {label} legalább {minimum} karakter hosszú legyen." if minimum else f"A(z) {label} túl rövid."
    if error_type == "string_too_long":
        maximum = context.get("max_length")
        return f"A(z) {label} legfeljebb {maximum} karakter hosszú lehet." if maximum else f"A(z) {label} túl hosszú."
    if error_type in {"greater_than", "greater_than_equal"}:
        limit = context.get("gt", context.get("ge"))
        comparison = "nagyobb" if error_type == "greater_than" else "legalább akkora"
        return f"A(z) {label} értéke legyen {comparison}, mint {limit}." if limit is not None else f"A(z) {label} értéke túl alacsony."
    if error_type in {"less_than", "less_than_equal"}:
        limit = context.get("lt", context.get("le"))
        comparison = "kisebb" if error_type == "less_than" else "legfeljebb akkora"
        return f"A(z) {label} értéke legyen {comparison}, mint {limit}." if limit is not None else f"A(z) {label} értéke túl magas."
    if error_type in {"decimal_parsing", "float_parsing", "int_parsing", "int_from_float"}:
        return f"A(z) {label} mezőben számot adj meg."
    if error_type in {"datetime_from_date_parsing", "datetime_parsing", "date_from_datetime_parsing", "date_parsing"}:
        return f"A(z) {label} mezőben érvényes dátumot adj meg."
    if error_type == "enum":
        return f"A(z) {label} mezőben válassz érvényes értéket."
    if error_type in {"bool_parsing", "bool_type"}:
        return f"A(z) {label} mező értéke nem érvényes."
    if error_type in {"decimal_max_digits", "decimal_max_places", "decimal_whole_digits"}:
        return f"A(z) {label} mezőben megadott összeg formátuma nem megfelelő."
    if "at least 8" in message or "greater than or equal to 8" in message or "String should have at least 8" in message:
        return "A jelszónak legalább 8 karakter hosszúnak kell lennie."
    return f"A(z) {label} mező értéke nem megfelelő."


def registration_validation_errors(exc: RequestValidationError) -> dict[str, str]:
    errors: dict[str, str] = {}
    for error in exc.errors():
        loc = list(error.get("loc", []))
        field = str(loc[-1]) if loc else "request"
        errors[field] = validation_message(
            field,
            str(error.get("msg", "")),
            str(error.get("type", "")),
            error.get("ctx"),
        )
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
        errors.append({
            "field": field,
            "message": validation_message(
                field,
                str(error.get("msg", "")),
                str(error.get("type", "")),
                error.get("ctx"),
            ),
        })
    return JSONResponse(status_code=422, content={"detail": {"message": "A megadott adatok ellenőrzése nem sikerült.", "errors": errors}})


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if request.url.path == "/api/auth/register" and isinstance(exc.detail, dict) and "errors" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    detail = translate_http_detail(exc.detail) if isinstance(exc.detail, str) else exc.detail
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


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
    return JSONResponse(status_code=500, content={"detail": "Váratlan szerverhiba történt.", "request_id": request_id})


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
