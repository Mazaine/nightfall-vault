from pydantic import BaseModel, EmailStr


class TestEmailRequest(BaseModel):
    email: EmailStr


class TestEmailResponse(BaseModel):
    message: str

