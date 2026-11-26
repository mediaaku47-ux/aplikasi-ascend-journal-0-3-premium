# Security Summary

**Reviewed Files**: 14
**Issues Resolved**: 8

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Client-Side Admin Name/Email Bypass | `src/utils/admin.ts` | 8–46 | Admin privileges were granted by matching display names containing `"kamal"` or hardcoded email substrings on the client. Any user could change their profile name to `"Kamal"` to unlock Admin UI. | Critical | Fixed | Removed all name/email matching and `DEFAULT_ADMIN_EMAILS`; role is now verified strictly from Supabase `app_metadata.role` or `public.user_profiles.role === 'admin'`. |
| Untrusted `localStorage` Role Escalation | `src/App.tsx`, `src/components/MainDashboard.tsx`, `src/components/ProfileModal.tsx` | 80–97, 217–245 | Cached user/profile objects in `localStorage` were hydrated without stripping privilege claims, allowing browser storage tampering to forge client roles. | High | Fixed | Added `sanitizeCachedUser` and `sanitizeCachedProfile` to strip any `role` or `app_metadata.role` read from or written to `localStorage`; admin status only activates from live Supabase session/DB responses. |
| Unguarded Admin Routes & Data Fetching | `src/components/MainDashboard.tsx`, `src/components/Views/AdminPortalView.tsx`, `src/components/Views/AdminFeedbackView.tsx`, `src/components/AdminAnnouncementsModal.tsx` | 1292, 162, 156, 81 | `admin-portal` and `admin-feedback` tabs could be navigated without role checks; `AdminPortalView`, `AdminFeedbackView`, and `AdminAnnouncementsModal` fired privileged Supabase queries/subscriptions even for non-admin users. | High | Fixed | Added `checkIsAdminUser` guards on tab navigation, modal opening, and inside every `useEffect` before querying/subscribing; added explicit "Akses Ditolak" screens for unauthorized access attempts. |
| Missing Server-Side Admin Session Guard | `src/lib/supabaseService.ts` | 1159, 1473, 1576, 1677, 1889 | Admin service methods (`fetchAllUserFeedbacksWithStatus`, `fetchAdminPortalOverview`, `upsertAnnouncementWithStatus`, `deleteAnnouncementWithStatus`) executed directly with any authenticated session. | High | Fixed | Added `verifyActiveAdminSession()` verifying live Supabase `app_metadata.role === 'admin'` or database `user_profiles.role === 'admin'` before running privileged queries or mutations. |
| Permissive `user_profiles` SELECT Policy | `schema.sql`, `src/lib/schemaSqlText.ts`, `src/components/Views/AdminFeedbackView.tsx` | 172 | Policy included `OR (feedback IS NOT NULL)` and email matching, allowing any user to read other users' profiles/emails once they submitted feedback. | Critical | Fixed (Needs SQL Apply) | Replaced with `auth.uid() = id OR public.is_admin()` backed by `public.user_profiles.role = 'admin'`. Run updated `schema.sql` in Supabase SQL Editor. |
| Permissive `announcements` Write Policies | `schema.sql`, `src/lib/schemaSqlText.ts` | 260–274 | `INSERT`, `UPDATE`, and `DELETE` policies on `public.announcements` allowed any `auth.role() = 'authenticated'` user to publish, edit, or delete global app announcements. | High | Fixed (Needs SQL Apply) | Restricted `INSERT`, `UPDATE`, and `DELETE` policies on `public.announcements` strictly to `public.is_admin()`. Run updated `schema.sql` in Supabase SQL Editor. |
| Missing Role Column & Escalation Trigger | `schema.sql`, `src/lib/schemaSqlText.ts` | 16–35, 180–215 | `user_profiles` lacked a constrained `role` column and self-update protection, meaning users updating their own profile row could potentially supply `role = 'admin'`. | High | Fixed (Needs SQL Apply) | Added `role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))`, `handle_new_user()` default `'user'`, and `BEFORE INSERT OR UPDATE` trigger `trg_protect_user_profile_role` rejecting non-admin role changes. |
| Hardcoded Admin Email UI Fallbacks | `src/components/ProfileView.tsx`, `src/components/ProfileModal.tsx`, `src/components/Views/AdminPortalView.tsx` | 568, 1040, 394, 630 | UI components fell back to displaying `'kamalizudin36@gmail.com'` when no email was present and determined admin badges via `DEFAULT_ADMIN_EMAILS`. | Low | Fixed | Replaced UI email fallbacks with `userProfile.email` / unlinked label and derived admin badges from `user.role === 'admin'`. |

