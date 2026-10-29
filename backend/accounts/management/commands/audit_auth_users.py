"""
Auditoria de passwords no modelo User (produção / migração).

Uso:
  python manage.py audit_auth_users
  python manage.py audit_auth_users --csv

Não altera dados. Para definir nova senha de forma suportada pelo Django:
  python manage.py changepassword <username>
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import identify_hasher
from django.core.exceptions import ImproperlyConfigured
from django.core.management.base import BaseCommand

User = get_user_model()


def classify_user(user) -> str:
    encoded = user.password or ""
    if not encoded:
        return "empty"
    if not user.has_usable_password():
        return "unusable"
    try:
        identify_hasher(encoded)
        return "django_hash"
    except (ImproperlyConfigured, ValueError):
        return "broken_or_plaintext"


class Command(BaseCommand):
    help = (
        "Lista utilizadores por tipo de password: hash Django válido, não utilizável, "
        "vazio ou formato inválido (ex.: texto plano importado)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--csv",
            action="store_true",
            help="Saída em CSV (id,username,email,classificacao,tamanho,is_active,date_joined)",
        )

    def handle(self, *args, **options):
        use_csv = options["csv"]
        rows = []
        summary = {"django_hash": 0, "unusable": 0, "broken_or_plaintext": 0, "empty": 0}

        for u in User.objects.all().order_by("id").iterator():
            cls = classify_user(u)
            summary[cls] = summary.get(cls, 0) + 1
            raw = u.password or ""
            rows.append(
                (
                    u.pk,
                    u.username,
                    u.email or "",
                    cls,
                    len(raw),
                    u.is_active,
                    u.date_joined.isoformat() if u.date_joined else "",
                )
            )

        if use_csv:
            self.stdout.write("id,username,email,password_class,length,is_active,date_joined")
            for pk, username, email, cls, ln, active, dj in rows:
                self.stdout.write(
                    f'{pk},{username},{email},{cls},{ln},{"true" if active else "false"},{dj}'
                )
            return

        self.stdout.write(self.style.NOTICE("=== Resumo (campo User.password) ==="))
        for k, v in sorted(summary.items()):
            self.stdout.write(f"  {k}: {v}")

        broken = [r for r in rows if r[3] == "broken_or_plaintext"]
        if broken:
            self.stdout.write(
                self.style.ERROR(
                    "\n=== CRÍTICO: passwords que não são hashes Django reconhecidos ==="
                )
            )
            for pk, username, email, cls, ln, active, dj in broken:
                self.stdout.write(
                    f"  id={pk} username={username!r} email={email!r} len={ln} active={active} joined={dj}"
                )
            self.stdout.write(
                self.style.WARNING(
                    "\nO Django NÃO consegue validar estas passwords. "
                    "É impossível recuperar a senha antiga em texto plano com segurança. "
                    "Correção: python manage.py changepassword <username> (ou fluxo de reset por e-mail)."
                )
            )

        unusable = [r for r in rows if r[3] == "unusable"]
        if unusable:
            self.stdout.write(
                self.style.NOTICE(
                    f"\n=== Senha não utilizável / bloqueada ao login ({len(unusable)}) ==="
                )
            )
            for pk, username, email, cls, ln, active, dj in unusable[:40]:
                self.stdout.write(f"  id={pk} username={username!r} email={email!r} active={active}")
            if len(unusable) > 40:
                self.stdout.write(f"  ... e mais {len(unusable) - 40}.")

        if not broken:
            self.stdout.write(self.style.SUCCESS("\nNenhum hash inválido/plaintext detectado."))
