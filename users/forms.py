"""
Forms for the users app.
"""

from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.utils.translation import gettext_lazy as _

from .models import User, LearnerProfile, MentorProfile


class CustomAuthenticationForm(AuthenticationForm):
    """Custom authentication form with styling."""
    username = forms.EmailField(
        widget=forms.EmailInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Email Address')
        })
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Password')
        })
    )


class UserRegistrationForm(UserCreationForm):
    """Form for user registration."""
    email = forms.EmailField(
        widget=forms.EmailInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Email Address')
        })
    )
    first_name = forms.CharField(
        widget=forms.TextInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('First Name')
        })
    )
    last_name = forms.CharField(
        widget=forms.TextInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Last Name')
        })
    )
    password1 = forms.CharField(
        widget=forms.PasswordInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Password')
        })
    )
    password2 = forms.CharField(
        widget=forms.PasswordInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Confirm Password')
        })
    )
    
    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name', 'password1', 'password2')


class LearnerProfileForm(forms.ModelForm):
    """Form for learner profile."""
    career_goals = forms.CharField(
        widget=forms.TextInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Career Goals'),
            'data-autocomplete': 'career'
        })
    )
    bio = forms.CharField(
        widget=forms.Textarea(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Tell us about yourself'),
            'rows': 4
        }),
        required=False
    )
    
    class Meta:
        model = LearnerProfile
        fields = ('career_goals', 'bio')


class MentorProfileForm(forms.ModelForm):
    """Form for mentor profile."""
    expertise = forms.CharField(
        widget=forms.TextInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Your Area of Expertise'),
            'data-autocomplete': 'expertise'
        })
    )
    bio = forms.CharField(
        widget=forms.Textarea(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Professional Bio'),
            'rows': 4
        })
    )
    hourly_rate = forms.DecimalField(
        widget=forms.NumberInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Hourly Rate (INR)'),
            'min': 0
        })
    )
    
    class Meta:
        model = MentorProfile
        fields = ('expertise', 'bio', 'hourly_rate')


class UserProfilePictureForm(forms.ModelForm):
    """Form for user profile picture."""
    profile_picture = forms.ImageField(
        widget=forms.FileInput(attrs={
            'class': 'hidden',
            'accept': 'image/*'
        }),
        required=False
    )
    
    class Meta:
        model = User
        fields = ('profile_picture',)


class Two2FACodeForm(forms.Form):
    """Form for 2FA code verification."""
    code = forms.CharField(
        widget=forms.TextInput(attrs={
            'class': 'w-full px-4 py-2 text-center tracking-widest rounded-lg bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-gray-300',
            'placeholder': _('Enter 6-digit code'),
            'maxlength': 6,
            'autocomplete': 'one-time-code'
        }),
        max_length=6,
        min_length=6
    )


class UserSettingsForm(forms.ModelForm):
    """Form for user settings."""
    class Meta:
        model = User
        fields = ('first_name', 'last_name', 'email')
        widgets = {
            'first_name': forms.TextInput(attrs={'class': 'w-full px-4 py-2 rounded-lg border border-gray-300'}),
            'last_name': forms.TextInput(attrs={'class': 'w-full px-4 py-2 rounded-lg border border-gray-300'}),
            'email': forms.EmailInput(attrs={'class': 'w-full px-4 py-2 rounded-lg border border-gray-300'}),
        }
