/*
This code implements a multiplayer game using WebSocket for real-time 
communication between the client and server. The main abstractions and concepts 
used are:

    1.  WebSocket: For real-time bidirectional communication between client and 
        server.
    2.  Canvas: For rendering the game graphics.
    3.  PredictedEntity: Represents entities (players, bullets) with client-side 
        prediction and server reconciliation.
    4.  InterpolatedEntity: Represents entities with interpolation for smooth 
        movement.
    5.  Input handling: Processes keyboard and mouse inputs for player movement 
        and shooting.
    6.  Game loop: Runs at 60 FPS, handling input, updating game state, and 
        rendering.
    7.  Client-side prediction: Applies local updates immediately and reconciles 
        with server updates.
    8.  Interpolation: Smooths movement of other players and bullets between 
        server updates.
    9.  Collision detection: Checks for bullet collisions with players.

Message formats:

Received from server:
    1. Full snapshot: { 
        type: "fullSnapshot", 
        player: {...}, 
        players: [...], 
        bullets: [...] 
    },
    
    2. Updates: { 
        type: "update", 
        updates: [ 
            { type: "playerUpdate", ... }, 
            { type: "bulletUpdate", ... }, 
            ... 
        ] 
    }

Sent to server:
    1. Player movement: { 
        action: "move", 
        direction: "...", 
        sequenceNumber: ... 
    },

    2. Shooting: { 
        action: "shoot", 
        bulletId: "...", 
        targetX: ..., 
        targetY: ... 
    }

The game uses client-side prediction and server reconciliation to provide 
responsive gameplay while maintaining consistency with the authoritative server. 
It also implements interpolation for smooth rendering of other players and bullets.
*/

const ws = new WebSocket('ws://localhost:3000');
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const playerSize = 50;
const bulletSize = 5;
const mapSize = 1000;
const bulletSpeed = 10;

let localPlayer = null;
const players = new Map();
const bullets = new Map();
const localBullets = new Map();

// adicionar walls
const explosions = new Map();
const updateQueue = [];
const keyState = {
    "ArrowUp": false,
    "ArrowDown": false,
    "ArrowLeft": false,
    "ArrowRight": false,
    " ": false
};

let shootQueue = [];
let globalTickNumber = 0;
let isReconciling = false;

let lastShotTime = 0;
const shotCooldown = 1000; // 1 second cooldown


class PredictedEntity {
    constructor(id, x, y, speed = 5, angle = 0) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.angle = angle; // rad
        this.moveHistory = [];
        this.sequenceNumber = 0;
        this.speedX = this.speed * Math.cos(this.angle);
        this.speedY = this.speed * Math.sin(this.angle);
    }

    addMove(x, y, speed = this.speed, angle = this.angle) {
        this.sequenceNumber++;
        this.moveHistory.push({
            sequenceNumber: this.sequenceNumber,
            x,
            y,
            speed,
            angle,
        });
        return this.sequenceNumber;
    }

    getMoveFromSequenceNumber(sequenceNumber) {
        return this.moveHistory.find(
            (move) => move.sequenceNumber === sequenceNumber
        );
    }

    getAndDeleteUnacknowledgedMoves(fromSequenceNumber) {
        const moves = this.moveHistory.filter(
            (move) => move.sequenceNumber > fromSequenceNumber
        );
        this.moveHistory = [];
        this.sequenceNumber = fromSequenceNumber;
        return moves;
    }

    keepUnacknowledgedMoves(fromSequenceNumber) {
        this.moveHistory = this.moveHistory.filter(
            (move) => move.sequenceNumber > fromSequenceNumber
        );
    }
}

class InterpolatedEntity {
    constructor(id, x, y, angle) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = angle; // rad
        this.toX = x;
        this.toY = y;
        this.toAngle = angle;;
    }

    updateTarget(x, y, angle) {
        this.toX = x;
        this.toY = y;
        this.toAngle = angle;
    }

    interpolate(t) {
        this.x = interpolate(this.x, this.toX, t);
        this.y = interpolate(this.y, this.toY, t);
        this.angle = interpolate(this.angle, this.toAngle, t);
    }
}

function interpolate(a, b, t) {
    return a + (b - a) * t;
}

