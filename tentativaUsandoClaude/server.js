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

const tanks = new Map();
const bullets = new Map();

function updateTankPosition(tank, action) {
    const speed = 2;

    if (action.forward) {
        tank.x += Math.cos(tank.angle) * speed;
        tank.y += Math.sin(tank.angle) * speed;
    }
    if (action.backward) {
        tank.x -= Math.cos(tank.angle) * speed;
        tank.y -= Math.sin(tank.angle) * speed;
    }
    if (action.left && !action.backward) {
        tank.angle -= 0.03;
    } else if (action.left && action.backward) {
        tank.angle += 0.03;
    }
    if (action.right && !action.backward) {
        tank.angle += 0.03;
    } else if (action.right && action.backward) {
        tank.angle -= 0.03;
    }

    // Limitações de borda
    const collisionWidth = 68; // 40 * 1.7
    const collisionHeight = 50; // 20 * 2.5

    tank.x = Math.max(collisionWidth / 2, Math.min(1000 - collisionWidth / 2, tank.x));
    tank.y = Math.max(collisionHeight / 2, Math.min(600 - collisionHeight / 2, tank.y));
}

function createBullet(tankId) {
    const tank = tanks.get(tankId);
    const bullet = {
        id: uuidv4(),
        x: tank.x + Math.cos(tank.angle) * 20,
        y: tank.y + Math.sin(tank.angle) * 20,
        angle: tank.angle,
        speed: 10,
        tankId: tankId,
        createdAt: Date.now()
    };
    bullets.set(bullet.id, bullet);
    return bullet;
}

function updateBullet(bullet, deltaTime) {
    bullet.x += Math.cos(bullet.angle) * bullet.speed;
    bullet.y += Math.sin(bullet.angle) * bullet.speed;

    // Remove bullet after 1.5 seconds
    if (Date.now() - bullet.createdAt > 1500) {
        bullets.delete(bullet.id);
        return false;
    }

    // Bounce off walls
    if (bullet.x < 3 || bullet.x > 997) bullet.angle = Math.PI - bullet.angle;
    if (bullet.y < 3 || bullet.y > 597) bullet.angle = -bullet.angle;

    return true;
}

function gameLoop() {
    const updates = {
        tanks: Array.from(tanks.values()),
        bullets: Array.from(bullets.values())
    };

    // Update all bullets
    for (const bullet of bullets.values()) {
        updateBullet(bullet, 1 / 60);
    }

    broadcast(JSON.stringify({ type: "update", gameState: updates }));
    setTimeout(gameLoop, 1000 / 60);
}

function broadcast(message) {
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

wss.on("connection", (ws) => {
    const tankId = uuidv4();
    const isFirstTank = tanks.size === 0;

    const tank = {
        id: tankId,
        x: isFirstTank ? 100 : 900,
        y: 300,
        angle: isFirstTank ? 0 : Math.PI,
        color: isFirstTank ? 'green' : 'blue'
    };

    tanks.set(tankId, tank);
    ws.tankId = tankId;

    ws.send(JSON.stringify({
        type: "spawn",
        tank,
        isFirstTank
    }));

    ws.on("message", (message) => {
        const data = JSON.parse(message);
        const tank = tanks.get(ws.tankId);

        if (data.type === "move") {
            updateTankPosition(tank, data.actions);
        } else if (data.type === "shoot") {
            const bullet = createBullet(ws.tankId);
            broadcast(JSON.stringify({ type: "newBullet", bullet }));
        }
    });

    ws.on("close", () => {
        tanks.delete(ws.tankId);
        broadcast(JSON.stringify({ type: "playerLeft", tankId: ws.tankId }));
    });
});

gameLoop();

server.listen(3000, () => console.log("Servidor rodando na porta 3000"));