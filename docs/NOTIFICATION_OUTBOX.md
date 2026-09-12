# Notification outbox

The notification dispatcher writes the domain `Notification` and its delivery tasks into PostgreSQL in the caller's transaction. It does not publish to Redis, send email, or call a Web Push provider inside the domain transaction. A rollback therefore removes both the notification and all pending delivery tasks.

## Tasks and states

One `realtime` task is created for every notification. An `email` task is created when the persisted category preference enables email. With complete Web Push configuration, an enabled category push preference, and active subscriptions, one `push` task is created for each subscription. Its stable event key includes the logical delivery event and subscription id; the task also stores that subscription's foreign key. This preserves multiple-device delivery and isolates device failures.

The unique `(event_key, task_type)` constraint prevents duplicate tasks for a logical event, channel, and—through the push event key—device.

States are:

- `pending`: ready for its first attempt;
- `processing`: claimed by one worker;
- `retry`: transient failure, eligible at `next_attempt_at`;
- `delivered`: delivery succeeded or was intentionally suppressed/revoked;
- `failed`: permanent error or the configured attempt limit was reached.

Workers claim rows with `FOR UPDATE SKIP LOCKED`. A stale `processing` row can be reclaimed after a worker crash. Retry delays use bounded exponential backoff.

## Running and disabling the worker

Docker Compose starts the worker with the backend image:

```text
python -m app.workers.notification_outbox
```

Outbox settings include `NOTIFICATION_OUTBOX_ENABLED`, poll interval, batch size, attempt limit, backoff bounds, and lock timeout. Web Push adds `WEB_PUSH_ENABLED`, VAPID values, request timeout, and the provider host suffix allowlist; see `docs/WEB_PUSH_SUBSCRIPTIONS.md`.

Disabling `NOTIFICATION_OUTBOX_ENABLED` pauses every delivery task without deleting jobs. Disabling only `WEB_PUSH_ENABLED` prevents new push tasks and makes already claimed push delivery a safe no-op, while realtime and email remain available. Neither worker setting changes API or auction-scheduler health.

## Idempotency and delivery risk

Callers provide a deterministic `Notification.event_key` derived from stable domain identifiers. The database prevents duplicate notifications and delivery tasks.

Delivery is at-least-once. Redis publication is identifiable by notification id. Email providers in this integration do not expose an idempotency key. Web Push also has an acceptance/commit gap: a worker crash after provider acceptance but before the outbox commit can resend. Web Push uses a stable notification tag so a conforming device can replace the existing notification. The system does not claim exactly-once email or push delivery.

Each push task rechecks that its subscription is active and still belongs to the notification recipient. A transferred or revoked endpoint cannot receive an earlier owner's queued notification. An expired endpoint (404/410) is soft-revoked without retry; 429, 5xx, network, DNS, and timeout errors retry; permanent payload/subscription failures fail only that device's task.

## Internal target routes and payload privacy

All persisted notification targets pass through the centralized allowlist in `app.services.notification_targets`. External URLs, protocol-relative URLs, backslashes, traversal, unsafe encoded path characters, invalid identifiers, and unknown routes are rejected before flush and again before push payload creation.

Web Push payloads use a strict versioned schema, bounded length, local icon, stable tag, validated internal target, and category-specific generic copy. Persisted free-form notification title/message, endpoint, subscription keys, contact data, transaction details, and VAPID secrets are not sent to the lock screen or written to error logs.

## Manual verification

1. Start isolated PostgreSQL/Redis, API, scheduler, and notification worker services.
2. Place two bids and confirm one saved notification plus one SSE update after commit.
3. Stop Redis, trigger an event, and confirm the domain transaction commits while realtime enters `retry`; restart Redis and confirm delivery.
4. Enable email for one category and verify its existing suppression/delivery rules are unchanged.
5. With staging VAPID values and an Android staging subscription, enable push explicitly for one category and verify one task per active device.
6. Test foreground, background, locked-screen, multi-tab, click navigation, unsubscribe, expired endpoint, and provider outage behavior using the checklist in `docs/WEB_PUSH_SUBSCRIPTIONS.md`.
7. Set `NOTIFICATION_OUTBOX_ENABLED=false`; confirm domain operations continue and pending jobs remain available.

Rollback is operationally safest by disabling workers/channels first. Schema downgrades that remove outbox or push columns must only run after pending jobs are no longer needed and after a verified backup.
