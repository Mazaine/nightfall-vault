# Sprint 7 Report - Public profiles, reputation and auction discovery

## Status

Sprint 7 status: completed with documented technical debt.

Project version after Sprint 7: `v0.7.0-dev`.

No push was performed.

## Scope completed

- Public user profile endpoint: `GET /api/users/{username}`.
- Public user review listing: `GET /api/users/{username}/reviews` with pagination and sorting.
- Auction review listing changed to paginated response: `GET /api/auctions/{auction_id}/reviews`.
- Seller follow system:
  - `POST /api/follow`
  - `DELETE /api/follow`
  - `GET /api/following`
- Database model and migration for `seller_follows`.
- Database constraints for self-follow prevention and duplicate follower/seller pairs.
- `seller_new_auction` notification type for followed seller auction activation.
- Backend auction discovery filters:
  - category
  - condition
  - price range
  - bid count
  - Buy Now
  - soon ending
  - new auctions
- Backend auction sorting:
  - newest
  - oldest
  - highest price
  - lowest price
  - most bids
  - fewest bids
  - soon ending
  - Buy Now first
- Frontend public profile page: `/users/:username`.
- Seller name links from auction cards and auction detail page.
- Auction list filter panel, sorting controls, empty state, error state and skeleton loading state.
- Review display with date, stars and text comment rendering.
- Sprint 7 backend tests for profile, authorization, review listing, follow system, search and sorting.

## Privacy and security notes

Public profile responses do not include:

- email address;
- admin role/status;
- internal user ID;
- notification preferences;
- audit data.

Follow creation uses the authenticated current user as follower. The target seller is resolved backend-side from username. Self-follow and duplicate follow rows are protected at service and database level.

Review creation remains append-only through the existing auction review endpoint. No edit or delete endpoint was introduced. Reviewer and reviewed user are still derived or validated server-side by the auction lifecycle service.

Review comments and messages are rendered as React text content. No `dangerouslySetInnerHTML` usage was introduced.

## Backend tests added

File: `backend/tests/test_sprint7_profiles.py`

- `test_public_profile_exposes_safe_fields_and_stats`
- `test_follow_system_requires_auth_prevents_self_follow_and_lists_sellers`
- `test_public_review_listing_supports_pagination_and_sorting`
- `test_auction_search_filters_and_sorting`

## Verification actually run

```powershell
docker compose up -d
```

Result: services were running. Docker reported one existing orphan restore container: `nightfall-vault-postgres_restore-1`. It was not removed because Sprint 7 did not request cleanup.

```powershell
docker compose ps
```

Observed state:

- `postgres`: running, healthy
- `redis`: running, healthy
- `backend`: running
- `frontend`: running
- `postgres_restore`: running, healthy, orphan restore service from previous restore validation

```powershell
docker compose exec -T backend alembic upgrade head
```

Result: successful. Database is at Alembic head after `0007_profiles_and_follows`.

```powershell
docker compose exec -T backend pytest
```

Result: `49 passed, 233 warnings`.

```powershell
docker compose exec -T frontend npm run build
```

Result: successful TypeScript and Vite production build.

## Known warnings and technical debt

- Pytest still reports existing dependency/runtime deprecation warnings from `passlib`, `python-jose` datetime usage and one Pydantic `Field(ne=0)` warning.
- Sprint 6 dependency audit findings remain production-release technical debt until package upgrades are planned and verified.
- `Product` legacy domain still exists in the repository and remains outside Sprint 7 scope.
- `postgres_restore` orphan container exists from previous restore validation. It is healthy and was intentionally not removed during Sprint 7.
- Auction list API response changed from a raw list to a paginated object. The active frontend was updated accordingly.

## Files changed at a high level

Backend:

- `backend/app/api/users.py`
- `backend/app/api/follow.py`
- `backend/app/api/auctions.py`
- `backend/app/models/user.py`
- `backend/app/models/notification.py`
- `backend/app/schemas/user.py`
- `backend/app/schemas/auction.py`
- `backend/app/services/notifications.py`
- `backend/alembic/versions/0007_profiles_and_follows.py`
- `backend/tests/test_sprint7_profiles.py`

Frontend:

- `frontend/src/api/users.ts`
- `frontend/src/api/auctions.ts`
- `frontend/src/pages/UserProfilePage.tsx`
- `frontend/src/pages/AuctionsPage.tsx`
- `frontend/src/pages/AuctionDetailPage.tsx`
- `frontend/src/components/AuctionCard.tsx`
- `frontend/src/App.tsx`
- `frontend/src/styles/base/global.css`

Documentation:

- `README.md`
- `docs/PROJECT_STATUS.md`
- `docs/SECURITY_AND_OPERATIONS.md`
- `docs/SPRINT_7_REPORT.md`

## Acceptance criteria

- Public profile works: passed by backend tests.
- Seller profile works: implemented in frontend and backend.
- Review list works: passed by backend tests.
- Profile statistics work: passed by backend tests.
- Follow system works: passed by backend tests.
- Search expanded: passed by backend tests.
- Sorting works: passed by backend tests.
- Backend tests successful: `49 passed`.
- Frontend build successful: yes.
- Documentation updated: yes.
- Docker works: yes, core services running.
- Git working tree clean: to be verified after Sprint 7 commit.
- Push not performed: yes.
