"""
Forms for the sessions app.
"""

from django import forms
from django.utils.translation import gettext_lazy as _
from django.utils import timezone

from .models import Session, Booking, Feedback


class SessionForm(forms.ModelForm):
    """Form for creating and editing sessions."""
    
    class Meta:
        model = Session
        fields = ['title', 'description', 'start_time', 'end_time', 'price', 'max_participants', 'tags']
        widgets = {
            'title': forms.TextInput(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('Session Title')
            }),
            'description': forms.Textarea(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('Session Description'),
                'rows': 4
            }),
            'start_time': forms.DateTimeInput(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'type': 'datetime-local'
            }),
            'end_time': forms.DateTimeInput(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'type': 'datetime-local'
            }),
            'price': forms.NumberInput(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('Price (INR)'),
                'min': 0
            }),
            'max_participants': forms.NumberInput(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('Maximum Participants'),
                'min': 1
            }),
            'tags': forms.TextInput(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('Tags (comma separated)')
            }),
        }
    
    def clean(self):
        """Validate the form data."""
        cleaned_data = super().clean()
        start_time = cleaned_data.get('start_time')
        end_time = cleaned_data.get('end_time')
        
        # Check if start time is in the future
        if start_time and start_time < timezone.now():
            self.add_error('start_time', _('Start time must be in the future.'))
        
        # Check if end time is after start time
        if start_time and end_time and end_time <= start_time:
            self.add_error('end_time', _('End time must be after start time.'))
        
        return cleaned_data


class BookingForm(forms.ModelForm):
    """Form for creating bookings."""
    
    coupon_code = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
            'placeholder': _('Coupon Code')
        })
    )
    
    class Meta:
        model = Booking
        fields = []  # No fields from model needed, session and learner will be set in view


class FeedbackForm(forms.ModelForm):
    """Form for providing feedback after a session."""
    
    class Meta:
        model = Feedback
        fields = ['rating', 'comments']
        widgets = {
            'rating': forms.NumberInput(attrs={
                'class': 'hidden',
                'min': 1,
                'max': 5
            }),
            'comments': forms.Textarea(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('Your feedback on the session'),
                'rows': 4
            }),
        }
