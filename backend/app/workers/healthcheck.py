from app.services.scheduler_health import read_scheduler_heartbeat


if __name__ == "__main__":
    if read_scheduler_heartbeat() is None:
        raise SystemExit(1)
