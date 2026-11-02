from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0003_use_accounts_user_relations"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE chat_membership
                DROP CONSTRAINT IF EXISTS chat_membership_user_id_b82c7bc9_fk_auth_user_id;
                ALTER TABLE chat_membership
                ADD CONSTRAINT chat_membership_user_id_accounts_user_id_fk
                FOREIGN KEY (user_id) REFERENCES accounts_user(id);

                ALTER TABLE chat_message
                DROP CONSTRAINT IF EXISTS chat_message_sender_id_991c686c_fk_auth_user_id;
                ALTER TABLE chat_message
                ADD CONSTRAINT chat_message_sender_id_accounts_user_id_fk
                FOREIGN KEY (sender_id) REFERENCES accounts_user(id);

                ALTER TABLE chat_message_read_by
                DROP CONSTRAINT IF EXISTS chat_message_read_by_user_id_68c4ef09_fk_auth_user_id;
                ALTER TABLE chat_message_read_by
                ADD CONSTRAINT chat_message_read_by_user_id_accounts_user_id_fk
                FOREIGN KEY (user_id) REFERENCES accounts_user(id);
            """,
            reverse_sql="""
                ALTER TABLE chat_membership
                DROP CONSTRAINT IF EXISTS chat_membership_user_id_accounts_user_id_fk;
                ALTER TABLE chat_membership
                ADD CONSTRAINT chat_membership_user_id_b82c7bc9_fk_auth_user_id
                FOREIGN KEY (user_id) REFERENCES auth_user(id);

                ALTER TABLE chat_message
                DROP CONSTRAINT IF EXISTS chat_message_sender_id_accounts_user_id_fk;
                ALTER TABLE chat_message
                ADD CONSTRAINT chat_message_sender_id_991c686c_fk_auth_user_id
                FOREIGN KEY (sender_id) REFERENCES auth_user(id);

                ALTER TABLE chat_message_read_by
                DROP CONSTRAINT IF EXISTS chat_message_read_by_user_id_accounts_user_id_fk;
                ALTER TABLE chat_message_read_by
                ADD CONSTRAINT chat_message_read_by_user_id_68c4ef09_fk_auth_user_id
                FOREIGN KEY (user_id) REFERENCES auth_user(id);
            """,
        )
    ]