function movePlayer(player, direction) {
    player.speedX = player.speed * Math.cos(player.angle);
    player.speedY = player.speed * Math.sin(player.angle);

    switch (direction) {
        case "up":
            player.x += player.speedX;
            player.y += player.speedY;
            break;
        case "down":
            player.x -= player.speedX;
            player.y -= player.speedY;
            break;
        case "left":
            player.angle -= 0.03;
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

    console.log(player)

    return player.addMove(player.x, player.y);
}

function createBullet(playerId, startX, startY, angle = 0) {
    return new PredictedEntity(
        `${playerId}-${Date.now()}`,
        startX,
        startY,
        bulletSpeed,
        angle,
    );
}

function moveBullet(bullet) {
    bullet.x += bullet.speedX;
    bullet.y += bullet.speedY;

    if (bullet.x <= bulletSize || bullet.x >= mapSize - bulletSize) {
        bullet.speedX *= -1;
    }
    if (bullet.y <= bulletSize || bullet.y >= mapSize - bulletSize) {
        bullet.speedY *= -1;
    }

    bullet.x = Math.max(
        bulletSize,
        Math.min(mapSize - bulletSize, bullet.x)
    );

    bullet.y = Math.max(
        bulletSize,
        Math.min(mapSize - bulletSize, bullet.y)
    );

    return bullet.addMove(bullet.x, bullet.y);
}

function processInput() {
    if (isReconciling) return;

    const directions = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "];
    directions.forEach((key) => {
        if (key !== " ") {
            if (keyState[key]) {
                const direction = key.toLowerCase().replace("arrow", "");
                console.log('localPlayer', localPlayer)
                console.log('direction', direction)
                const sequenceNumber = movePlayer(localPlayer, direction);
                ws.send(
                    JSON.stringify({
                        action: "move",
                        direction,
                        sequenceNumber,
                    })
                );
            }
        } else {
            if (keyState[key]) {
                const currentTime = Date.now();
                if (currentTime - lastShotTime >= shotCooldown) {
                    // lastShotTime = currentTime;
                    shootQueue.push({ angle: localPlayer.angle });
                } else {
                    console.log("Shot on cooldown. Please wait.");
                }
            }
        }
    });

    while (shootQueue.length > 0) {
        const shootInput = shootQueue.shift();
        const bullet = createBullet(
            localPlayer.id,
            localPlayer.x - playerSize / 2,
            localPlayer.y - playerSize / 2,
            shootInput.angle,
        );
        localBullets.set(bullet.id, bullet);
        ws.send(
            JSON.stringify({
                action: "shoot",
                bulletId: bullet.id,
                angle: shootInput.angle,
            })
        );
    }
}

function processUpdateQueue() {
    while (updateQueue.length > 0) {
        const update = updateQueue.shift();
        switch (update.type) {
            case "playerJoin":
                const isMe = localPlayer && localPlayer.id === update.id;
                if (!isMe && !players.has(update.id)) {
                    players.set(
                        update.id,
                        new InterpolatedEntity(update.id, update.x, update.y, update.angle)
                    );
                }
                break
            case "playerLeave":
                players.delete(update.id);
                break
            case "playerUpdate":
                if (update.id === localPlayer.id) {
                    validateAndReconcile(localPlayer, update);
                } else if (players.has(update.id)) {
                    players.get(update.id).updateTarget(update.x, update.y, update.angle);
                } else {
                    players.set(
                        update.id,
                        new InterpolatedEntity(update.id, update.x, update.y, update.angle)
                    );
                }
                break
            case "bulletUpdate":
                const bulletId = update.id;
                if (update.playerId === localPlayer.id) {
                    if (localBullets.has(bulletId)) {
                        validateAndReconcile(localBullets.get(bulletId), update);
                    }
                } else {
                    if (bullets.has(bulletId)) {
                        bullets.get(bulletId).updateTarget(update.x, update.y, update.angle);
                    } else {
                        bullets.set(
                            bulletId,
                            new InterpolatedEntity(bulletId, update.x, update.y, update.angle)
                        );
                    }
                }
                break
            case "bulletRemove":
                bullets.delete(update.id);
                localBullets.delete(update.id);
                break
            case "explosion":
                createExplosion(update.x, update.y);
                break
            default:
                console.error(`Unknown update type: ${update}`);
                break;
        }
    }
}

function validateAndReconcile(entity, serverUpdate) {
    const serverSequenceNumber = serverUpdate.sequenceNumber;
    const localMove = entity.getMoveFromSequenceNumber(serverSequenceNumber);

    if (localMove) {
        if (
            localMove.x !== serverUpdate.x ||
            localMove.y !== serverUpdate.y ||
            localMove.speedX !== serverUpdate.speedX ||
            localMove.speedY !== serverUpdate.speedY ||
            localMove.angle !== serverUpdate.angle
        ) {
            console.log(
                "Starting reconciliation from sequence number:",
                serverSequenceNumber
            );
            entity.x = serverUpdate.x;
            entity.y = serverUpdate.y;
            entity.speedX = serverUpdate.speedX;
            entity.speedY = serverUpdate.speedY;
            entity.angle = serverUpdate.angle;
            isReconciling = true;

            const movesToReapply =
                entity.getAndDeleteUnacknowledgedMoves(serverSequenceNumber);

            movesToReapply.forEach((move) => {
                if (entity === localPlayer) {
                    movePlayer(entity, move.direction);
                } else {
                    moveBullet(entity);
                }
            });

            isReconciling = false;
            console.log("Reconciliation complete");
        } else {
            entity.keepUnacknowledgedMoves(serverSequenceNumber);
        }
    } else {
        entity.x = serverUpdate.x;
        entity.y = serverUpdate.y;
        entity.speedX = serverUpdate.speedX;
        entity.speedY = serverUpdate.speedY;
        entity.keepUnacknowledgedMoves(serverSequenceNumber);
    }
}

function createExplosion(x, y) {
    const hue = Math.floor(Math.random() * 360);
    const explosion = {
        x: x,
        y: y,
        frame: 0,
        maxFrames: 30,
        radius: 10,
        maxRadius: 100,
        hue: hue, // Store the hue value
    };
    explosions.set(`${x}-${y}-${Date.now()}`, explosion);
}

function checkBulletCollisions(bullet) {
    for (const player of players.values()) {
        if (player.id !== bullet.playerId) {
            const dx = player.x - bullet.x;
            const dy = player.y - bullet.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < (playerSize + bulletSize) / 2) {
                return player;
            }
        }
    }
    return null;
}

