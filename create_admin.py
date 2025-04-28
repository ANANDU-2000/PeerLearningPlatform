#!/usr/bin/env python
"""
Create Admin User and Security Key for PeerLearn
"""
import os
import sys
import random
import string
import hashlib
import datetime

# Set up Django environment
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')
django.setup()

from django.utils import timezone
from django.contrib.auth import get_user_model
from admin_panel.models import AdminAccessKey

User = get_user_model()

# Generate random security key
def generate_key(length=16):
    """Generate a random security key."""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

# Create admin user
def create_admin(email, password, first_name, last_name):
    """Create an admin user."""
    # Check if user exists
    if User.objects.filter(email=email).exists():
        user = User.objects.get(email=email)
        print(f"Admin user {email} already exists.")
    else:
        user = User.objects.create_user(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            is_staff=True,
            is_superuser=True,
            role='admin'  # Make sure your User model has this field
        )
        print(f"Created admin user: {email}")
    
    return user

# Create security key
def create_security_key(user):
    """Create a security key for the admin user."""
    # Generate a random key
    key_value = generate_key(32)
    
    # Hash the key for storage
    hashed_key = hashlib.sha256(key_value.encode()).hexdigest()
    
    # Create the key record
    key = AdminAccessKey.objects.create(
        key_name=f"Auto-generated key for {user.email}",
        key_value=hashed_key,
        is_active=True,
        created_by=user,
        expires_at=timezone.now() + datetime.timedelta(days=90)  # Expires in 90 days
    )
    
    print(f"Created security key: {key_value}")
    return key_value

# Main function
def main():
    """Create admin user and security key."""
    print("\n===== ADMIN ACCOUNT AND SECURITY KEY GENERATOR =====\n")
    
    # Admin details
    email = "admin@peerlearn.com"
    password = "Admin@123"  # Strong default password
    first_name = "Admin"
    last_name = "User"
    
    # Create admin user
    admin = create_admin(email, password, first_name, last_name)
    
    # Create security key
    security_key = create_security_key(admin)
    
    # Print summary
    print("\n===== ADMIN ACCOUNT CREATED =====")
    print(f"Email: {email}")
    print(f"Password: {password}")
    print(f"Security Key: {security_key}")
    print("\nPlease save these credentials securely.")
    print("You will need all three to log in to the admin panel.")

if __name__ == "__main__":
    main()