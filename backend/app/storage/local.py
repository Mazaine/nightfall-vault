import errno
import os
import shutil
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Mapping
from uuid import uuid4

from app.storage.base import StagedDeletion, StorageHealth, StorageProvider
from app.storage.exceptions import InvalidStorageKey, StorageUnavailable
from app.storage.paths import normalize_storage_key

DIRECTORY_MODE = 0o755
FILE_MODE = 0o644


class LocalStorageProvider(StorageProvider):
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

        try:
            os.chmod(self.root, DIRECTORY_MODE)
        except OSError as exc:
            if exc.errno != errno.EROFS:
                raise

    def resolve(self, storage_key: str) -> Path:
        key = normalize_storage_key(storage_key)
        candidate = (self.root / Path(*key.split("/"))).resolve(strict=False)

        if candidate != self.root and self.root not in candidate.parents:
            raise InvalidStorageKey("Invalid media storage key.")

        if candidate.exists() and candidate.is_symlink():
            raise InvalidStorageKey("Symlinks are not valid media files.")

        return candidate

    def _ensure_directory(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)

        current = path

        while current == self.root or self.root in current.parents:
            os.chmod(current, DIRECTORY_MODE)

            if current == self.root:
                break

            current = current.parent

    def save_many_atomic(
        self,
        files: Mapping[str, bytes],
    ) -> tuple[str, ...]:
        prepared: list[tuple[str, Path, Path]] = []
        committed: list[Path] = []

        try:
            for storage_key, content in files.items():
                destination = self.resolve(storage_key)

                if destination.exists():
                    raise StorageUnavailable(
                        "Media keys are immutable and cannot be overwritten."
                    )

                self._ensure_directory(destination.parent)

                with NamedTemporaryFile(
                    prefix=".upload-",
                    suffix=".tmp",
                    dir=destination.parent,
                    delete=False,
                ) as temporary:
                    temporary.write(content)
                    temporary.flush()
                    os.fsync(temporary.fileno())
                    temporary_path = Path(temporary.name)

                os.chmod(temporary_path, FILE_MODE)

                prepared.append(
                    (
                        storage_key,
                        temporary_path,
                        destination,
                    )
                )

            for _, temporary_path, destination in prepared:
                os.replace(temporary_path, destination)
                os.chmod(destination, FILE_MODE)
                committed.append(destination)

            return tuple(
                storage_key
                for storage_key, _, _ in prepared
            )

        except Exception:
            for _, temporary_path, _ in prepared:
                temporary_path.unlink(missing_ok=True)

            for destination in committed:
                destination.unlink(missing_ok=True)

            raise

    def exists(self, storage_key: str) -> bool:
        path = self.resolve(storage_key)
        return path.is_file() and not path.is_symlink()

    def read_bytes(self, storage_key: str) -> bytes:
        path = self.resolve(storage_key)

        if not path.is_file() or path.is_symlink():
            raise FileNotFoundError("Media file not found.")

        return path.read_bytes()

    def delete(self, storage_key: str | None) -> None:
        if storage_key:
            self.resolve(storage_key).unlink(missing_ok=True)

    def delete_tree(self, storage_prefix: str) -> None:
        path = self.resolve(storage_prefix)

        if path.exists():
            shutil.rmtree(path)

    def stage_delete(
        self,
        storage_keys: list[str | None],
    ) -> StagedDeletion:
        trash_root = self.root / ".trash" / uuid4().hex
        moved: list[tuple[Path, Path]] = []

        try:
            for storage_key in storage_keys:
                if not storage_key:
                    continue

                source = self.resolve(storage_key)

                if not source.exists():
                    continue

                relative = source.relative_to(self.root)
                target = trash_root / relative

                self._ensure_directory(target.parent)

                os.replace(source, target)
                moved.append((source, target))

            return StagedDeletion(
                trash_root=trash_root,
                moved=tuple(moved),
            )

        except Exception:
            staged = StagedDeletion(
                trash_root=trash_root,
                moved=tuple(moved),
            )
            self.rollback_delete(staged)
            raise

    def rollback_delete(
        self,
        staged: StagedDeletion,
    ) -> None:
        for source, target in reversed(staged.moved):
            if target.exists():
                self._ensure_directory(source.parent)
                os.replace(target, source)
                os.chmod(source, FILE_MODE)

        shutil.rmtree(
            staged.trash_root,
            ignore_errors=True,
        )

    def finalize_delete(
        self,
        staged: StagedDeletion,
    ) -> None:
        shutil.rmtree(
            staged.trash_root,
            ignore_errors=True,
        )

    def iter_files(
        self,
        prefix: str = "auctions",
    ) -> set[str]:
        base = self.resolve(prefix)

        if not base.exists():
            return set()

        result: set[str] = set()

        for path in base.rglob("*"):
            if path.is_file() and not path.is_symlink():
                result.add(
                    path.relative_to(self.root).as_posix()
                )

        return result

    def check_health(self) -> StorageHealth:
        readable = (
            self.root.is_dir()
            and os.access(
                self.root,
                os.R_OK,
            )
        )

        writable = False

        if readable:
            probe = self.root / f".health-{uuid4().hex}.tmp"

            try:
                with probe.open("xb") as handle:
                    handle.write(b"ok")
                    handle.flush()
                    os.fsync(handle.fileno())

                os.chmod(probe, FILE_MODE)

                writable = probe.read_bytes() == b"ok"

            except OSError:
                writable = False

            finally:
                probe.unlink(missing_ok=True)

        return StorageHealth(
            readable=readable,
            writable=writable,
        )