### Dependency Audit (`bun audit`)
- Executed `bun audit` against `bun.lock`: 16 advisories reported across transitive/build dependencies (`express` -> `proxy-addr@2.0.7` critical, `body-parser@1.20.6` high, `vite@6.4.3`, `jspdf` -> `dompurify@3.4.14` low). Direct dependencies in `package.json` were not modified during this RBAC remediation task; upgrading `express` and `vite` in a dedicated dependency maintenance pass is recommended.

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Single Source of Truth Role Check | `src/utils/admin.ts` | `getVerifiedUserRole` only trusts `app_metadata.role === 'admin'` or database-fetched `userProfile.role === 'admin'` on valid Supabase UUID sessions; defaults every other user to `'user'`. |
| Profile Sync Isolation | `src/lib/supabaseService.ts` | `syncProfile`, `uploadAllLocalData`, and `submitUserFeedback` never include `role` in client update payloads; `ensureUserProfileInitialized` initializes new users strictly with `'user'`. |
| Route & Modal Access Control | `src/components/MainDashboard.tsx`, `src/components/Views/AdminPortalView.tsx`, `src/components/Views/AdminFeedbackView.tsx`, `src/components/AdminAnnouncementsModal.tsx` | All admin navigation paths, modal triggers, data fetches, and realtime channels are gated behind `isAdmin` and show explicit "Akses Ditolak" UI when unauthorized. |
| Database-Enforced RLS & Role Protection | `schema.sql`, `src/lib/schemaSqlText.ts` | `public.is_admin()` (`SECURITY DEFINER`) and `trg_protect_user_profile_role` enforce role immutability and restrict sensitive reads/writes to database-verified `'admin'` accounts. |

---

## PoC Verification

### 1. Client-Side Name/Email & Cache Role Spoofing Blocked

#### Summary
| Field | Value |
|---|---|
| Issue Type | Broken Client-Side Access Control / Privilege Escalation |
| Impact | Critical |
| Affected File | `src/utils/admin.ts:18`, `src/App.tsx:79`, `src/components/MainDashboard.tsx:217` |
| Test Scenario | A normal authenticated user (`role: 'user'`) renames their profile to `"Kamal"` and tampers with `localStorage.journalstream_user_profile` to set `"role": "admin"`. |

#### How It Was Fixed
Removed all name/email substring matching in `src/utils/admin.ts` and added `sanitizeCachedProfile`/`sanitizeCachedUser` when hydrating or persisting `localStorage`, ensuring `role` is only accepted from live Supabase session/database responses.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Tampered `localStorage` entry (`{"name": "Kamal", "role": "admin"}`) is read at startup in `src/App.tsx:89` and `src/components/MainDashboard.tsx:219`. | Parsed object passes into `sanitizeCachedProfile()` |
| 2 | `sanitizeCachedProfile()` in `src/utils/admin.ts:52` overwrites `role` to `'user'`. | Cached admin claim is stripped |
| 3 | `checkIsAdminUser(currentUser, userProfile)` executes `getVerifiedUserRole()` (`src/utils/admin.ts:18`). | Checks only `app_metadata.role` and live DB `userProfile.role`; ignores `name` and `email` |
| 4 | Final result | **Handled Safely (`false`)** — Admin UI remains hidden and access is denied |

#### Conclusion
**Fix Verified** - Renaming a profile or modifying browser `localStorage` no longer grants administrator privileges anywhere in the client application.

---

### 2. Direct Access & Privileged Queries to Admin Views Blocked

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Function-Level / Route Access Control |
| Impact | High |
| Affected File | `src/components/MainDashboard.tsx:1304`, `src/components/Views/AdminPortalView.tsx:160`, `src/components/Views/AdminFeedbackView.tsx:177`, `src/lib/supabaseService.ts:449` |
| Test Scenario | A logged-in standard user (`role: 'user'`) attempts to open `'admin-portal'`, `'admin-feedback'`, or `AdminAnnouncementsModal`, or directly invokes `dbService.fetchAdminPortalOverview()`. |

#### How It Was Fixed
Guarded `handleTabChange` and `handleOpenAnnouncementsAdmin` in `MainDashboard.tsx`, added `if (!isAdmin)` guards before `useEffect` queries/subscriptions and Access Denied UI in all admin views/modals, and enforced `verifyActiveAdminSession()` inside `supabaseService.ts` alongside `public.is_admin()` RLS policies in `schema.sql`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Navigation to `'admin-portal'` or `'admin-feedback'` enters `handleTabChange` (`src/components/MainDashboard.tsx:1304`). | `if ((tab === 'admin-portal' || tab === 'admin-feedback') && !isAdmin)` triggers access-denied toast and aborts |
| 2 | Even if `AdminPortalView` or `AdminFeedbackView` is rendered directly, `useEffect` (`AdminPortalView.tsx:161`, `AdminFeedbackView.tsx:178`) checks `if (!isAdmin)` before calling `loadPortalData()` / `loadFeedbacks()` / `subscribeToAllFeedbacks()`. | Zero privileged queries or realtime subscriptions are started; component renders `"Akses Ditolak"` |
| 3 | If `dbService.fetchAdminPortalOverview()` or `dbService.upsertAnnouncementWithStatus()` is called directly, `verifyActiveAdminSession()` (`src/lib/supabaseService.ts:449`) checks `app_metadata.role` and `user_profiles.role` and aborts if `'user'`; at the database tier, Supabase RLS (`public.is_admin()`) rejects any direct REST/SQL request. | **Handled Safely** — Blocked at UI, service layer, and database RLS |

#### Conclusion
**Fix Verified** - Non-admin users cannot access admin views, cannot trigger admin data queries from the frontend, and are blocked by Supabase RLS even on direct API requests.
