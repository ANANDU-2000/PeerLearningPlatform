"""
Custom template filters for learning_sessions app.
"""
from django import template

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