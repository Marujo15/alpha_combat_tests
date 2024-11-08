/*
This code implements the server-side logic for a multiplayer game using 
WebSocket for real-time communication. The main components and concepts are:

    1.  Express server: Serves static files and handles HTTP requests.
    2.  WebSocket server: Manages real-time bidirectional communication with 
        clients.
    3.  Game state management: Tracks players, bullets, and game world state.
    4.  Action queue: Processes player actions (movement, shooting) in order.
    5.  Game loop: Runs at 60 FPS, updating game state and broadcasting updates 
        to clients.
    6.  Collision detection: Checks for bullet collisions with players.
    7.  Player management: Handles player joining, leaving, and updates.
    8.  Bullet management: Creates, moves, and removes bullets.

Message formats:

Sent to clients:
    1.  Full snapshot: { 
            type: "fullSnapshot", 
            player: {...}, 
            players: [...], 
            bullets: [...] 
        }
    2.  Updates: { 
            type: "update", 
            updates: [ 
                { type: "playerUpdate", ... }, 
                { type: "bulletUpdate", ... }, 
                ... 
            ] 
        }

Received from clients:
    1.  Player movement: { 
            action: "move", 
            direction: "...", 
            sequenceNumber: ... 
        }
    2.  Shooting: { 
            action: "shoot", 
            bulletId: "...", 
            targetX: ..., 
            targetY: ... 
        }

The server maintains the authoritative game state, processes all game logic, 
and sends updates to clients. It uses an action queue to ensure fair processing 
of player actions and maintains consistency across all connected clients. The 
game loop runs at a fixed rate, updating the game state and broadcasting 
changes to all connected clients.
*/

const express = require("express");
const WebSocket = require("ws");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "frontend")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

const mapSize = 1000;
const playerSize = 50;
const bulletSize = 10;
const bulletSpeed = 10;
const bulletLifetime = 5000; // 5 seconds

const players = new Map();
const bullets = new Map();
// adicionar walls
const actionQueue = [];

const shotCooldown = 1000; // 1 second cooldown

function movePlayer(player, direction) {
    player.speedX = player.speed * Math.cos(player.angle);
    player.speedY = player.speed * Math.sin(player.angle);

    switch (direction) {
        case "up":
            console.log('player', player)
            console.log('direction', direction)
            console.log('player.x', player.x)
            console.log('player.speedX', player.speedX)
            console.log('player.y', player.y)
            console.log('player.speedY', player.speedY)
            player.x += Number(player.speedX);
            player.y += Number(player.speedY);
            console.log('player', player)

            break;
        case "down":
            player.x -= player.speedX;
            player.y -= player.speedY;
            break;
        case "left":
            player.angle -= 0.03;
            console.log(player)
            player.speedX = player.speed * Math.cos(player.angle);
            player.speedY = player.speed * Math.sin(player.angle);
            break;
        case "right":
            player.angle += 0.03;
            player.speedX = player.speed * Math.cos(player.angle);
            player.speedY = player.speed * Math.sin(player.angle);
            break;
    }

    player.x = Math.max(
        playerSize,
        Math.min(mapSize, player.x)
    );

    player.y = Math.max(
        playerSize,
        Math.min(mapSize, player.y)
    );
}

function moveBullet(bullet) {
    bullet.x += bullet.speedX;
    bullet.y += bullet.speedY;

    if (bullet.x <= bulletSize / 2 || bullet.x >= mapSize - bulletSize / 2) {
        bullet.speedX *= -1;
    }
    if (bullet.y <= bulletSize / 2 || bullet.y >= mapSize - bulletSize / 2) {
        bullet.speedY *= -1;
    }

    bullet.x = Math.max(
        bulletSize / 2,
        Math.min(mapSize - bulletSize / 2, bullet.x)
    );

    bullet.y = Math.max(
        bulletSize / 2,
        Math.min(mapSize - bulletSize / 2, bullet.y)
    );

    bullet.sequenceNumber++;
}

