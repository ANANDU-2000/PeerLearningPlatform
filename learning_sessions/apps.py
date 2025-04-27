"""
AppConfig for the learning_sessions app.
"""

from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class LearningSessionsConfig(AppConfig):
    """Configuration for the learning_sessions app."""
    name = 'learning_sessions'
    verbose_name = _('Learning Sessions')

    def ready(self):
        """Import signal handlers on app ready."""
        import learning_sessions.signals
