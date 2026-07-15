from starlette.responses import Response
from starlette.staticfiles import StaticFiles


class ImmutableMediaFiles(StaticFiles):
    async def get_response(self, path: str, scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code in {200, 304}:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        if path.lower().endswith(".webp"):
            response.headers["Content-Type"] = "image/webp"
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response
