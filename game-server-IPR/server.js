// CÓDIGO DO MEU AMIGO: BACK
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

// Game state
const gameState = {
    players: new Map(),
    lastProcessedInput: new Map(),
};

const TICK_RATE = 60; // Increased tick rate for smoother updates
const PLAYER_SPEED = 300; // Pixels per second (matching client)

// Process player input and update game state
function processInput(playerId, input, sequence, deltaTime) {
    const player = gameState.players.get(playerId);
    if (!player) return;

    // Store last processed input for reconciliation
    gameState.lastProcessedInput.set(playerId, sequence);

    // Update player position based on input and delta time
    const moveAmount = PLAYER_SPEED * deltaTime;
    if (input.left) player.x -= moveAmount;
    if (input.right) player.x += moveAmount;
    if (input.up) player.y -= moveAmount;
    if (input.down) player.y += moveAmount;

    // Simple collision with canvas boundaries
    player.x = Math.max(0, Math.min(800 - 50, player.x));
    player.y = Math.max(0, Math.min(600 - 50, player.y));
}

wss.on('connection', (ws) => {
    const playerId = Date.now().toString();
    console.log(`Player ${playerId} connected`);

    // Initialize player
    gameState.players.set(playerId, {
        x: Math.random() * (800 - 50),
        y: Math.random() * (600 - 50),
        color: `#${Math.floor(Math.random() * 16777215).toString(16)}`
    });

    // Send initial state
    ws.send(JSON.stringify({
        type: 'init',
        playerId,
        gameState: Array.from(gameState.players.entries())
    }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'input') {
            processInput(playerId, data.input, data.sequence, data.deltaTime);
        }
    });

    ws.on('close', () => {
        console.log(`Player ${playerId} disconnected`);
        gameState.players.delete(playerId);
        gameState.lastProcessedInput.delete(playerId);
    });
});

// Game loop
setInterval(() => {
    const worldState = Array.from(gameState.players.entries());
    const lastInputs = Array.from(gameState.lastProcessedInput.entries());

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'worldState',
                worldState,
                lastProcessedInputs: lastInputs
            }));
        }
    });
}, 1000 / TICK_RATE);

server.listen(3000, () => {
    console.log('Server running on port 3000');
});