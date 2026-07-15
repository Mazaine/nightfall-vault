from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class StorageHealth:
    readable: bool
    writable: bool

    @property
    def healthy(self) -> bool:
        return self.readable and self.writable


@dataclass(frozen=True)
class StagedDeletion:
    trash_root: Path
    moved: tuple[tuple[Path, Path], ...]


class StorageProvider(ABC):
    @abstractmethod
    def resolve(self, storage_key: str) -> Path:
        raise NotImplementedError

    @abstractmethod
    def save_many_atomic(self, files: Mapping[str, bytes]) -> tuple[str, ...]:
        raise NotImplementedError

    @abstractmethod
    def exists(self, storage_key: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def read_bytes(self, storage_key: str) -> bytes:
        raise NotImplementedError

    @abstractmethod
    def delete(self, storage_key: str | None) -> None:
        raise NotImplementedError

    @abstractmethod
    def delete_tree(self, storage_prefix: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def stage_delete(self, storage_keys: list[str | None]) -> StagedDeletion:
        raise NotImplementedError

    @abstractmethod
    def rollback_delete(self, staged: StagedDeletion) -> None:
        raise NotImplementedError

    @abstractmethod
    def finalize_delete(self, staged: StagedDeletion) -> None:
        raise NotImplementedError

    @abstractmethod
    def iter_files(self, prefix: str = "auctions") -> set[str]:
        raise NotImplementedError

    @abstractmethod
    def check_health(self) -> StorageHealth:
        raise NotImplementedError
