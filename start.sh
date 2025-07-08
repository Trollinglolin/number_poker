#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start the backend server
cd "$SCRIPT_DIR/server" && npm run dev &
BACKEND_PID=$!

# Start the frontend server
cd "$SCRIPT_DIR/client" && npm start &
FRONTEND_PID=$!

# Function to handle script termination
cleanup() {
    echo "Shutting down servers..."
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit
}

# Trap SIGINT (Ctrl+C) and call cleanup
trap cleanup SIGINT

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID 