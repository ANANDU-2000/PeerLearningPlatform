#!/usr/bin/env python
"""
Script to check the current admin access keys and allowed IPs in the database.
"""

import os
import sys
from datetime import timedelta

# Add the project root directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set up Django environment
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'peerlearn.settings')
django.setup()

# Import necessary models
from django.utils import timezone
from admin_panel.models import AdminAccessKey, AllowedIP, AdminAccessLog

def check_admin_access_keys():
    """Check all admin access keys in the database."""
    print("\n===== ADMIN ACCESS KEYS =====")
    print("{:<5} {:<30} {:<20} {:<30} {:<10}".format(
        "ID", "Key Name", "Created At", "Expires At", "Active"
    ))
    print("-" * 95)
    
    keys = AdminAccessKey.objects.all().order_by('-created_at')
    for key in keys:
        print("{:<5} {:<30} {:<20} {:<30} {:<10}".format(
            key.id,
            key.key_name,
            key.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            key.expires_at.strftime('%Y-%m-%d %H:%M:%S') if key.expires_at else "Never",
            "Yes" if key.is_active else "No"
        ))
    
    if not keys:
        print("No admin access keys found.")
    
    print()

def check_allowed_ips():
    """Check all allowed IPs in the database."""
    print("\n===== ALLOWED IPs =====")
    print("{:<5} {:<20} {:<50} {:<10}".format(
        "ID", "IP Address", "Description", "Active"
    ))
    print("-" * 85)
    
    ips = AllowedIP.objects.all().order_by('-created_at')
    for ip in ips:
        print("{:<5} {:<20} {:<50} {:<10}".format(
            ip.id,
            ip.ip_address,
            ip.description[:50],
            "Yes" if ip.is_active else "No"
        ))
    
    if not ips:
        print("No allowed IPs found.")
    
    print()

def check_access_logs():
    """Check recent access logs in the database."""
    print("\n===== RECENT ACCESS LOGS (LAST 10) =====")
    print("{:<5} {:<20} {:<15} {:<15} {:<20} {:<10}".format(
        "ID", "Timestamp", "IP Address", "Action", "Path", "Status"
    ))
    print("-" * 85)
    
    logs = AdminAccessLog.objects.all().order_by('-timestamp')[:10]
    for log in logs:
        print("{:<5} {:<20} {:<15} {:<15} {:<20} {:<10}".format(
            log.id,
            log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            log.ip_address,
            log.action[:15],
            log.path[:20],
            log.status
        ))
    
    if not logs:
        print("No access logs found.")
    
    print()

if __name__ == "__main__":
    check_admin_access_keys()
    check_allowed_ips()
    check_access_logs()
    print("Security configuration check complete.\n")