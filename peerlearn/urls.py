"""
Main URL Configuration for peerlearn project.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView
from django.utils.translation import gettext_lazy as _

from users.views import landing_page, role_selection_view

urlpatterns = [
    path('django-admin/', admin.site.urls),
    path('', landing_page, name='landing_page'),
    path('role-selection/', role_selection_view, name='role_selection'),
    path('', include('users.urls')),
    path('sessions/', include('learning_sessions.urls')),
    path('payments/', include('payments.urls')),
    path('admin-panel/', include('admin_panel.urls')),
    path('i18n/', include('django.conf.urls.i18n')),
]

# Custom error handlers
handler404 = 'users.views.handler404'
handler500 = 'users.views.handler500'

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
