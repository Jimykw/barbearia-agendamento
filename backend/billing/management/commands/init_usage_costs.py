"""
Comando para inicializar custos de uso padrão
"""
from django.core.management.base import BaseCommand
from billing.models import ServiceUsageCost, UsageTracking
from decimal import Decimal


class Command(BaseCommand):
    help = 'Inicializa custos de uso padrão'

    def handle(self, *args, **options):
        # Define custos padrão para cada ação
        costs = [
            {
                'action': UsageTracking.ACTION_LOGIN,
                'cost_per_action': Decimal('0.00'),  # Login é grátis
                'description': 'Acesso ao sistema'
            },
            {
                'action': UsageTracking.ACTION_APPOINTMENT_CREATE,
                'cost_per_action': Decimal('0.50'),  # R$ 0,50 por agendamento
                'description': 'Criação de novo agendamento'
            },
            {
                'action': UsageTracking.ACTION_APPOINTMENT_VIEW,
                'cost_per_action': Decimal('0.10'),  # R$ 0,10 por visualização
                'description': 'Visualização de agendamento'
            },
            {
                'action': UsageTracking.ACTION_DASHBOARD_ACCESS,
                'cost_per_action': Decimal('0.05'),  # R$ 0,05 por acesso
                'description': 'Acesso ao dashboard'
            },
            {
                'action': UsageTracking.ACTION_PROFILE_UPDATE,
                'cost_per_action': Decimal('0.25'),  # R$ 0,25 por atualização
                'description': 'Atualização de perfil'
            },
            {
                'action': UsageTracking.ACTION_EXPORT_DATA,
                'cost_per_action': Decimal('1.00'),  # R$ 1,00 por export
                'description': 'Exportação de dados'
            },
        ]

        created_count = 0
        updated_count = 0

        for cost_data in costs:
            obj, created = ServiceUsageCost.objects.update_or_create(
                action=cost_data['action'],
                defaults={
                    'cost_per_action': cost_data['cost_per_action'],
                    'description': cost_data['description'],
                    'is_active': True,
                }
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✓ Criado custo: {obj.get_action_display()} - R$ {obj.cost_per_action}"
                    )
                )
            else:
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"↻ Atualizado custo: {obj.get_action_display()} - R$ {obj.cost_per_action}"
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"\n✓ Inicialização concluída!\n"
                f"  Criados: {created_count}\n"
                f"  Atualizados: {updated_count}"
            )
        )
