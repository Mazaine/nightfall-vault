from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.db.session import SessionLocal
from app.models.moderation import Report, UserBlock
from app.models.notification import Notification
from app.models.security_log import AuditLog
from app.models.user import SellerFollow
from test_auction_domain import auth_headers, auction_payload, cleanup_test_data, client, create_sold_auction, create_test_user, upload_png


def cleanup_sprint8_data() -> None:
    db = SessionLocal()
    try:
        db.execute(delete(UserBlock))
        db.execute(delete(Report))
        db.execute(delete(SellerFollow))
        db.commit()
    finally:
        db.close()
    cleanup_test_data()


def create_active_auction(seller):
    now = datetime.now(timezone.utc)
    response = client.post(
        "/api/auctions",
        json=auction_payload(starts_at=(now - timedelta(minutes=2)).isoformat(), ends_at=(now + timedelta(days=1)).isoformat()),
        headers=auth_headers(seller),
    )
    assert response.status_code == 201
    auction = response.json()
    assert upload_png(auction["id"], seller).status_code == 201
    assert client.post(f"/api/auctions/{auction['id']}/activate", headers=auth_headers(seller)).status_code == 200
    return auction


def test_report_creation_privacy_duplicate_and_admin_queue() -> None:
    cleanup_sprint8_data()
    seller = create_test_user("seller-report@auction-test.local")
    reporter = create_test_user("reporter-report@auction-test.local")
    other = create_test_user("other-report@auction-test.local")
    admin = create_test_user("admin-report@auction-test.local", role="admin")
    auction = create_active_auction(seller)

    anonymous = client.post(f"/api/reports/auctions/{auction['id']}", json={"reason": "spam"})
    own_auction = client.post(f"/api/reports/auctions/{auction['id']}", json={"reason": "spam"}, headers=auth_headers(seller))
    created = client.post(f"/api/reports/auctions/{auction['id']}", json={"reason": "spam", "details": "Gyanus aukcio."}, headers=auth_headers(reporter))
    duplicate = client.post(f"/api/reports/auctions/{auction['id']}", json={"reason": "spam"}, headers=auth_headers(reporter))
    own_profile = client.post(f"/api/reports/users/{reporter.username}", json={"reason": "harassment"}, headers=auth_headers(reporter))
    user_report = client.post(f"/api/reports/users/{seller.username}", json={"reason": "suspected_fraud"}, headers=auth_headers(other))
    invalid_target = client.post("/api/reports/users/no-such-user", json={"reason": "spam"}, headers=auth_headers(reporter))

    assert anonymous.status_code == 401
    assert own_auction.status_code == 409
    assert created.status_code == 201
    assert duplicate.status_code == 409
    assert own_profile.status_code == 409
    assert user_report.status_code == 201
    assert invalid_target.status_code == 404
    assert "admin_note" not in created.json()
    assert "priority" not in created.json()

    mine = client.get("/api/reports/me", headers=auth_headers(reporter))
    foreign_detail = client.get(f"/api/reports/me/{user_report.json()['id']}", headers=auth_headers(reporter))
    normal_admin_list = client.get("/api/admin/reports", headers=auth_headers(reporter))
    admin_list = client.get("/api/admin/reports?status=open&target_type=auction&priority=normal&limit=1", headers=auth_headers(admin))

    assert mine.status_code == 200
    assert mine.json()["total"] == 1
    assert foreign_detail.status_code == 404
    assert normal_admin_list.status_code == 403
    assert admin_list.status_code == 200
    assert admin_list.json()["total"] >= 1
    assert admin_list.json()["items"][0]["admin_note"] is None


