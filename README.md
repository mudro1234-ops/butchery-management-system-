# Butchery Management System

Next.js + Supabase operations platform for a Zimbabwean butchery.

## Current foundation
- Supabase Auth sign-in and owner registration
- Business onboarding RPC creates three departments
- Owner/manager/cashier/stock-clerk role model
- Dashboard reads live sales, expenses, products and departments
- Database foundation for stock batches, beef carcass traceability, processing yield, sales, shifts, suppliers, expenses and audit records
- Row Level Security enabled across business tables

## Run locally
1. Copy .env.example to .env.local.
2. Add Supabase project URL and publishable key.
3. Run npm install, then npm run dev.

Never put a Supabase service-role key in browser code or commit secrets.

## Production configuration
Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel environment variables.

## Important
This is the initial application foundation. Posting sales, stock deductions, supplier ledger settlement, cash reconciliation, and carcass processing approval workflows must be implemented as audited database transactions before live financial use.
