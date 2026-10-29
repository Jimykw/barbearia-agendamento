"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView

from core.spa_views import spa_index

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('api/', include('services.urls')),
    path('api/', include('barbers.urls')),
    path('api/', include('contacts.urls')),
    path('api/', include('billing.urls')),
    # URL antiga /login → Início (antes do catchall da SPA)
    path('login', RedirectView.as_view(url='/', permanent=False), name='legacy-login-redirect'),
    path('login/', RedirectView.as_view(url='/', permanent=False)),
    # SPA React (por último): rotas com pelo menos um segmento, depois a raiz /
    re_path(r'^.+$', spa_index, name='spa-catchall'),
    path('', spa_index, name='spa-index'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

