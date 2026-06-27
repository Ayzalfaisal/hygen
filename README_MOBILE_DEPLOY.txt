HeyGen Mobile Web Admin Panel
=============================

What this is:
- This is a mobile-friendly web version of your HeyGen Admin Panel.
- It runs from a normal browser link on mobile.
- Supabase service/admin key stays on the server through Vercel environment variables.
- Do not send this link or password to clients.

Files:
- public/index.html  -> web admin UI
- public/style.css   -> responsive mobile styling
- public/app.js      -> frontend logic
- api/login.js       -> admin password login
- api/supabase.js    -> secure server-side Supabase proxy
- .env.example       -> required environment variables

Deploy on Vercel:
1. Create a new GitHub repository.
2. Upload all files from this folder to the repository.
3. Go to Vercel and import the repository.
4. In Vercel Project Settings > Environment Variables, add:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - ADMIN_PASSWORD
   - AUTH_SECRET
5. Deploy.
6. Open the Vercel link on mobile.
7. Login with ADMIN_PASSWORD.

Important:
- Use the Supabase service_role key only in Vercel environment variables.
- Never paste service_role key in frontend JavaScript.
- Since backend uses service_role, it can bypass RLS. Your public/client extension should still have safe RLS policies.
