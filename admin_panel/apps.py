"""
AppConfig for the admin_panel app.
"""

from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class AdminPanelConfig(AppConfig):
    """Configuration for the admin_panel app."""
    name = 'admin_panel'
    verbose_name = _('Admin Panel')
