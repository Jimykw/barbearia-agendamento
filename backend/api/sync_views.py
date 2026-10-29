"""
API Views para Sincronização de Agendamentos em Tempo Real
"""
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q
from datetime import datetime, timedelta
from django.contrib.auth import get_user_model

from api.models import Appointment
from api.serializers import AppointmentSerializer
from billing.models import UsageTracking
from billing.utils import track_user_action

User = get_user_model()


class AppointmentSyncViewSet(viewsets.ModelViewSet):
    """ViewSet para sincronização de agendamentos em tempo real"""
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """
        Filtra agendamentos baseado no role do usuário:
        - Cliente: vê apenas seus agendamentos
        - Barbeiro: vê agendamentos do dia dele
        - Admin: vê todos os agendamentos
        """
        user = self.request.user
        role = getattr(user, "role", None)
        
        if role == "admin":
            return Appointment.objects.all().select_related("customer", "package_subscription__package").order_by(
                "-created_at"
            )
        
        if role == "barbeiro":
            try:
                from barbers.models import Barber
                barber = Barber.objects.select_related("user").get(user=user)
                calendar_key = (barber.calendar_key or "").strip()
                
                if not calendar_key:
                    return Appointment.objects.none()
                
                # Retorna agendamentos de hoje em diante
                today = timezone.localdate()
                return Appointment.objects.filter(
                    barber=calendar_key,
                    date__gte=today
                ).select_related("customer", "package_subscription__package").order_by("date", "time")
            except Exception:
                return Appointment.objects.none()
        
        # Cliente: vê apenas seus agendamentos
        return Appointment.objects.filter(customer=user).select_related(
            "customer",
            "package_subscription__package",
        ).order_by("-date")
    
    @action(detail=False, methods=["get"])
    def today(self, request):
        """Retorna agendamentos de hoje"""
        today = timezone.localdate()
        queryset = self.get_queryset().filter(date=today)
        serializer = self.get_serializer(queryset, many=True)
        
        # Rastreia visualização de agendamentos
        track_user_action(
            request.user,
            UsageTracking.ACTION_APPOINTMENT_VIEW,
            metadata={"filter": "today", "count": queryset.count()}
        )
        
        return Response(serializer.data)
    
    @action(detail=False, methods=["get"])
    def upcoming(self, request):
        """Retorna agendamentos dos próximos 7 dias"""
        today = timezone.localdate()
        next_week = today + timedelta(days=7)
        queryset = self.get_queryset().filter(
            date__range=[today, next_week]
        ).order_by("date", "time")
        serializer = self.get_serializer(queryset, many=True)
        
        track_user_action(
            request.user,
            UsageTracking.ACTION_APPOINTMENT_VIEW,
            metadata={"filter": "upcoming", "count": queryset.count()}
        )
        
        return Response(serializer.data)
    
    @action(detail=False, methods=["get"])
    def by_status(self, request):
        """Filtra agendamentos por status"""
        status_filter = request.query_params.get("status")
        
        if not status_filter:
            return Response(
                {"detail": "Parâmetro 'status' é obrigatório"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = self.get_queryset().filter(status=status_filter)
        serializer = self.get_serializer(queryset, many=True)
        
        track_user_action(
            request.user,
            UsageTracking.ACTION_APPOINTMENT_VIEW,
            metadata={"filter": f"status_{status_filter}", "count": queryset.count()}
        )
        
        return Response(serializer.data)
    
    @action(detail=False, methods=["get"])
    def by_barber(self, request):
        """Filtra agendamentos por barbeiro (admin/barbeiro only)"""
        user = request.user
        role = getattr(user, "role", None)
        
        if role not in ["admin", "barbeiro"]:
            return Response(
                {"detail": "Permissão negada"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        barber_key = request.query_params.get("barber")
        
        if not barber_key:
            return Response(
                {"detail": "Parâmetro 'barber' é obrigatório"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        today = timezone.localdate()
        queryset = Appointment.objects.filter(
            barber=barber_key,
            date__gte=today
        ).select_related("customer").order_by("date", "time")
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Retorna estatísticas de agendamentos"""
        user = request.user
        role = getattr(user, "role", None)
        
        today = timezone.localdate()
        queryset = self.get_queryset()
        
        stats = {
            "total_appointments": queryset.count(),
            "pending": queryset.filter(status=Appointment.STATUS_PENDING).count(),
            "confirmed": queryset.filter(status=Appointment.STATUS_CONFIRMED).count(),
            "em_atendimento": queryset.filter(status=Appointment.STATUS_EM_ANDAMENTO).count(),
            "concluidos": queryset.filter(status=Appointment.STATUS_CONCLUIDO).count(),
            "cancelados": queryset.filter(status=Appointment.STATUS_CANCELED).count(),
            "today": queryset.filter(date=today).count(),
        }
        
        track_user_action(
            request.user,
            UsageTracking.ACTION_DASHBOARD_ACCESS,
            metadata={"type": "appointments_stats"}
        )
        
        return Response(stats)


class AppointmentDetailSyncView(generics.RetrieveUpdateDestroyAPIView):
    """Detail view com rastreamento de ações"""
    queryset = Appointment.objects.all()
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def retrieve(self, request, *args, **kwargs):
        """Rastreia quando um agendamento é visualizado"""
        response = super().retrieve(request, *args, **kwargs)
        
        appointment = self.get_object()
        track_user_action(
            request.user,
            UsageTracking.ACTION_APPOINTMENT_VIEW,
            metadata={"appointment_id": appointment.id}
        )
        
        return response
    
    def update(self, request, *args, **kwargs):
        """Rastreia quando um agendamento é atualizado"""
        response = super().update(request, *args, **kwargs)
        
        appointment = self.get_object()
        action_type = "status_update"
        
        # Rastreia qual ação foi realizada
        new_status = request.data.get("status", "unknown")
        if new_status == Appointment.STATUS_EM_ANDAMENTO:
            action_type = "appointment_started"
        elif new_status == Appointment.STATUS_CONCLUIDO:
            action_type = "appointment_completed"
        
        track_user_action(
            request.user,
            UsageTracking.ACTION_APPOINTMENT_VIEW,
            metadata={
                "appointment_id": appointment.id,
                "action": action_type,
                "new_status": new_status
            }
        )
        
        return response
