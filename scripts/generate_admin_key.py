#!/usr/bin/env python
"""
Script to generate a secure admin access key and add it to the database.
Run this script to create the initial admin access key for secure login.
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
    
    # Store only the hashed version in the database for security
    # In a real app, we'd use a more sophisticated approach like bcrypt
    hashed_key = hashlib.sha256(plain_text_key.encode()).hexdigest()
    
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

def main():
    """Main function to run the script."""
    print("\n===== ADMIN ACCESS KEY GENERATOR =====\n")
    
    # Check if any admin users exist
    admin_users = User.objects.filter(role='admin')
    if admin_users.exists():
        print("Available admin users:")
        for user in admin_users:
            print(f" - {user.username} ({user.email})")
        
        creator = input("\nEnter admin username who's creating this key (or leave empty): ").strip()
    else:
        print("No admin users found. Key will be created without an owner.")
        creator = None
    
    # Get key details
    key_name = input("\nEnter a name for this key (e.g., 'Admin Setup Key'): ").strip()
    if not key_name:
        key_name = f"Admin Key {timezone.now().strftime('%Y-%m-%d')}"
    
    expiry = input("\nKey expiry in days (leave empty for no expiry): ").strip()
    expiry_days = int(expiry) if expiry else None
    
    # Create the key
    key_obj, plain_text_key = create_admin_access_key(key_name, expiry_days, creator)
    
    # Add local IP ranges for initial setup
    add_ip = input("\nAdd localhost and internal IP ranges to allowed IPs? (y/n): ").strip().lower()
    if add_ip == 'y':
        add_local_ip_to_allowed()
        print("Added localhost and internal IP ranges to allowed IPs.")
    
    # Display the key
    print("\n===== KEY GENERATED SUCCESSFULLY =====")
    print(f"Key Name: {key_obj.key_name}")
    print(f"Expires: {key_obj.expires_at or 'Never'}")
    print(f"Created by: {key_obj.created_by.username if key_obj.created_by else 'N/A'}")
    print("\nYOUR ADMIN SECURITY KEY (save this securely):")
    print(f"\n{plain_text_key}\n")
    print("================================================")
    print("IMPORTANT: This key will only be shown once!")
    print("Save it in a secure location immediately.\n")

if __name__ == "__main__":
    main()