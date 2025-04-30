from django import template
import re

register = template.Library()

@register.filter
def split_lines(value):
    """
    Split text into lines, filtering out empty lines.
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
    """
    if not value:
        return ''
    return value.strip()