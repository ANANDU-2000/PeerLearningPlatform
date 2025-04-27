"""
Models for the users app.
"""

from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.utils.translation import gettext_lazy as _
from django.urls import reverse


class UserManager(BaseUserManager):
    """Custom manager for User model with email as the unique identifier."""
    
    def create_user(self, email, password=None, **extra_fields):
        """Create and save a user with the given email and password."""
        if not email:
            raise ValueError(_('The Email field must be set'))
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self, email, password=None, **extra_fields):
        """Create and save a superuser with the given email and password."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError(_('Superuser must have is_staff=True.'))
        if extra_fields.get('is_superuser') is not True:
            raise ValueError(_('Superuser must have is_superuser=True.'))
        
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Custom User model with email as the username field."""
    
    ROLE_CHOICES = (
        ('learner', _('Learner')),
        ('mentor', _('Mentor')),
        ('admin', _('Admin')),
    )
    
    username = None
    email = models.EmailField(_('email address'), unique=True)
    profile_picture = models.ImageField(_('profile picture'), upload_to='profile_pictures/', blank=True, null=True)
    role = models.CharField(_('role'), max_length=10, choices=ROLE_CHOICES, default='learner')
    two_factor_enabled = models.BooleanField(_('two-factor authentication'), default=False)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []
    
    objects = UserManager()
    
    def __str__(self):
        return self.email
    
    def get_full_name(self):
        """Return the user's full name."""
        return f"{self.first_name} {self.last_name}".strip() or self.email
    
    full_name = property(get_full_name)
    
    def get_dashboard_url(self):
        """Return the URL for the user's dashboard based on their role."""
        if self.role == 'learner':
            return reverse('learner_dashboard')
        elif self.role == 'mentor':
            return reverse('mentor_dashboard')
        elif self.role == 'admin':
            return reverse('admin_dashboard')
        return reverse('landing_page')


class LearnerProfile(models.Model):
    """Profile model for users with the Learner role."""
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='learner_profile')
    career_goals = models.CharField(_('career goals'), max_length=255)
    bio = models.TextField(_('biography'), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Learner: {self.user.email}"


class MentorProfile(models.Model):
    """Profile model for users with the Mentor role."""
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='mentor_profile')
    expertise = models.CharField(_('area of expertise'), max_length=255)
    bio = models.TextField(_('biography'))
    hourly_rate = models.DecimalField(_('hourly rate'), max_digits=10, decimal_places=2)
    is_approved = models.BooleanField(_('approved status'), default=False)
    intro_video = models.URLField(_('introduction video'), blank=True, null=True)
    average_rating = models.DecimalField(_('average rating'), max_digits=3, decimal_places=2, default=0)
    total_reviews = models.PositiveIntegerField(_('total reviews'), default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Mentor: {self.user.email}"
    
    def get_absolute_url(self):
        """Return the URL for the mentor's profile."""
        return reverse('mentor_profile', args=[self.id])
