#!/bin/bash

# Zo Computer Chat - Startup Script

echo "🚀 Starting Zo Computer Chat..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✓ Node.js $(node --version) detected"
echo ""

# Function to check if port is in use
check_port() {
    local port=$1
    lsof -ti:$port >/dev/null 2>&1
}

# Kill existing processes on ports if they exist
echo "🔍 Checking for existing processes..."
if check_port 3001; then
    echo "⚠️  Port 3001 is already in use. Killing existing backend process..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    sleep 1
fi

if check_port 3000; then
    echo "⚠️  Port 3000 is already in use. Killing existing process..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    sleep 1
fi

if check_port 5173; then
    echo "⚠️  Port 5173 is already in use. Killing existing Vite process..."
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    sleep 1
fi

echo "✓ Ports are clear"
echo ""

# Check backend dependencies
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
    echo ""
fi

# Check frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
    echo ""
fi

# Check backend .env
if [ ! -f "backend/.env" ]; then
    echo "⚠️  Backend .env file not found. Creating from example..."
    cp backend/.env.example backend/.env
    echo ""
    echo "❗ Please edit backend/.env and add your API keys:"
    echo "   - ZO_API_KEY (from https://zo.computer Settings > API & MCP)"
    echo "   - ZAI_API_KEY (from https://z.ai)"
    echo ""
    exit 1
fi

# Check frontend .env
if [ ! -f "frontend/.env" ]; then
    echo "⚠️  Frontend .env file not found. Creating from example..."
    cp frontend/.env.example frontend/.env
    echo ""
fi

# Trap Ctrl+C and other signals to cleanup
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."

    # Kill backend and frontend
    if [ ! -z "$BACKEND_PID" ]; then
        kill -TERM $BACKEND_PID 2>/dev/null
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill -TERM $FRONTEND_PID 2>/dev/null
    fi

    # Give processes time to cleanup
    sleep 2

    # Force kill if still running
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    lsof -ti:5173 | xargs kill -9 2>/dev/null

    echo "✅ Servers stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Start backend in background
echo "🔧 Starting backend server..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 3

# Start frontend
echo "🎨 Starting frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Both servers are starting!"
echo ""
echo "📍 Frontend: http://localhost:3000 (or check console for actual port)"
echo "📍 Backend:  http://localhost:3001"
echo ""
echo "💡 To stop: Press Ctrl+C or run ./stop.sh"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