function checkBulletCollisions(bullet) {
    for (const player of players.values()) {
        if (player.id !== bullet.playerId) {
            const dx = player.x - bullet.x;
            const dy = player.y - bullet.y;
            const distance = Math.sqrt(dx ** 2 + dy ** 2);

            if (distance < (playerSize + bulletSize) / 2) {
                return player;
            }
        }
    }
    return null;
}

function gameLoop() {
    const updates = [];

    while (actionQueue.length > 0) {
        const action = actionQueue.shift();
        if (action.type === "move") {
            const player = players.get(action.playerId);
            if (player) {
                movePlayer(player, action.direction);
                updates.push({
                    type: "playerUpdate",
                    id: player.id,
                    x: player.x,
                    y: player.y,
                    angle: player.angle,
                    speed: player.speed,
                    sequenceNumber: action.sequenceNumber,
                });
            }
        } else if (action.type === "shoot") {
            const player = players.get(action.playerId);
            const currentTime = Date.now();
            if (
                player &&
                !bullets.has(action.bulletId) &&
                currentTime - player.lastShotTime >= shotCooldown
            ) {
                const bullet = {
                    id: action.bulletId,
                    playerId: player.id,
                    x: player.x,
                    y: player.y,
                    speed: bulletSpeed,
                    speedX: bulletSpeed * Math.cos(player.angle),
                    speedY: bulletSpeed * Math.cos(player.angle),
                    angle: player.angle,
                    createdAt: currentTime,
                    sequenceNumber: 0,
                };

                bullets.set(bullet.id, bullet);
                player.lastShotTime = currentTime;
            }
        } else if (action.type === "playerJoin") {
            updates.push(action);
        } else if (action.type === "playerLeave") {
            updates.push(action);
        }
    }

    for (const [bulletId, bullet] of bullets.entries()) {
        moveBullet(bullet);

        const hitPlayer = checkBulletCollisions(bullet);
        if (hitPlayer) {
            updates.push({
                type: "explosion",
                x: hitPlayer.x,
                y: hitPlayer.y,
            });
            bullets.delete(bulletId);
            updates.push({ type: "bulletRemove", id: bulletId });
        } else if (Date.now() - bullet.createdAt > bulletLifetime) {
            bullets.delete(bulletId);
            updates.push({ type: "bulletRemove", id: bulletId });
        } else {
            updates.push({
                type: "bulletUpdate",
                id: bulletId,
                playerId: bullet.playerId,
                x: bullet.x,
                y: bullet.y,
                vx: bullet.vx,
                vy: bullet.vy,
                sequenceNumber: bullet.sequenceNumber,
            });
        }
    }

    if (updates.length > 0) {
        broadcast({ type: "update", updates: updates });
    }

    setTimeout(gameLoop, 1000 / 60);
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
        x: Math.floor(Math.random() * (mapSize - playerSize)) + playerSize / 2,
        y: Math.floor(Math.random() * (mapSize - playerSize)) + playerSize / 2,
        speed: 5,
        angle: Number((Math.random() * (2 * Math.PI)).toFixed(2)),
        lastShotTime: 0,
    };

    players.set(player.id, player);

    console.log(player)

    const fullSnapshot = {
        type: "fullSnapshot",
        player: player,
        players: Array.from(players.values()),
        bullets: Array.from(bullets.values()),
    };

    ws.send(JSON.stringify(fullSnapshot));

    actionQueue.push({
        type: "playerJoin",
        id: player.id,
        x: player.x,
        y: player.y,
    });

    ws.on("message", (message) => {
        const data = JSON.parse(message);
        if (data.action === "move") {
            actionQueue.push({
                type: "move",
                playerId: player.id,
                direction: data.direction,
                sequenceNumber: data.sequenceNumber,
            });
        } else if (data.action === "shoot") {
            actionQueue.push({
                type: "shoot",
                playerId: player.id,
                bulletId: data.bulletId,
                angle: data.angle,
            });
        } else if (data.action === "ping") {
            ws.send(JSON.stringify({ type: "pong", id: data.id }));
        }
    });

    ws.on("close", () => {
        players.delete(player.id);
        actionQueue.push({
            type: "playerLeave",
            id: player.id,
        });
    });
});

gameLoop();

server.listen(3000, () => console.log("Server listening on port 3000"));
