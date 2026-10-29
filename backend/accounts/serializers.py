from rest_framework import serializers
from .models import User


def _normalize_phone(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _ensure_unique_phone(phone_value: str, *, exclude_user_id=None):
    normalized = _normalize_phone(phone_value)
    if not normalized:
        return phone_value
    for user in User.objects.exclude(pk=exclude_user_id).exclude(phone__isnull=True):
        if _normalize_phone(getattr(user, "phone", "")) == normalized:
            raise serializers.ValidationError("Este telefone já está em uso por outro usuário.")
    return phone_value


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "full_name", "phone", "role", "avatar"]
        read_only_fields = ["id"]

    def validate_email(self, value):
        email = str(value or "").strip().lower()
        qs = User.objects.exclude(pk=getattr(self.instance, "pk", None)).filter(email__iexact=email)
        if qs.exists():
            raise serializers.ValidationError("Este e-mail já está em uso.")
        return email

    def validate_phone(self, value):
        return _ensure_unique_phone(value, exclude_user_id=getattr(self.instance, "pk", None))


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password", "password_confirm", "first_name", "last_name", "phone"]

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password": "As senhas não coincidem."})
        return attrs

    def validate_email(self, value):
        email = str(value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Este e-mail já está registrado.")
        return email

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Este usuário já existe.")
        return value

    def validate_phone(self, value):
        return _ensure_unique_phone(value)

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
