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

class GameRoom {
  constructor(id) {
    this.id = id;
    this.tanks = new Map();
    this.bullets = new Map();
    this.players = new Set();
    this.isRunning = false;
    this.gameLoopInterval = null;
    // Novo: Rastrear último moveNumber para cada tanque
    this.lastMoveNumbers = new Map();
  }

  addPlayer(ws) {
    if (this.players.size >= 2) return false;

    const tankId = uuidv4();
    const isFirstTank = this.tanks.size === 0;

    const tank = {
      id: tankId,
      x: isFirstTank ? 100 : 900,
      y: 300,
      angle: isFirstTank ? 0 : Math.PI,
      color: isFirstTank ? 'green' : 'blue'
    };

    this.tanks.set(tankId, tank);
    this.players.add(ws);
    ws.tankId = tankId;
    ws.roomId = this.id;
    // Novo: Inicializa o lastMoveNumber para este tanque
    this.lastMoveNumbers.set(tankId, 0);

    ws.send(JSON.stringify({
      type: "spawn",
      tank,
      isFirstTank,
      roomId: this.id
    }));

    if (this.players.size === 2) {
      this.startGame();
    }

    return true;
  }
  z
  removePlayer(ws) {
    this.players.delete(ws);
    this.tanks.delete(ws.tankId);
    // Novo: Remove o lastMoveNumber do tanque
    this.lastMoveNumbers.delete(ws.tankId);

    this.broadcast({
      type: "playerLeft",
      tankId: ws.tankId
    });

    if (this.players.size === 0) {
      this.stopGame();
      return true;
    }
    return false;
  }

  updateTankPosition(tank, actions, moveNumber) {
    // Novo: Validação do moveNumber
    const lastMoveNumber = this.lastMoveNumbers.get(tank.id);
    if (moveNumber <= lastMoveNumber) {
      return false; // Ignora movimentos antigos ou duplicados
    }
    this.lastMoveNumbers.set(tank.id, moveNumber);

    const speed = 2;

    const previousPosition = {
      x: tank.x,
      y: tank.y,
      angle: tank.angle
    };

    if (actions.forward) {
      tank.x += Math.cos(tank.angle) * speed;
      tank.y += Math.sin(tank.angle) * speed;
    }
    if (actions.backward) {
      tank.x -= Math.cos(tank.angle) * speed;
      tank.y -= Math.sin(tank.angle) * speed;
    }
    if (actions.left && !actions.backward) {
      tank.angle -= 0.03;
    } else if (actions.left && actions.backward) {
      tank.angle += 0.03;
    }
    if (actions.right && !actions.backward) {
      tank.angle += 0.03;
    } else if (actions.right && actions.backward) {
      tank.angle -= 0.03;
    }

    const collisionWidth = 68;
    const collisionHeight = 50;

    tank.x = Math.max(collisionWidth / 2, Math.min(1000 - collisionWidth / 2, tank.x));
    tank.y = Math.max(collisionHeight / 2, Math.min(600 - collisionHeight / 2, tank.y));

    // Retorna true se houve mudança na posição
    return previousPosition.x !== tank.x ||
      previousPosition.y !== tank.y ||
      previousPosition.angle !== tank.angle;
  }

  createBullet(tankId) {
    const tank = this.tanks.get(tankId);
    const bullet = {
      id: uuidv4(),
      x: tank.x + Math.cos(tank.angle) * 20,
      y: tank.y + Math.sin(tank.angle) * 20,
      angle: tank.angle,
      speed: 10,
      tankId: tankId,
      createdAt: Date.now()
    };
    this.bullets.set(bullet.id, bullet);
    this.broadcast({
      type: "newBullet",
      bullet
    });
  }

  updateBullet(bullet) {
    bullet.x += Math.cos(bullet.angle) * bullet.speed;
    bullet.y += Math.sin(bullet.angle) * bullet.speed;

    if (Date.now() - bullet.createdAt > 1500) {
      this.bullets.delete(bullet.id);
      return false;
    }

    if (bullet.x < 3 || bullet.x > 997) bullet.angle = Math.PI - bullet.angle;
    if (bullet.y < 3 || bullet.y > 597) bullet.angle = -bullet.angle;

    return true;
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    this.players.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  gameLoop() {
    // Atualiza todas as balas
    for (const bullet of this.bullets.values()) {
      this.updateBullet(bullet);
    }

    const updates = {
      tanks: Array.from(this.tanks.values()),
      bullets: Array.from(this.bullets.values()),
      // Novo: Inclui os moveNumbers no estado do jogo
      moveNumbers: Object.fromEntries(this.lastMoveNumbers)
    };

    this.broadcast({
      type: "update",
      gameState: updates
    });
  }

  startGame() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.gameLoopInterval = setInterval(() => this.gameLoop(), 1000 / 60);
      this.broadcast({ type: "gameStart" });
    }
  }

  stopGame() {
    if (this.isRunning) {
      this.isRunning = false;
      clearInterval(this.gameLoopInterval);
      this.broadcast({ type: "gameEnd" });
    }
  }
}

// RoomManager permanece o mesmo
class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.waitingRoom = null;
  }

  createRoom() {
    const roomId = uuidv4();
    const room = new GameRoom(roomId);
    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(ws) {
    if (this.waitingRoom && this.rooms.has(this.waitingRoom)) {
      const room = this.rooms.get(this.waitingRoom);
      if (room.addPlayer(ws)) {
        if (room.players.size === 2) {
          this.waitingRoom = null;
        }
        return;
      }
    }

    const room = this.createRoom();
    room.addPlayer(ws);
    this.waitingRoom = room.id;
  }

  handlePlayerLeave(ws) {
    if (!ws.roomId) return;

    const room = this.rooms.get(ws.roomId);
    if (room) {
      const shouldRemoveRoom = room.removePlayer(ws);
      if (shouldRemoveRoom) {
        this.rooms.delete(ws.roomId);
        if (this.waitingRoom === ws.roomId) {
          this.waitingRoom = null;
        }
      }
    }
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }
}

const roomManager = new RoomManager();

wss.on("connection", (ws) => {
  roomManager.joinRoom(ws);

  ws.on("message", (message) => {
    const data = JSON.parse(message);
    const room = roomManager.getRoom(ws.roomId);
    if (!room) return;

    const tank = room.tanks.get(ws.tankId);
    if (!tank) return;

    if (data.type === "move") {
      // Novo: Passa o moveNumber para updateTankPosition
      room.updateTankPosition(tank, data.actions, data.moveNumber);
    } else if (data.type === "shoot") {
      room.createBullet(ws.tankId);
    }
  });

  ws.on("close", () => {
    roomManager.handlePlayerLeave(ws);
  });
});

server.listen(3000, () => console.log("Servidor rodando na porta 3000"));