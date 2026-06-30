from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.shipping import ShippingMethod
from app.models.user import User
from app.schemas.shipping import (
    ShippingAvailableMethodsRequest,
    ShippingAvailableMethodsResponse,
    ShippingMethodCreate,
    ShippingMethodRead,
    ShippingMethodUpdate,
)
from app.services.shipping_service import get_available_shipping_methods

router = APIRouter(tags=["shipping"])


def get_shipping_method_or_404(db: Session, method_id: int) -> ShippingMethod:
    method = db.get(ShippingMethod, method_id)
    if method is None:
        raise HTTPException(status_code=404, detail="Szállítási mód nem található.")
    return method


@router.post("/api/shipping/available-methods", response_model=ShippingAvailableMethodsResponse)
def list_available_shipping_methods(
    shipping_request: ShippingAvailableMethodsRequest,
    db: Session = Depends(get_db),
) -> ShippingAvailableMethodsResponse:
    total_booster_equivalent, methods = get_available_shipping_methods(db, shipping_request.items)
    return ShippingAvailableMethodsResponse(
        total_booster_equivalent=float(total_booster_equivalent),
        methods=[ShippingMethodRead.model_validate(method) for method in methods],
    )


@router.get("/api/admin/shipping/methods", response_model=list[ShippingMethodRead])
def list_admin_shipping_methods(
    _current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[ShippingMethodRead]:
    statement = select(ShippingMethod).order_by(
        ShippingMethod.sort_order.asc(),
        ShippingMethod.price.asc(),
        ShippingMethod.id.asc(),
    )
    return list(db.scalars(statement).all())


@router.post("/api/admin/shipping/methods", response_model=ShippingMethodRead, status_code=status.HTTP_201_CREATED)
def create_admin_shipping_method(
    method_create: ShippingMethodCreate,
    _current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ShippingMethodRead:
    existing = db.scalar(select(ShippingMethod).where(ShippingMethod.code == method_create.code))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Ez a szállítási kód már létezik.")

    method = ShippingMethod(**method_create.model_dump())
    db.add(method)
    db.commit()
    db.refresh(method)
    return ShippingMethodRead.model_validate(method)


@router.patch("/api/admin/shipping/methods/{method_id}", response_model=ShippingMethodRead)
def update_admin_shipping_method(
    method_id: int,
    method_update: ShippingMethodUpdate,
    _current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ShippingMethodRead:
    method = get_shipping_method_or_404(db, method_id)
    update_data = method_update.model_dump(exclude_unset=True)

    if "code" in update_data:
        existing = db.scalar(select(ShippingMethod).where(ShippingMethod.code == update_data["code"]))
        if existing is not None and existing.id != method.id:
            raise HTTPException(status_code=409, detail="Ez a szállítási kód már létezik.")

    for field_name, value in update_data.items():
        setattr(method, field_name, value)

    db.add(method)
    db.commit()
    db.refresh(method)
    return ShippingMethodRead.model_validate(method)


@router.delete("/api/admin/shipping/methods/{method_id}", response_model=ShippingMethodRead)
def delete_admin_shipping_method(
    method_id: int,
    _current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ShippingMethodRead:
    method = get_shipping_method_or_404(db, method_id)
    method.is_active = False
    db.add(method)
    db.commit()
    db.refresh(method)
    return ShippingMethodRead.model_validate(method)
