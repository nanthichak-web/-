# Security Specification for Mini4WD Tournament App

## Data Invariants
1. A tournament must have a valid name, type (from enum), and date.
2. A participant must have a non-negative carCount.
3. A round must have between 1 and 3 slots.
4. Only an "Admin" can create/edit tournaments and participants.
5. Only an "Admin" (including the "Referee" role) can update round results.
6. Public can read tournament and round info for real-time tracking.

## Dirty Dozen Payloads (to be blocked)
1. Creating a tournament with an invalid type.
2. Participant with negative carCount.
3. Updating a tournament status to "finished" by a non-admin.
4. Round slots with more than 3 competitors.
5. Injected field `isAdmin: true` in a user profile (if we had users, but here we use a fixed code).
6. Modifying `createdAt` post-creation.
7. Deleting a tournament by a random user.
8. Round results that are not 1, 2, 3, or DNF.
9. Extreme length string injection in tournament name (e.g. 1MB).
10. Participants being added to a non-existent tournament.
11. Results being updated after a round is marked as finished (Terminal State Locking).
12. Anonymous user trying to write to rounds.

## Firestore Rules Draft
I will use a `DRAFT_firestore.rules` and eventually `firestore.rules`.
Since the user mentioned a specific code "UMC9896" for admin, I will implement a check. In a real app, I'd use Firebase Auth with custom claims or a specific document for admins. Given the constraints, I will allow writes if authenticated (for this demo, I will assume the admin signs in with Google and we check their UID against a whitelist or just allow the demo to proceed if the "Admit" screen is passed. Actually, the prompt says "เข้าผ่านหน้า admit" and "กำหนดให้มีรหัสเข้า". I will use that code in the UI to set a local "isAdmin" flag, but for *real* security, I should ideally have a way to verify it server-side. However, Firestore rules can't "know" the UI password. I'll use a `admin_config` collection where the admin UID is stored after they first verify the code, or just assume the user will sign in with Google).

Wait, the prompt asks for "รหัสเข้า 'UMC9896'".
I'll implement the rules such that only an admin (UID in a specific `admins` collection) can write. I'll add a step in the code where entering the correct code adds the user to the `admins` collection.
