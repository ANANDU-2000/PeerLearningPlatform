# PeerLearn Flow Planning Document

## Overview
This document outlines the user flow in the PeerLearn platform, focusing on the mentor-learner interaction, session booking, payment, and live session experience.

## 1. Mentor Flow

### 1.1 Account Creation & Approval
1. Mentor registers on the platform
2. Completes profile with expertise details
3. **Approval stage** - Admin approval required
4. Mentor receives notification when approved

### 1.2 Session Management
1. Create new session
   - Set title, description, date/time
   - Set pricing and max participants
   - Define topics to be covered
   - Add session thumbnail (optional)
2. Edit existing sessions
3. Cancel sessions (with notification to booked learners)
4. View bookings for each session

### 1.3 Before Session
1. Reminders sent at 24h, 1h, 15min before session
2. Review session details and learner information
3. Test equipment and connection
4. Join session room up to 30min before start time

### 1.4 During Session
1. Start session (automatically or manually)
2. Share screen/resources with learners
3. Use whiteboard for explanations
4. Chat with learners through text
5. Record session (optional)
6. End session (end time or manually)

### 1.5 After Session
1. Rate learner participation (optional)
2. View feedback from learners
3. Upload additional resources (optional)
4. Track earnings
5. Request withdrawal of earnings

## 2. Learner Flow

### 2.1 Account Creation
1. Learner registers on the platform
2. Completes profile with learning interests
3. Verifies email (optional but recommended)

### 2.2 Session Discovery
1. Browse available sessions
   - Search by topic, mentor, or date
   - Filter by price, time, rating, etc.
2. View session details
   - Session description and topics
   - Mentor profile and ratings
   - Date, time, and duration
   - Price

### 2.3 Session Booking
1. Select session to book
2. Add session to cart
3. Apply coupon (if available)
4. Complete payment
   - Free sessions - direct confirmation
   - Paid sessions - Razorpay checkout
5. Receive booking confirmation

### 2.4 Before Session
1. Reminders sent at 24h, 1h, 15min before session
2. Review session details
3. Test equipment and connection
4. Join session room up to 5min before start time

### 2.5 During Session
1. Participate in live video session
2. Chat with mentor
3. View shared content
4. Take notes (in-app feature)
5. Ask questions

### 2.6 After Session
1. Provide feedback and rating
2. Access recording (if available)
3. Book follow-up sessions (recommended)

## 3. Admin Flow

### 3.1 Mentor Approval
1. Review mentor applications
2. Verify mentor credentials
3. Approve or reject mentors
4. Send notification of decision

### 3.2 Content Moderation
1. Monitor session topics and descriptions
2. Review reported content
3. Take action on policy violations

### 3.3 Payment Management
1. Review transaction history
2. Process withdrawal requests
3. Handle refund requests
4. Manage coupon codes

### 3.4 Analytics and Reporting
1. Track platform usage metrics
2. Monitor revenue and financial performance
3. Analyze user engagement
4. Generate reports

## 4. Notification System

### 4.1 Notification Types
1. Email notifications
2. In-app notifications
3. Browser notifications (web only)
4. SMS notifications (optional)

### 4.2 Notification Events
1. Account actions (registration, approval, etc.)
2. Session bookings and confirmations
3. Session reminders
4. Payment confirmations
5. Session status changes
6. New feedback received
7. Withdrawal status updates

## 5. Request/Accept Workflow

### 5.1 Learner Initiated Requests
1. Learner can request a custom session with a mentor
2. Specify preferred topics, date/time, and budget
3. Mentor receives notification
4. Mentor can accept, decline, or propose alternative
5. If accepted, session is created and follows booking flow

### 5.2 Mentor Initiated Invitations
1. Mentor can invite specific learners to a session
2. Learner receives notification
3. Learner can accept or decline
4. If accepted, follows booking flow (possibly with discount)

## 6. Payment Flow

### 6.1 Checkout Process
1. Add session to cart
2. Apply coupon (if available)
3. View order summary
4. For free sessions: Direct confirmation
5. For paid sessions:
   - Initiate Razorpay checkout
   - Complete payment
   - Receive confirmation

### 6.2 Payment Status Handling
1. Success: Confirm booking, send confirmation
2. Failure: Return to cart, show error message
3. Pending: Show pending status, confirm when complete
4. Abandoned: Send reminder email after 24h

### 6.3 Refund Process
1. Learner requests refund (up to 24h before session)
2. Admin reviews request
3. If approved, process refund
4. Send notification to learner and mentor

## Implementation Notes

### Development Mode Simplifications
1. All sessions processed as free in development
2. Bypass payment gateway for testing
3. Automatic booking confirmation
4. Lenient access controls for session rooms

### Production Mode Requirements
1. Strict access control for session rooms
2. Full payment processing with Razorpay
3. Email verification for account security
4. Multiple notification channels