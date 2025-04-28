"""
Template tags for text manipulation.
"""
from django import template
from django.utils.safestring import mark_safe

register = template.Library()


@register.filter
def split_lines(text):
    """
    Splits text by newlines and returns a list of non-empty lines.
    
    Usage:
    {% for line in text|split_lines %}
        {{ line }}
    {% endfor %}
    """
    if not text:
        return []
    
    return [line for line in text.split('\n') if line.strip()]


@register.filter
def trim(text):
    """
    Trims whitespace from the beginning and end of a string.
    """
    if not text:
        return ""
    
    return text.strip()