def test_admin_report_status_priority_note_audit_and_notification() -> None:
    cleanup_sprint8_data()
    seller = create_test_user("seller-admin-report@auction-test.local")
    reporter = create_test_user("reporter-admin-report@auction-test.local")
    admin = create_test_user("admin-admin-report@auction-test.local", role="admin")
    auction = create_active_auction(seller)
    report = client.post(f"/api/reports/auctions/{auction['id']}", json={"reason": "misleading_description"}, headers=auth_headers(reporter)).json()

    priority = client.put(f"/api/admin/reports/{report['id']}/priority", json={"priority": "high"}, headers=auth_headers(admin))
    note = client.put(f"/api/admin/reports/{report['id']}/note", json={"admin_note": "Internal moderation note"}, headers=auth_headers(admin))
    status_update = client.put(f"/api/admin/reports/{report['id']}/status", json={"status": "under_review"}, headers=auth_headers(admin))
    resolved = client.put(f"/api/admin/reports/{report['id']}/status", json={"status": "resolved", "public_resolution": "Koszonjuk, ellenoriztuk."}, headers=auth_headers(admin))
    invalid_reopen = client.put(f"/api/admin/reports/{report['id']}/status", json={"status": "under_review"}, headers=auth_headers(admin))
    user_view = client.get(f"/api/reports/me/{report['id']}", headers=auth_headers(reporter))

    assert priority.status_code == 200
    assert priority.json()["priority"] == "high"
    assert note.status_code == 200
    assert note.json()["admin_note"] == "Internal moderation note"
    assert status_update.status_code == 200
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert invalid_reopen.status_code == 409
    assert "admin_note" not in user_view.json()
    assert user_view.json()["public_resolution"] == "Koszonjuk, ellenoriztuk."

    db = SessionLocal()
    try:
        audit_actions = {row[0] for row in db.execute(select(AuditLog.action)).all()}
        notifications = db.scalars(select(Notification).where(Notification.user_id == reporter.id, Notification.type == "report_resolved")).all()
    finally:
        db.close()
    assert "report_created" in audit_actions
    assert "report_priority_changed" in audit_actions
    assert "report_note_changed" in audit_actions
    assert "report_status_changed" in audit_actions
    assert len(notifications) == 1


def test_user_blocks_follow_visibility_and_chat_restriction() -> None:
    cleanup_sprint8_data()
    seller = create_test_user("seller-block@auction-test.local")
    winner = create_test_user("winner-block@auction-test.local")
    admin = create_test_user("admin-block@auction-test.local", role="admin")
    sold = create_sold_auction(seller, winner, admin)

    follow_before = client.post("/api/follow", json={"username": seller.username}, headers=auth_headers(winner))
    seller_message = client.post(f"/api/auctions/{sold['id']}/messages", json={"message": "Korabbi uzenet."}, headers=auth_headers(seller))
    self_block = client.post(f"/api/blocks/{winner.username}", headers=auth_headers(winner))
    created_block = client.post(f"/api/blocks/{seller.username}", headers=auth_headers(winner))
    duplicate = client.post(f"/api/blocks/{seller.username}", headers=auth_headers(winner))
    following_after_block = client.get("/api/following", headers=auth_headers(winner))
    blocked_follow = client.post("/api/follow", json={"username": seller.username}, headers=auth_headers(winner))
    blocked_message = client.post(f"/api/auctions/{sold['id']}/messages", json={"message": "Tiltott uj uzenet."}, headers=auth_headers(seller))
    messages_after_block = client.get(f"/api/auctions/{sold['id']}/messages", headers=auth_headers(winner))
    block_list = client.get("/api/blocks", headers=auth_headers(winner))
    status_response = client.get(f"/api/blocks/{seller.username}/status", headers=auth_headers(winner))
    unblocked_by_other = client.request("DELETE", f"/api/blocks/{seller.username}", headers=auth_headers(seller))
    removed = client.request("DELETE", f"/api/blocks/{seller.username}", headers=auth_headers(winner))

    assert follow_before.status_code == 201
    assert seller_message.status_code == 201
    assert self_block.status_code == 409
    assert created_block.status_code == 201
    assert duplicate.status_code == 409
    assert following_after_block.json() == []
    assert blocked_follow.status_code == 403
    assert blocked_message.status_code == 403
    assert messages_after_block.status_code == 200
    assert messages_after_block.json()[0]["message"] == "Korabbi uzenet."
    assert block_list.json()[0]["username"] == seller.username
    assert status_response.json()["is_blocked"] is True
    assert unblocked_by_other.status_code == 404
    assert removed.status_code == 204

    db = SessionLocal()
    try:
        audit_actions = {row[0] for row in db.execute(select(AuditLog.action)).all()}
        block_notifications = db.scalars(select(Notification).where(Notification.user_id == seller.id, Notification.type.like("%block%"))).all()
    finally:
        db.close()
    assert "user_block_created" in audit_actions
    assert "user_block_removed" in audit_actions
    assert block_notifications == []
