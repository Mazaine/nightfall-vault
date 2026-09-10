# Notification outbox

The notification dispatcher writes the domain `Notification` and its delivery
tasks into PostgreSQL in the caller's transaction. It does not publish to Redis
or send email. A rollback therefore removes both the notification and the
pending delivery tasks.

## Tasks and states

One `realtime` task is created for every notification. An `email` task is also
created when the persisted notification preferences enable email. The unique
`(event_key, task_type)` constraint prevents duplicate tasks for a logical
event and channel.

States are:

- `pending`: ready for its first attempt;
- `processing`: claimed by one worker;
- `retry`: transient failure, eligible at `next_attempt_at`;
- `delivered`: delivery succeeded or the email was intentionally suppressed by
  the existing global/user policy;
- `failed`: permanent error or the configured attempt limit was reached.

Workers claim rows with `FOR UPDATE SKIP LOCKED`. A `processing` row whose lock
timestamp is older than `NOTIFICATION_OUTBOX_LOCK_TIMEOUT_SECONDS` can be
reclaimed after a worker crash. Retry delays use bounded exponential backoff.

## Running the worker

Docker Compose starts the lightweight worker with the existing backend image:

```text
python -m app.workers.notification_outbox
```

Relevant settings:

- `NOTIFICATION_OUTBOX_ENABLED` (rollback/kill switch for processing only);
- `NOTIFICATION_OUTBOX_POLL_SECONDS`;
- `NOTIFICATION_OUTBOX_BATCH_SIZE`;
- `NOTIFICATION_OUTBOX_MAX_ATTEMPTS`;
- `NOTIFICATION_OUTBOX_BASE_BACKOFF_SECONDS`;
- `NOTIFICATION_OUTBOX_MAX_BACKOFF_SECONDS`;
- `NOTIFICATION_OUTBOX_LOCK_TIMEOUT_SECONDS`.

Disabling processing does not delete jobs. Re-enabling it resumes delivery.
The worker has no effect on API or auction-scheduler health.

## Idempotency and remaining delivery risk

Callers should provide a deterministic `Notification.event_key` derived only
from stable domain identifiers. The database prevents duplicate notifications
and duplicate per-channel tasks.

Delivery is at-least-once. Redis stream publication is naturally identifiable
by the notification id on the client. The current email providers do not offer
an idempotency key through this integration. A worker crash after the provider
accepted an email but before `delivered` was committed can therefore cause one
duplicate email on retry. The system does not claim exactly-once email delivery.

The task type check currently permits `realtime` and `email`. A later migration
can add `push`; FCM, device records and tokens are intentionally absent now.

## Internal target routes

All persisted notification targets pass through the centralized allowlist in
`app.services.notification_targets`. External URLs, protocol-relative URLs,
backslashes, traversal, unsafe encoded path characters, invalid identifiers and
unknown routes are rejected before a notification is flushed.

## Manual verification

1. Start PostgreSQL, Redis, the API, auction scheduler and notification worker.
2. Place two bids from different users and confirm the first bidder receives one
   saved notification and one SSE update after the bid commit.
3. Stop Redis, place another bid and confirm the bid remains committed while the
   realtime task enters `retry`.
4. Start Redis and confirm the task becomes `delivered`.
5. With test email delivery enabled, verify category preferences still suppress
   or enqueue email exactly as before.
6. Set `NOTIFICATION_OUTBOX_ENABLED=false`; confirm domain operations continue
   and pending jobs remain available for later processing.

Rollback is operationally safest by disabling the worker first. The schema is
additive; application rollback can leave the table in place. The Alembic
downgrade drops only the outbox table and must be used only after pending jobs
are no longer needed.
