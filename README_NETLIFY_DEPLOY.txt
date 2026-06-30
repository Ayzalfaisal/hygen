HEYGEN MOBILE ADMIN - NETLIFY DEPLOY

1) Upload these files/folders to GitHub repo root:
   public/
   netlify/
   package.json
   netlify.toml
   .env.example
   README_NETLIFY_DEPLOY.txt
   SQL_SECURITY_NOTE.txt

2) In Netlify, import the GitHub repo.

3) Build settings:
   Base directory: leave blank
   Build command: leave blank or npm install
   Publish directory: public
   Functions directory: netlify/functions

4) Add Environment Variables in Netlify:
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ADMIN_PASSWORD=your-admin-login-password
   AUTH_SECRET=any-long-random-secret

5) Deploy.

6) Open the Netlify site link on mobile and login with ADMIN_PASSWORD.

IMPORTANT:
Never upload .env or real keys to GitHub.
SUPABASE_SERVICE_ROLE_KEY must stay only in Netlify environment variables.
