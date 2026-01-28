## Running as a Zo Computer Service

To run the app as a Zo Computer service:

1. **Clone or unzip the project** inside your Zo Computer workspace.

2. **Set up environment variables**:

   There are separate `.env` files for the backend and the frontend. You'll need to set up both:

   **Backend:**
   ```bash
   cd zo_computer_chat/backend
   cp .env.example .env
   # Edit .env and add your API keys and backend settings
   ```

   **Frontend:**
   ```bash
   cd ../frontend
   cp .env.production .env
   # Only edit the .env if you need to override the url. But make sure you copy the .production and not .example
   ```

3. **Build the backend**:

   Open a terminal in your workspace and run:
   ```bash
   cd zo_computer_chat/backend
   npm run build
   ```

4. **Configure the Service in Zo Computer**:

   - Go to the **Site** tab and select **Services**.
   - Create a new service. Set the following:
     - **Label**: any name you like
     - **Local port**: `3001` (unless you changed it in the config)
     - **Entrypoint**: `npm start`
     - **Working directory**: `/home/workspace/zo_computer_chat/backend`
   - _No need to set additional environment variables here if `.env` is set up correctly._

5. **Start the service**.  
   The process should be running and accessible via the link provided by Zo Computer.
