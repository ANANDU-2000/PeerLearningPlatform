#!/usr/bin/env python
"""
Non-interactive script to generate a secure admin access key and add it to the database.
This version doesn't require user input and can be run in an automated environment.
"""

import os
import sys
import secrets
import hashlib
import datetime

# Add the project root directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set up Django environment
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')
django.setup()

# Import necessary models
from django.utils import timezone
from django.contrib.auth import get_user_model
from admin_panel.models import AdminAccessKey, AllowedIP

User = get_user_model()

def generate_secure_key(length=32):
    """Generate a cryptographically secure random key."""
    return secrets.token_urlsafe(length)

def create_admin_access_key(key_name, expiry_days=None, admin_username=None):
    """
    Create a new admin access key in the database.
    
    Args:
        key_name: A name/description for this key
        expiry_days: Number of days until this key expires (None for no expiry)
        admin_username: Username of admin who created this key (optional)
    
    Returns:
        tuple: (key_obj, plain_text_key) - the key object and the plain text key
    """
    # Generate a secure random key
    plain_text_key = generate_secure_key(32)
    
    # Set expiry date if provided
    expires_at = None
    if expiry_days:
        expires_at = timezone.now() + datetime.timedelta(days=expiry_days)
    
    # Get the admin user if provided
    admin_user = None
    if admin_username:
        try:
            admin_user = User.objects.get(username=admin_username, role='admin')
        except User.DoesNotExist:
            print(f"Warning: Admin user '{admin_username}' not found. Key will be created without owner.")
    
    # Create the key record
    key_obj = AdminAccessKey.objects.create(
        key_name=key_name,
        key_value=plain_text_key,  # Storing plain text for simplicity - in production use proper hashing
        expires_at=expires_at,
        created_by=admin_user
    )
    
    return key_obj, plain_text_key

def add_local_ip_to_allowed():
    """Add localhost to allowed IPs for initial setup."""
    # This is just for initial setup - in production you'd want to add your real IPs
    for ip in ['127.0.0.1', '172.31.0.0/16', '192.168.0.0/16']:
        AllowedIP.objects.get_or_create(
            ip_address=ip,
            defaults={
                'description': 'Automatically added during setup',
                'is_active': True
            }
        )

if __name__ == "__main__":
    print("\n===== ADMIN ACCESS KEY GENERATOR (AUTOMATIC) =====\n")
    
    # Use default values
    key_name = f"Initial Admin Key {timezone.now().strftime('%Y-%m-%d')}"
    expiry_days = 90  # 90 days
    
    # Create the key
    key_obj, plain_text_key = create_admin_access_key(key_name, expiry_days)
    
    # Add local IP ranges for initial setup
    add_local_ip_to_allowed()
    print("Added localhost and internal IP ranges to allowed IPs.")
    
    # Display the key
    print("\n===== KEY GENERATED SUCCESSFULLY =====")
    print(f"Key Name: {key_obj.key_name}")
    print(f"Expires: {key_obj.expires_at or 'Never'}")
    print("\nYOUR ADMIN SECURITY KEY (save this securely):")
    print(f"\n{plain_text_key}\n")
    print("================================================")
    print("IMPORTANT: Store this key securely for admin panel access!")
    print("You'll need it to log in to the secure admin panel.\n")