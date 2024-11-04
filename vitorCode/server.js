const express = require("express");
const WebSocket = require("ws");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// Create an Express application
const app = express();
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "frontend")));

// Serve the index.html file on the root route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

const mapSize = 1000;
const size = 50; // player size
const players = new Map();

function movePlayer(player, direction) {
    const speed = 5;

    switch (direction) {
        case "up":
            player.y = Math.max(0, player.y - speed);
            break;
        case "down":
            player.y = Math.min(mapSize - size, player.y + speed);
            break;
        case "left":
            player.x = Math.max(0, player.x - speed);
            break;
        case "right":
            player.x = Math.min(mapSize - size, player.x + speed);
            break;
    }
}

function gameLoop() {
    const updates = [];
    for (const player of players.values()) {
        while (player.moveQueue.length > 0) {
            const move = player.moveQueue.shift();
            movePlayer(player, move.direction);
            updates.push({
                id: player.id,
                x: player.x,
                y: player.y,
                moveNumber: move.moveNumber,
            });
        }
    }
    broadcast({ type: "update", players: updates });
    setTimeout(gameLoop, 1000 / 60); // Adjust the interval as needed
}

function broadcast(message) {
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    }
}

wss.on("connection", (ws) => {
    const player = {
        id: uuidv4(),
        x: Math.floor(Math.random() * mapSize),
        y: Math.floor(Math.random() * mapSize),
        size: 10,
        moveQueue: [],
    };

    players.set(player.id, player);

    ws.send(JSON.stringify({ type: "spawn", player }));

    ws.on("message", (message) => {
        const { action, direction, moveNumber } = JSON.parse(message);
        if (action === "move") {
            player.moveQueue.push({ direction, moveNumber });
        }
    });

    ws.on("close", () => {
        players.delete(player.id);
    });
});

gameLoop();

server.listen(3000, () => console.log("listening"));