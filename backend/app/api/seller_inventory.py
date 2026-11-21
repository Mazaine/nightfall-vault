import json
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.rate_limit import check_rate_limit
from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.seller_inventory import SellerStockSource as Source, SellerStockOperation as Operation
from app.services import seller_inventory as service
from app.services.stock_csv import FIELDS

router = APIRouter(prefix="/api/inventory", tags=["seller-inventory"])


class SourceData(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    mapping: dict[str, str] | None = Field(default=None, max_length=20)


@router.get("/sources")
def sources(user=Depends(require_active_user), db: Session = Depends(get_db)):
    service.seller(db, user)
    return [{"id": row.id, "name": row.name, "mapping": row.mapping} for row in db.scalars(select(Source).where(Source.user_id == user.id).order_by(Source.name))]


@router.post("/sources", status_code=201)
def create_source(payload: SourceData, user=Depends(require_active_user), db: Session = Depends(get_db)):
    service.seller(db, user)
    item = Source(user_id=user.id, name=payload.name.strip(), mapping=payload.mapping or {})
    if not item.name:
        raise HTTPException(422, "A forrás neve nem lehet üres.")
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Már létezik ilyen nevű CSV-forrás.") from None
    return {"id": item.id, "name": item.name, "mapping": item.mapping}


@router.patch("/sources/{source_id}")
def update_source(source_id: int, payload: SourceData, user=Depends(require_active_user), db: Session = Depends(get_db)):
    service.seller(db, user)
    item = service.source(db, user, source_id)
    item.name = payload.name.strip()
    if payload.mapping is not None:
        item.mapping = payload.mapping
    if not item.name:
        raise HTTPException(422, "A forrás neve nem lehet üres.")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Már létezik ilyen nevű forrás.") from None
    return {"id": item.id, "name": item.name, "mapping": item.mapping}


@router.get("")
def inventory(query: str = Query("", max_length=180), source_id: int | None = None, variant: str | None = None, condition: str | None = None, edition: str | None = None, status: Literal["active", "inactive"] | None = None, retro: bool | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100), user=Depends(require_active_user), db: Session = Depends(get_db)):
    return service.stock_read(db, user, query=query, source_id=source_id, variant=variant, condition=condition, edition=edition, status=status, retro=retro, page=page, page_size=page_size)


@router.get("/catalog")
def catalog(request: Request, query: str = Query(min_length=2, max_length=180), user=Depends(require_active_user), db: Session = Depends(get_db)):
    service.seller(db, user)
    check_rate_limit(request, "inventory_catalog", 60, str(user.id))
    return service.catalog_search(db, query)


@router.post("/preview")
async def preview(request: Request, file: UploadFile = File(...), source_id: int | None = Form(None), mapping: str = Form("{}"), header_row: int | None = Form(None), full_source: bool = Form(False), user=Depends(require_active_user), db: Session = Depends(get_db)):
    check_rate_limit(request, "inventory_upload", 20, str(user.id))
    if len(mapping) > 16000:
        raise HTTPException(413, "Túl nagy oszlopmegfeleltetés.")
    try:
        parsed_mapping = json.loads(mapping)
        if not isinstance(parsed_mapping, dict):
            raise ValueError()
    except ValueError:
        raise HTTPException(422, "Hibás oszlopmegfeleltetés.") from None
    return service.create_preview(db, user, source_id, await file.read(service.settings.inventory_csv_max_bytes + 1), file.filename or "import.csv", parsed_mapping, header_row, full_source)


@router.get("/operations")
def history(page: int = Query(1, ge=1), user=Depends(require_active_user), db: Session = Depends(get_db)):
    service.seller(db, user)
    return [dict(row._mapping) for row in db.execute(select(Operation.id, Operation.source_id, Operation.kind, Operation.status, Operation.created_at).where(Operation.user_id == user.id).order_by(Operation.id.desc()).offset((page-1)*50).limit(50))]


@router.get("/operations/{operation_id}")
def read_operation(operation_id: int, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100), pending_only: bool = False, user=Depends(require_active_user), db: Session = Depends(get_db)):
    service.seller(db, user)
    return service.operation_read(service.own_operation(db, user, operation_id), offset=offset, limit=limit, pending_only=pending_only)


class RowEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    values: dict[str, str | int | bool] = Field(default_factory=dict, max_length=20)
    skip: bool = False
    mode: Literal["auto", "link", "separate"] = "auto"
    target_id: int | None = Field(default=None, gt=0)
    confirm_stock: bool = False
    confirm_version: bool = False
    confirm_source_transfer: bool = False
    confirm_separate: bool = False

    @field_validator("values")
    @classmethod
    def allowed_values(cls, values):
        if any(key not in FIELDS or len(str(value)) > 500 for key, value in values.items()):
            raise ValueError("Ismeretlen vagy túl hosszú sormező.")
        return values


@router.patch("/operations/{operation_id}/rows/{index}")
def row_edit(operation_id: int, index: int, payload: RowEdit, user=Depends(require_active_user), db: Session = Depends(get_db)):
    return service.edit_row(db, user, operation_id, index, payload.model_dump())


@router.patch("/operations/{operation_id}/mode")
def change_mode(operation_id: int, full_source: bool, user=Depends(require_active_user), db: Session = Depends(get_db)):
    service.seller(db, user, lock=True)
    item = service.own_operation(db, user, operation_id, lock=True)
    if item.kind != "import" or item.status == "undone":
        raise HTTPException(409, "Ez nem szerkeszthető import.")
    item.context = {**item.context, "full_source": full_source}
    service.plan_rows(db, user, item)
    db.commit()
    return service.operation_read(item)


@router.post("/operations/{operation_id}/resolve")
def resolve(operation_id: int, request: Request, user=Depends(require_active_user), db: Session = Depends(get_db)):
    check_rate_limit(request, "inventory_resolve", 20, str(user.id))
    return service.resolve_batch(db, user, operation_id)


class Apply(BaseModel):
    selected: list[int] | None = Field(default=None, max_length=200)
    version: str = Field(min_length=64, max_length=64)
    confirmed: bool = False
    confirm_missing: bool = False


@router.post("/operations/{operation_id}/apply")
def apply(operation_id: int, payload: Apply, user=Depends(require_active_user), db: Session = Depends(get_db)):
    return service.apply_operation(db, user, operation_id, payload.selected, payload.version, payload.confirmed, payload.confirm_missing)


class Bulk(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=1000)
    price_mode: Literal["set", "add", "subtract", "percent_up", "percent_down"] | None = None
    price_value: Decimal = Field(default=0, ge=0, le=999999999)
    quantity_mode: Literal["set", "add", "subtract"] | None = None
    quantity_value: int = Field(default=0, ge=0, le=2147483647, strict=True)
    retro: bool | None = None
    status: Literal["active", "inactive"] | None = None
    source_id: int | None = Field(default=None, gt=0)


@router.post("/bulk/preview")
def bulk(payload: Bulk, user=Depends(require_active_user), db: Session = Depends(get_db)):
    return service.bulk_preview(db, user, payload.ids, payload.model_dump(exclude={"ids"}, mode="json"))


@router.get("/operations/{operation_id}/undo")
def undo_preview(operation_id: int, user=Depends(require_active_user), db: Session = Depends(get_db)):
    service.seller(db, user)
    return service.undo_preview(db, user, operation_id)


class Undo(BaseModel):
    token: str = Field(min_length=64, max_length=64)
    confirmed: bool = False


@router.post("/operations/{operation_id}/undo")
def undo(operation_id: int, payload: Undo, user=Depends(require_active_user), db: Session = Depends(get_db)):
    return service.undo(db, user, operation_id, payload.token, payload.confirmed)


@router.get("/export")
def export(format: Literal["nightfall", "hkk"] = "nightfall", source_id: int | None = None, ids: str | None = Query(None, max_length=16000), include_inactive: bool = False, include_empty: bool = False, user=Depends(require_active_user), db: Session = Depends(get_db)):
    try:
        selected = [int(value) for value in ids.split(",")] if ids else None
        if selected and (len(selected) > 1000 or min(selected) < 1):
            raise ValueError()
    except ValueError:
        raise HTTPException(422, "Hibás kijelölés.") from None
    data = service.export_csv(db, user, source_id=source_id, ids=selected, format=format, include_inactive=include_inactive, include_empty=include_empty)
    suffix = "complete" if source_id and not selected and include_inactive and include_empty else "partial"
    return Response(data, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{format}-inventory-{suffix}.csv"', "Cache-Control": "no-store"})