function draw() {

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (localPlayer) {
        // Draw local player
        ctx.save()

        ctx.translate(
            (localPlayer.x * (canvas.width / mapSize)) - ((playerSize * (canvas.width / mapSize)) / 2),
            (localPlayer.y * (canvas.width / mapSize)) - ((playerSize * (canvas.width / mapSize)) / 2)
        )

        ctx.rotate(localPlayer.angle)

        ctx.fillStyle = "red";
        ctx.fillRect(
            -(playerSize * (canvas.width / mapSize)) / 2,
            -(playerSize * (canvas.width / mapSize)) / 2,
            playerSize * (canvas.width / mapSize),
            playerSize * (canvas.width / mapSize),
        );


        ctx.restore()

        // Draw local bullets
        localBullets.forEach((entity) => {
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.beginPath()
            ctx.arc(
                (entity.x * (canvas.width / mapSize)),
                (entity.y * (canvas.width / mapSize)),
                bulletSize * (canvas.width / mapSize),
                0,
                Math.PI * 2,
            )
            ctx.fill();
        });
    }

    // ! // Draw other players
    // players.forEach((player) => {
    //     ctx.fillStyle = "blue";
    //     ctx.fillRect(
    //         ((player.x - playerSize / 2) / mapSize) * canvas.width,
    //         ((player.y - playerSize / 2) / mapSize) * canvas.height,
    //         (playerSize / mapSize) * canvas.width,
    //         (playerSize / mapSize) * canvas.height
    //     );
    // });

    // Draw explosions
    explosions.forEach((explosion, key) => {
        const progress = explosion.frame / explosion.maxFrames;
        const radius =
            explosion.radius + (explosion.maxRadius - explosion.radius) * progress;
        const alpha = 1 - progress;

        ctx.beginPath();
        ctx.arc(
            (explosion.x / mapSize) * canvas.width,
            (explosion.y / mapSize) * canvas.height,
            (radius / mapSize) * canvas.width,
            0,
            2 * Math.PI
        );

        // Create gradient
        const gradient = ctx.createRadialGradient(
            (explosion.x / mapSize) * canvas.width,
            (explosion.y / mapSize) * canvas.height,
            0,
            (explosion.x / mapSize) * canvas.width,
            (explosion.y / mapSize) * canvas.height,
            (radius / mapSize) * canvas.width
        );

        gradient.addColorStop(0, `hsla(${explosion.hue}, 100%, 50%, 1)`);
        gradient.addColorStop(0.8, `hsla(${explosion.hue}, 100%, 50%, 0.5)`);
        gradient.addColorStop(1, `hsla(${explosion.hue}, 100%, 50%, 0)`);

        ctx.fillStyle = gradient;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;

        explosion.frame++;
        if (explosion.frame >= explosion.maxFrames) {
            explosions.delete(key);
        }
    });
}

