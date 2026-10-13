import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_user_clerk_id"),
        ("chat", "0002_alter_membership_group"),
    ]

    operations = [
        migrations.AlterField(
            model_name="membership",
            name="user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="memberships",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="group",
            name="members",
            field=models.ManyToManyField(
                related_name="chat_groups",
                through="chat.Membership",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="message",
            name="sender",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="sent_messages",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="message",
            name="read_by",
            field=models.ManyToManyField(
                blank=True,
                related_name="read_messages",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
