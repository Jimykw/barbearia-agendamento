from django.db import models


class Contact(models.Model):
    TYPE_PHONE = "phone"
    TYPE_EMAIL = "email"
    TYPE_INSTAGRAM = "instagram"
    TYPE_WHATSAPP = "whatsapp"

    TYPE_CHOICES = [
        (TYPE_PHONE, "Telefone"),
        (TYPE_EMAIL, "E-mail"),
        (TYPE_INSTAGRAM, "Instagram"),
        (TYPE_WHATSAPP, "WhatsApp"),
    ]

    contact_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    value = models.CharField(max_length=255)
    label = models.CharField(max_length=100, blank=True, help_text="Ex: Agendamentos, Suporte")
    is_public = models.BooleanField(default=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Contato"
        verbose_name_plural = "Contatos"

    def __str__(self):
        return f"{self.get_contact_type_display()}: {self.value}"


class ContactMessage(models.Model):
    STATUS_UNREAD = "unread"
    STATUS_READ = "read"
    STATUS_ANSWERED = "answered"

    STATUS_CHOICES = [
        (STATUS_UNREAD, "Não lido"),
        (STATUS_READ, "Lido"),
        (STATUS_ANSWERED, "Respondido"),
    ]

    name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    subject = models.CharField(max_length=255)
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_UNREAD)
    response = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Mensagem de Contato"
        verbose_name_plural = "Mensagens de Contato"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} - {self.subject}"
