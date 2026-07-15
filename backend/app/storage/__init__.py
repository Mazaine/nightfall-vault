from app.core.config import settings
from app.storage.local import LocalStorageProvider

storage = LocalStorageProvider(settings.media_root)

__all__ = ["LocalStorageProvider", "storage"]
