from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0005_merge_membership_roles_and_user_foreign_keys"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="is_pinned",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="message",
            name="pinned_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="Reaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("emoji", models.CharField(max_length=8)),
                ("message", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reactions", to="chat.message")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="accounts.user")),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(fields=("message", "user", "emoji"), name="unique_message_reaction"),
                ],
            },
        ),
    ]
