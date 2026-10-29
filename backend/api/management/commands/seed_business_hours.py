from datetime import time

from django.core.management.base import BaseCommand

from api.models import BusinessHours


class Command(BaseCommand):
    help = "Cria/atualiza horários padrão de funcionamento (seg-sáb 09:00-20:00, domingo fechado)."

    def handle(self, *args, **options):
        default_map = {
            0: (time(9, 0), time(20, 0), True),
            1: (time(9, 0), time(20, 0), True),
            2: (time(9, 0), time(20, 0), True),
            3: (time(9, 0), time(20, 0), True),
            4: (time(9, 0), time(20, 0), True),
            5: (time(9, 0), time(20, 0), True),
            6: (time(9, 0), time(20, 0), False),
        }

        for weekday, (open_time, close_time, is_open) in default_map.items():
            BusinessHours.objects.update_or_create(
                weekday=weekday,
                defaults={
                    "open_time": open_time,
                    "close_time": close_time,
                    "is_open": is_open,
                },
            )

        self.stdout.write(self.style.SUCCESS("Horários padrão aplicados com sucesso."))
