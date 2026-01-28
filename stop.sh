#!/bin/bash

# Zo Computer Chat - Stop Script

echo "🛑 Stopping Zo Computer Chat..."
echo ""

# Function to kill processes on a specific port
kill_port() {
    local port=$1
    local process_name=$2

    # Find PIDs using the port
    local pids=$(lsof -ti:$port 2>/dev/null)

    if [ -n "$pids" ]; then
        echo "🔪 Killing $process_name processes on port $port..."
        echo "$pids" | xargs kill -9 2>/dev/null
        echo "✓ $process_name stopped"
    else
        echo "✓ No $process_name process found on port $port"
    fi
}

# Function to kill Node processes by name pattern
kill_node_processes() {
    local pattern=$1
    local name=$2

    # Find PIDs matching the pattern
    local pids=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')

    if [ -n "$pids" ]; then
        echo "🔪 Killing $name processes..."
        echo "$pids" | xargs kill -9 2>/dev/null
        echo "✓ $name stopped"
    fi
}

# Kill backend (port 3001)
kill_port 3001 "Backend"

# Kill frontend (port 3000 and 5173 for Vite)
kill_port 3000 "Frontend"
kill_port 5173 "Frontend (Vite)"

# Kill any remaining node processes related to the project
kill_node_processes "backend/src/index.js" "Backend node"
kill_node_processes "vite" "Frontend Vite"

# Clean up any PID files if they exist
rm -f /tmp/zo_chat_backend.pid 2>/dev/null
rm -f /tmp/zo_chat_frontend.pid 2>/dev/null

echo ""
echo "✅ All processes stopped!"
echo ""