function gameLoop() {
    if (localPlayer) {
        processInput();

        localBullets.forEach((entity, id) => {
            moveBullet(entity);
            const hitPlayer = checkBulletCollisions(entity);
            if (hitPlayer) {
                localBullets.delete(id);
            }
        });
    }

    players.forEach((player) => player.interpolate(0.5));
    bullets.forEach((bullet) => bullet.interpolate(0.5));

    processUpdateQueue();
    draw();
}

let gameLoopStarted = false;

window.addEventListener("keydown", (e) => {
    keyState[e.key] = true;
});

window.addEventListener("keyup", (e) => {
    keyState[e.key] = false;
});

ws.onopen = () => {
    console.log("Connected to server");
};

let lastServerUpdateTimestamp;

ws.onmessage = (message) => {
    const data = JSON.parse(message.data);

    switch (data.type) {
        case "fullSnapshot":
            localPlayer = new PredictedEntity(
                data.player.id,
                data.player.x,
                data.player.y,
                5,
                data.player.angle,
            );
            players.clear();
            data.players.forEach((player) => {
                if (player.id !== localPlayer.id) {
                    players.set(
                        player.id,
                        new InterpolatedEntity(
                            player.id,
                            player.x,
                            player.y,
                            player.angle
                        )
                    );
                }
            });
            bullets.clear();
            data.bullets.forEach((bullet) => {
                bullets.set(
                    bullet.id,
                    new InterpolatedEntity(
                        bullet.id,
                        bullet.x,
                        bullet.y,
                        0,
                    )
                );
            });
            if (!gameLoopStarted) {
                gameLoopStarted = true;
                runAtDefinedFPS(gameLoop, 60);
            }
            break;
        case "update":
            const now = performance.now();

            if (lastServerUpdateTimestamp) {
                const delta = Math.round(now - lastServerUpdateTimestamp);
                console.log(`last server update delta: ${delta}ms`);
            }

            lastServerUpdateTimestamp = now;

            data.updates.forEach((update) => {
                updateQueue.push(update);
            });
            break;
        case "pong":
            const delta = Math.round(performance.now() - data.id);
            console.log(`ping: ${delta}ms`);
            break;
    }
};

ws.onclose = () => {
    players.clear();
    bullets.clear();
    localBullets.clear();
    explosions.clear();
    gameLoopStarted = false;
};

setInterval(() => {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ action: "ping", id: performance.now() }));
    }
}, 1000);

// https://jsfiddle.net/chicagogrooves/nRpVD/2/
function runAtDefinedFPS(callback, fps) {
    let stop = false;
    let startTime, now, then, elapsed;
    const fpsInterval = 1000 / fps;

    startAnimating();

    function startAnimating() {
        then = window.performance.now();
        startTime = then;
        animate();
    }

    function animate(newtime) {
        // stop
        if (stop) {
            return;
        }

        // request another frame
        requestAnimationFrame(animate);

        // calc elapsed time since last loop
        now = newtime;
        elapsed = now - then;

        // if enough time has elapsed, draw the next frame
        if (elapsed > fpsInterval) {
            // Get ready for next frame by setting then=now, but...
            // Also, adjust for fpsInterval not being multiple of 16.67
            then = now - (elapsed % fpsInterval);
            // draw stuff here
            stop = callback();
        }
    }
}
