# Creator Studio — Database, Security & Deployment Guide

## Active Live Database (Provisioned in AI Studio)
Because this Google Cloud project reached the Cloud SQL Developer Edition instance quota (`maximum 2 apps per project`), **Creator Studio** is connected to and persisted on **Firebase Cloud Firestore** (`decisive-ellipse-qggh3`) with **Firebase Authentication (Google Gmail Sign-In)** and hardened **Firestore Security Rules** (`firestore.rules`).

### First-Run Super Admin Initialization
1. Click **Sign In / Admin** in the top bar and authenticate via Google using the permanent Super Admin account: **`moeezi396@gmail.com`**.
2. On first login, Creator Studio automatically verifies your identity against `SUPER_ADMIN` rules and seeds:
   - The 6 starter software listings (`YouTube Premium`, `MovieBox Pro VIP`, `CapCut Pro`, `Spotify Premium`, `Remini AI Photo Enhancer`, `Netflix`) and their protected `/app_files` delivery manifests
   - Default `EasyPaisa` and `JazzCash` payment settings (editable in **Admin Dashboard → Payment Settings**)
   - All 8 modular `website_settings` documents (editable in **Admin Dashboard → Website Editor**)
3. Every change made in the Admin Dashboard persists in Firestore across refreshes, sign-outs, and browser restarts.

### Security Architecture (`firestore.rules`)
- **Permanent Owner Lock**: `moeezi396@gmail.com` with `email_verified == true` cannot be deleted, suspended, or demoted.
- **Granular RBAC**: Regular admins are strictly restricted to their assigned `admin_permissions` keys (`orders_view`, `orders_approve`, `orders_reject`, `apps_view`, `apps_add`, `apps_edit`, `apps_delete`, `apps_change_price`, `apps_change_files`, `content_edit`, `appearance_edit`, `payments_view`, `payments_edit_easypaisa`, `payments_edit_jazzcash`).
- **Authoritative Pricing**: Order creation validates `amountPkr == /apps/{appId}.pricePkr` inside Firestore Security Rules—client price tampering is rejected at the database layer.
- **Protected Downloads**: Private download URLs and files live in `/app_files/{appId}`, readable only by authorized admins or users with an `/entitlements/{uid}_{appId}` record created when an order is approved.

## Deploying to Production
```bash
npm install
npm run build
```
Deploy `firestore.rules` to Firebase whenever security rules are updated.

## Optional Supabase PostgreSQL Migration
If you later provision an external Supabase project, a matching PostgreSQL schema with Row Level Security scaffolding is included at `supabase/schema.sql`.
