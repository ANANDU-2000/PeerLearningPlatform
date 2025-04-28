"""
Forms for the sessions app.
"""

from django import forms
from django.utils.translation import gettext_lazy as _
from django.utils import timezone

from .models import Session, Booking, Feedback


class SessionForm(forms.ModelForm):
    """Form for creating and editing sessions."""
    
    # Add thumbnail field
    thumbnail = forms.ImageField(
        required=False,
        widget=forms.FileInput(attrs={
            'class': 'hidden',
            'accept': 'image/*'
        }),
        help_text=_("Upload a thumbnail image to make your session stand out")
    )
    
    # Add option for free session
    is_free = forms.BooleanField(
        required=False,
        initial=False,
        widget=forms.CheckboxInput(attrs={
            'class': 'h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500'
        }),
        label=_("Offer this session for free"),
        help_text=_("Free sessions can attract more learners and build your reputation")
    )
    
    # SEO keywords/metadata
    seo_keywords = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
            'placeholder': _('E.g., Python, Data Science, Beginner Friendly')
        }),
        label=_("SEO Keywords"),
        help_text=_("Keywords to help learners find your session (comma separated)")
    )
    
    class Meta:
        model = Session
        fields = ['title', 'description', 'topics_to_cover', 'start_time', 'end_time', 'price', 'max_participants', 'tags', 'thumbnail']
        widgets = {
            'title': forms.TextInput(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('E.g., "Mastering Python for Data Science Beginners"')
            }),
            'description': forms.Textarea(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('Describe what learners will gain from this session. Include skills they will acquire, any prerequisites, and your teaching approach.'),
                'rows': 4
            }),
            'topics_to_cover': forms.Textarea(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('List the specific topics you will cover in this session (e.g., "1. Introduction to Python\n2. Data Types and Variables\n3. Control Flow Statements")'),
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
                'class': 'w-full pl-8 pr-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('Price (INR)'),
                'min': 0
            }),
            'max_participants': forms.NumberInput(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('Maximum Participants'),
                'min': 1,
                'value': 5
            }),
            'tags': forms.TextInput(attrs={
                'class': 'w-full px-4 py-2 rounded-lg border border-gray-300',
                'placeholder': _('E.g., python, data-science, beginners')
            }),
        }
    
    def clean(self):
        """Validate the form data."""
        cleaned_data = super().clean()
        start_time = cleaned_data.get('start_time')
        end_time = cleaned_data.get('end_time')
        is_free = cleaned_data.get('is_free')
        price = cleaned_data.get('price')
        
        # Set price to 0 if is_free is checked
        if is_free and price:
            cleaned_data['price'] = 0
        
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
