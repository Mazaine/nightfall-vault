from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.pickup_point import PickupPoint
from app.schemas.pickup_point import PickupPointRead

router = APIRouter(prefix="/api/pickup-points", tags=["pickup-points"])


def normalize_search_value(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip()
    return normalized_value or None


@router.get("", response_model=list[PickupPointRead])
def list_pickup_points(
    carrier: str | None = Query(default=None),
    city: str | None = Query(default=None),
    zip: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[PickupPoint]:
    statement = select(PickupPoint)

    normalized_carrier = normalize_search_value(carrier)
    normalized_city = normalize_search_value(city)
    normalized_zip = normalize_search_value(zip)

    if normalized_carrier:
        statement = statement.where(PickupPoint.carrier == normalized_carrier.lower())
    if normalized_city:
        statement = statement.where(PickupPoint.city.ilike(f"%{normalized_city}%"))
    if normalized_zip:
        statement = statement.where(PickupPoint.zip.ilike(f"{normalized_zip}%"))

    statement = statement.order_by(
        PickupPoint.carrier.asc(),
        PickupPoint.city.asc(),
        PickupPoint.name.asc(),
    ).offset(offset).limit(limit)
    return list(db.scalars(statement).all())


@router.get("/search", response_model=list[PickupPointRead])
def search_pickup_points(
    q: str | None = Query(default=None, description="Keresés város, irányítószám vagy név alapján."),
    carrier: str | None = Query(default=None),
    city: str | None = Query(default=None),
    zip: str | None = Query(default=None),
    name: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[PickupPoint]:
    statement = select(PickupPoint)

    normalized_carrier = normalize_search_value(carrier)
    normalized_query = normalize_search_value(q)
    normalized_city = normalize_search_value(city)
    normalized_zip = normalize_search_value(zip)
    normalized_name = normalize_search_value(name)

    if normalized_carrier:
        statement = statement.where(PickupPoint.carrier == normalized_carrier.lower())

    if normalized_query:
        like_query = f"%{normalized_query}%"
        statement = statement.where(
            or_(
                PickupPoint.city.ilike(like_query),
                PickupPoint.zip.ilike(like_query),
                PickupPoint.name.ilike(like_query),
                PickupPoint.address.ilike(like_query),
            ),
        )

    if normalized_city:
        statement = statement.where(PickupPoint.city.ilike(f"%{normalized_city}%"))
    if normalized_zip:
        statement = statement.where(PickupPoint.zip.ilike(f"{normalized_zip}%"))
    if normalized_name:
        statement = statement.where(PickupPoint.name.ilike(f"%{normalized_name}%"))

    statement = statement.order_by(
        PickupPoint.city.asc(),
        PickupPoint.name.asc(),
    ).limit(limit)
    return list(db.scalars(statement).all())


@router.get("/{pickup_point_id}", response_model=PickupPointRead)
def get_pickup_point(
    pickup_point_id: int,
    db: Session = Depends(get_db),
) -> PickupPoint:
    pickup_point = db.get(PickupPoint, pickup_point_id)
    if pickup_point is None:
        raise HTTPException(status_code=404, detail="Átvételi pont nem található.")
    return pickup_point
