"""
AppConfig for the payments app.
"""

from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class PaymentsConfig(AppConfig):
    """Configuration for the payments app."""
    name = 'payments'
    verbose_name = _('Payments')

    def ready(self):
        """Import signal handlers on app ready."""
        import payments.signals
