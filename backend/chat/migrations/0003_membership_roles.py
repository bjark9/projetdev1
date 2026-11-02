from django.db import migrations, models


def assign_legacy_owners(apps, schema_editor):
    Membership = apps.get_model("chat", "Membership")
    database = schema_editor.connection.alias
    group_ids = (
        Membership.objects.using(database)
        .exclude(group_id=None)
        .values_list("group_id", flat=True)
        .distinct()
    )
    for group_id in group_ids:
        owner = (
            Membership.objects.using(database)
            .filter(group_id=group_id)
            .order_by("joined_at", "pk")
            .first()
        )
        if owner is not None:
            Membership.objects.using(database).filter(pk=owner.pk).update(role="owner")


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0002_alter_membership_group"),
    ]

    operations = [
        migrations.AddField(
            model_name="membership",
            name="role",
            field=models.CharField(
                choices=[("owner", "Owner"), ("admin", "Admin"), ("member", "Member")],
                default="member",
                max_length=10,
            ),
        ),
        migrations.RunPython(assign_legacy_owners, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="membership",
            constraint=models.UniqueConstraint(
                condition=models.Q(("group__isnull", False), ("role", "owner")),
                fields=("group",),
                name="unique_group_owner",
            ),
        ),
    ]
