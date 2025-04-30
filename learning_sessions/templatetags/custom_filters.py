"""
Custom template filters for learning_sessions app.
"""
from django import template
import re

register = template.Library()

@register.filter
def split(value, delimiter=','):
    """
    Split a string by delimiter and return a list.
    
    Usage in template:
    {% for day in 'Mon,Tue,Wed,Thu,Fri,Sat,Sun'|split:',' %}
        {{ day }}
    {% endfor %}
    """
    if value:
        return value.split(delimiter)
    return []

@register.filter
def index(lst, idx):
    """
    Return the item at the given index in a list.
    
    Usage in template:
    {{ my_list|index:0 }}
    """
    try:
        return lst[idx]
    except (IndexError, TypeError):
        return ''

@register.filter
def split_lines(value):
    """
    Split text into lines, filtering out empty lines.
    
    Usage in template:
    {% for line in text|split_lines %}
        {{ line }}
    {% endfor %}
    """
    if not value:
        return []
    
    # Convert string to list of non-empty lines
    lines = [line.strip() for line in value.split('\n') if line.strip()]
    return lines

@register.filter
def trim(value):
    """
    Remove leading and trailing whitespace.
    
    Usage in template:
    {{ text|trim }}
    """
    if not value:
        return ''
    return value.strip()