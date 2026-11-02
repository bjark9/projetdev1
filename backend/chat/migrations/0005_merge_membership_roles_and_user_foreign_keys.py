from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0003_membership_roles"),
        ("chat", "0004_fix_live_user_foreign_keys"),
    ]

    operations = []
