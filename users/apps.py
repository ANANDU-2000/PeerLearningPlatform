"""
AppConfig for the users app.
"""

from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class UsersConfig(AppConfig):
    """Configuration for the users app."""
    name = 'users'
    verbose_name = _('Users')

    def ready(self):
        """Import signal handlers on app ready."""
        import users.signals
