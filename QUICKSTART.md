# Quick Start Guide

Get up and running with Zo Computer Chat in 5 minutes!

## Prerequisites

- Node.js 18 or higher
- A [Zo Computer](https://zo.computer) account
- A [Z.AI](https://z.ai) account

## Step 1: Get Your API Keys

### Zo Computer API Key
1. Go to [https://zo.computer](https://zo.computer)
2. Navigate to **Settings** → **API & MCP**
3. Click **Generate API Key**
4. Copy your API key (keep it secret!)

### Z.AI API Key
1. Go to [https://z.ai](https://z.ai)
2. Sign up or log in
3. Navigate to your dashboard
4. Find your API key and copy it

## Step 2: Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

## Step 3: Configure Environment

```bash
# Backend configuration
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your keys:
```env
ZO_API_KEY=your_zo_api_key_here
ZAI_API_KEY=your_zai_api_key_here
MODEL_NAME=glm-4-flash
PORT=3001
```

```bash
# Frontend configuration (optional - defaults work fine)
cd ../frontend
cp .env.example .env
```

## Step 4: Run the Application

### Option A: Use the startup script (recommended)
```bash
# From the project root
./start.sh
```

### Option B: Manual start

**Terminal 1** - Backend:
```bash
cd backend
npm run dev
```

**Terminal 2** - Frontend:
```bash
cd frontend
npm run dev
```

## Step 5: Open the App

Open your browser to [http://localhost:3000](http://localhost:3000)

You should see:
- **Chat Tab**: Send messages to GLM-4.7 with Zo tools
- **Logs Tab**: Monitor all activity in real-time

## First Chat

Try these example messages:

1. **Simple query**:
   ```
   What's the weather like today?
   ```

2. **File operations** (if you have files in your Zo workspace):
   ```
   List the files in my workspace
   ```

3. **Web search**:
   ```
   Search the web for the latest news about AI
   ```

4. **Calendar integration** (if you've connected Google Calendar):
   ```
   What's on my calendar today?
   ```

## Verify Everything Works

1. **Backend is running**: Check the terminal - you should see:
   ```
   Server running on http://localhost:3001
   Connected to Zo MCP server. Available tools: X
   ```

2. **MCP tools are available**: Visit [http://localhost:3001/api/tools](http://localhost:3001/api/tools) to see all available Zo tools

3. **Health check**: Visit [http://localhost:3001/health](http://localhost:3001/health) to see connection status

## Troubleshooting

### "ZO_API_KEY is not set"
- Make sure you created `backend/.env` from `.env.example`
- Verify your API key is correctly pasted (no extra spaces)

### "Failed to connect to Zo MCP server"
- Check that your Zo API key is valid
- Verify your Zo account is active
- Check [https://status.zo.computer](https://status.zo.computer) for service status

### "Cannot connect to backend"
- Verify backend is running on port 3001
- Check `frontend/.env` has correct `VITE_API_URL`
- Look for errors in backend terminal

### "No tools available"
- Check backend logs for connection errors
- Verify Zo account has proper permissions
- Try restarting the backend

## Next Steps

- Read [README.md](README.md) for full documentation
- Check [ARCHITECTURE.md](ARCHITECTURE.md) to understand the system
- Explore the **Logs** tab to see how tools are being used
- Try different GLM models by changing `MODEL_NAME` in `.env`

## Available Models

Edit `MODEL_NAME` in `backend/.env`:

- `glm-4-flash` - Fast and cost-effective (default)
- `glm-4-plus` - Most capable
- `glm-4-air` - Balanced performance
- `glm-4-long` - Extended context
- `glm-4-flash-vision` - Vision capabilities

## Support

- [Zo Computer Docs](https://docs.zocomputer.com)
- [Z.AI Docs](https://docs.z.ai)
- [MCP Documentation](https://modelcontextprotocol.io)

Enjoy using Zo Computer Chat! 🚀
