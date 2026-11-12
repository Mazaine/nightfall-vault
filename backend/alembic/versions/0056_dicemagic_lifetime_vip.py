"""Permanent VIP for the non-login DiceMagic integration identity."""
from alembic import op
import sqlalchemy as sa

revision = "0056_dicemagic_lifetime_vip"
down_revision = "0055_dicemagic_checkout"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("vip_lifetime", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute(
        "UPDATE users SET vip_lifetime = true "
        "WHERE username = 'dicemagic_shop' "
        "AND email = 'dicemagic-integration@nightfall.invalid' "
        "AND password_login_enabled = false AND is_active = false"
    )


def downgrade():
    op.drop_column("users", "vip_lifetime")
