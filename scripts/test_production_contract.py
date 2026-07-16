from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


compose = read("docker-compose.production.yml")
assert "postgres-test" not in compose
assert compose.count("ports:") == 1
assert all(value in compose for value in ("restart: unless-stopped", "max-size:", "mem_limit:", "Dockerfile.prod"))

backend = read("backend/Dockerfile.prod")
frontend = read("frontend/Dockerfile.prod")
assert "--reload" not in backend and "--forwarded-allow-ips\", \"*" not in backend
assert "USER nightfall" in backend
assert "npm run dev" not in frontend and "nginx-unprivileged" in frontend

proxy = read("nginx/default.conf")
assert all(value in proxy for value in ("proxy_buffering off", "proxy_read_timeout 1h", "alias /srv/nightfall-media/", "Content-Security-Policy", "autoindex off"))

for name in ("deploy_production.sh", "backup_production.sh", "restore_production.sh", "rollback_production.sh", "smoke_test_production.sh"):
    assert "set -Eeuo pipefail" in read(f"scripts/{name}")
restore = read("scripts/restore_production.sh")
assert all(value in restore for value in ("--confirm-data-loss", "ALLOW_PRODUCTION_RESTORE", "backup_production.sh"))
env = read(".env.production.example")
assert all(value in env for value in ("CHANGE_ME", "ENVIRONMENT=production", "DEVELOPMENT_ADMIN_SEED_ENABLED=false"))
print("A production infrastruktúra szerződéses tesztje sikeres.")
