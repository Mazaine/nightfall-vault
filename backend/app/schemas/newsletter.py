from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

CampaignStatus = Literal["draft", "test_sent", "ready", "sent"]
SubscriberSource = Literal["registration", "manual", "checkout", "import"]


class NewsletterCampaignCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    subject: str = Field(min_length=2, max_length=220)
    content_html: str = Field(min_length=5)
    content_text: str | None = None
    status: CampaignStatus = "draft"


class NewsletterCampaignUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    subject: str | None = Field(default=None, min_length=2, max_length=220)
    content_html: str | None = Field(default=None, min_length=5)
    content_text: str | None = None
    status: CampaignStatus | None = None


class NewsletterCampaignRead(BaseModel):
    id: int
    title: str
    subject: str
    content_html: str
    content_text: str | None
    status: CampaignStatus
    created_by_admin_id: int | None
    test_email: str | None
    sent_at: datetime | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class NewsletterSendTestRequest(BaseModel):
    test_email: EmailStr


class NewsletterSendBulkRequest(BaseModel):
    subscriber_ids: list[int] = []
    send_to_all: bool = False


class NewsletterSendBulkResponse(BaseModel):
    message: str
    sent_count: int
    failed_count: int


class NewsletterSubscriberCreate(BaseModel):
    email: EmailStr
    full_name: str | None = Field(default=None, max_length=160)
    user_id: int | None = None
    is_active: bool = True
    source: SubscriberSource = "manual"
    captcha_token: str | None = None
    turnstile_token: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class NewsletterSubscriberUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=160)
    is_active: bool | None = None
    source: SubscriberSource | None = None


class NewsletterSubscriberRead(BaseModel):
    id: int
    email: str
    full_name: str | None
    user_id: int | None
    is_active: bool
    source: SubscriberSource
    created_at: datetime
    unsubscribed_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


class NewsletterMeRead(BaseModel):
    is_active: bool
    email: str
    full_name: str | None = None


class NewsletterMeUpdate(BaseModel):
    is_active: bool

