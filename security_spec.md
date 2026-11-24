# Creator Studio Security Specification (Phase 0)

## 1. Data Invariants
1. **Permanent Super Admin**: `moeezi396@gmail.com` with `email_verified == true` is the permanent `SUPER_ADMIN` and can never be deleted, suspended, or demoted by any user or admin.
2. **Self-Assigned Role Prevention**: Regular users creating `/profiles/{uid}` can only assign `role: 'USER'` and `status: 'ACTIVE'` (unless claiming a valid, non-expired `PENDING` invitation in `/admin_invitations` for their verified email).
3. **Price Tampering Prevention**: Creating an order in `/orders/{orderId}` requires `amountPkr` to strictly equal the live `pricePkr` stored in `/apps/{appId}` and `status == 'PENDING'`.
4. **Download Entitlement Isolation**: Private download links/files in `/app_files/{appId}` are never exposed in `/apps/{appId}` and can only be read by admins (`apps_view` / `apps_change_files`) or users with an existing `/entitlements/{uid}_{appId}` document.
5. **No Self-Approval**: Non-Super-Admin admins cannot approve their own orders, cannot modify `/admin_permissions`, cannot create/revoke `/admin_invitations`, and cannot modify `SUPER_ADMIN` profiles.
6. **Immutable Audit Trail**: `/audit_logs/{logId}` records cannot be updated or deleted by anyone, including admins.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Promotion on Profile Create**: Non-owner user creates `/profiles/{uid}` with `role: "SUPER_ADMIN"` or `role: "ADMIN"`.
2. **Role Escalation on Profile Update**: User or Admin updates `/profiles/{uid}` changing `role` to `"SUPER_ADMIN"`.
3. **Permanent Owner Deletion/Demotion**: Admin attempts to delete or update `/profiles/{superAdminUid}`.
4. **Unverified Email Spoofing**: User with `email_verified: false` attempts to write to any collection or claim `moeezi396@gmail.com`.
5. **Pre-Approved Order Injection**: User creates `/orders/{orderId}` with `status: "APPROVED"`.
6. **Price Manipulation**: User creates `/orders/{orderId}` with `amountPkr: 1` when `/apps/{appId}.pricePkr == 250`.
7. **Unpublished App Purchase**: User attempts to order an app where `isPublished == false`.
8. **Direct Entitlement Creation**: Buyer creates `/entitlements/{uid}_{appId}` directly without admin approval.
9. **Protected File Scraping**: Unentitled user calls `get` or `list` on `/app_files/{appId}`.
10. **PII / Order Cross-Read**: User A attempts to `get` or `list` User B's `/orders` or `/profiles`.
11. **Unauthorized Admin Self-Permission Grant**: Regular Admin writes to `/admin_permissions/{adminUid}` to grant themselves `orders_approve`.
12. **Shadow Field Injection**: Client submits a write payload containing an undeclared ghost field (e.g. `isVerified: true` or `bypassCheck: true`).
