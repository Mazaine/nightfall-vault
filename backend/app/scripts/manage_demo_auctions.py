import argparse
import json

from fastapi import HTTPException

from app.db.session import SessionLocal
from app.services.demo_auctions import CLEANUP_CONFIRMATION, CREATE_CONFIRMATION, RESET_CONFIRMATION, DemoAuctionService


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Nightfall Vault demóaukciók biztonságos kezelése")
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("status")
    preview = commands.add_parser("preview"); preview.add_argument("--regular", type=int, default=80); preview.add_argument("--featured", type=int, default=20)
    create = commands.add_parser("create"); create.add_argument("--regular", type=int, default=80); create.add_argument("--featured", type=int, default=20); create.add_argument("--confirm-production", action="store_true")
    cleanup = commands.add_parser("cleanup"); cleanup.add_argument("--batch-key"); cleanup.add_argument("--dry-run", action="store_true"); cleanup.add_argument("--confirm-production", action="store_true")
    reset = commands.add_parser("reset"); reset.add_argument("--regular", type=int, default=80); reset.add_argument("--featured", type=int, default=20); reset.add_argument("--confirm-production", action="store_true")
    return root


def main() -> None:
    args = parser().parse_args()
    db = SessionLocal()
    try:
        service = DemoAuctionService(db)
        if args.command == "status": result = service.status()
        elif args.command == "preview": result = service.preview(args.regular, args.featured)
        elif args.command == "create":
            if not args.confirm_production: raise RuntimeError("A create parancshoz kötelező a --confirm-production kapcsoló.")
            result = service.create(args.regular, args.featured, None, CREATE_CONFIRMATION, cli=True)
        elif args.command == "cleanup":
            if args.dry_run: result = service.cleanup_preview(args.batch_key)
            else:
                if not args.confirm_production: raise RuntimeError("A cleanup parancshoz kötelező a --confirm-production kapcsoló.")
                result = service.cleanup(None, CLEANUP_CONFIRMATION, args.batch_key, cli=True)
        else:
            if not args.confirm_production: raise RuntimeError("A reset parancshoz kötelező a --confirm-production kapcsoló.")
            result = service.reset(args.regular, args.featured, None, RESET_CONFIRMATION, cli=True)
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    except HTTPException as exc:
        raise SystemExit(str(exc.detail)) from None
    finally:
        db.close()


if __name__ == "__main__":
    main()
