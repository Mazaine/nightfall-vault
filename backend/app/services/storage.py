from pathlib import Path

from app.core.config import settings


class LocalStorage:
    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or settings.storage_upload_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, storage_key: str) -> Path:
        candidate = (self.root / storage_key).resolve()
        root = self.root.resolve()
        if root not in candidate.parents and candidate != root:
            raise ValueError("Invalid storage key")
        return candidate

    def save(self, storage_key: str, content: bytes) -> str:
        path = self._path(storage_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return storage_key

    def delete(self, storage_key: str | None) -> None:
        if not storage_key:
            return
        path = self._path(storage_key)
        if path.exists():
            path.unlink()

    def exists(self, storage_key: str) -> bool:
        return self._path(storage_key).exists()


storage = LocalStorage()
