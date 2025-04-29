"""
Test views for the learning_sessions app.
These views are used for testing features like mobile compatibility.
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required


def mobile_compatibility_test(request):
    """
    View to test mobile compatibility of WebRTC features.
    This view does not require authentication to allow testing
    from various devices without login.
    """
    context = {
        'page_title': 'Mobile Compatibility Test',
    }
    return render(request, 'tests/mobile_compatibility.html', context)