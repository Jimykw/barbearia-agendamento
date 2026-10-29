"""
Signals para rastreamento automático de ações
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import Appointment
from billing.models import UsageTracking, AppointmentCost
from billing.utils import track_user_action
from decimal import Decimal

User = get_user_model()


@receiver(post_save, sender=User)
def track_user_creation(sender, instance, created, **kwargs):
    """Rastreia quando um novo usuário é criado"""
    if created:
        # Não rastreamos criação de usuário pois ele não está autenticado
        pass


@receiver(post_save, sender=Appointment)
def track_appointment_creation(sender, instance, created, **kwargs):
    """Rastreia quando um novo agendamento é criado e cria custo"""
    if created:
        # Rastreia a ação do cliente criando agendamento
        if instance.customer:
            track_user_action(
                instance.customer,
                UsageTracking.ACTION_APPOINTMENT_CREATE,
                metadata={"appointment_id": instance.id, "service": instance.service}
            )
        
        # Cria registro de custo do agendamento
        # Aqui você pode adicionar lógica para calcular o preço baseado no serviço
        service_price = Decimal("50.00")  # Preço padrão, você pode atualizar isso
        
        try:
            AppointmentCost.objects.create(
                appointment=instance,
                service_price=service_price,
                platform_fee=Decimal("5.00"),
                discount_applied=Decimal("0.00"),
                total_cost=service_price + Decimal("5.00")
            )
        except Exception as e:
            # Log da exceção se necessário
            pass
