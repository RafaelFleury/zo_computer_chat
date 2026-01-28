## Running as a Zo Computer Service

To run the app as a Zo Computer service:

1. **Clone or unzip the project** inside your Zo Computer workspace.

2. **Set up environment variables**:

   There are separate `.env` files for the backend and the frontend. You'll need to set up both:

   **Frontend:**
   ```bash
   cd zo_computer_chat/frontend
   cp .env.production .env
   # Only edit the .env if you need to override the url. But make sure you copy the .production and not .example
   ```

   **Backend:**
   ```bash
   cd ../backend
   npm install
   cp .env.example .env
   # Edit .env and add your API keys and backend settings
   npm run build
   ```

   **IMPORTANT - Security for Public Access:**

   Since your Zo Computer service URL will be publicly accessible, you **MUST** set up authentication:

   ```bash
   # Generate a secure password
   node generate-password.js

   # Add the generated password to your .env file on the backend:
   # AUTH_USERNAME=admin
   # AUTH_PASSWORD=your_generated_password_here
   ```

   This will require HTTP Basic Authentication to access your application. Keep the password secure!

3. **Configure the Service in Zo Computer**:

   - Go to the **Site** tab and select **Services**.
   - Create a new service. Set the following:
     - **Label**: any name you like
     - **Local port**: `3001` (unless you changed it in the config)
     - **Entrypoint**: `npm start`
     - **Working directory**: `/home/workspace/zo_computer_chat/backend`
   - _No need to set additional environment variables here if `.env` is set up correctly._

4. **Start the service**.
   The process should be running and accessible via the link provided by Zo Computer.

## Security Notes

- **Authentication is REQUIRED** when running as a public Zo Computer service
- The application uses HTTP Basic Authentication - your browser will prompt for username/password
- Default username: `admin` (can be changed via `AUTH_USERNAME` in `.env`)
- Password: Set via `AUTH_PASSWORD` in `.env` (use `node generate-password.js` to generate)
- All requests (frontend and API) require authentication
- If `AUTH_PASSWORD` is not set, the server will start **WITHOUT** authentication (only safe for local development)

## Accessing Your Protected Service

When you visit your Zo Computer service URL, you'll see a login prompt:
- **Username**: `admin` (or whatever you set in `AUTH_USERNAME`)
- **Password**: The password you set in `AUTH_PASSWORD`

Your browser will remember the credentials for the session.
