const ws = new WebSocket('ws://localhost:3000');
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const size = 50;

// Local player's ID
let localPlayer = null;

// To track all players
const players = new Map();

// Queue for updates from the server
const updateQueue = [];

// Track the state of keys
const keyState = {};

let userMoves = [];
let globalMoveNumber = 0;
let isReconciling = false;

// Copy of the server's movePlayer function
function movePlayer(player, direction) {
    const speed = 5;
    const mapSize = 1000;

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

// Function to draw players on the canvas
function draw(players) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    players.forEach((player) => {
        ctx.fillStyle = player.id === localPlayer.id ? "red" : "blue";
        ctx.fillRect(
            (player.x / 1000) * canvas.width,
            (player.y / 1000) * canvas.height,
            (size / 1000) * canvas.width,
            (size / 1000) * canvas.height
        );
    });
}

// Function to process input and send commands to the server
function processInput() {
    if (isReconciling) return;

    const directions = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    directions.forEach((key) => {
        if (keyState[key]) {
            const direction = key.toLowerCase().replace("arrow", "");
            movePlayer(localPlayer, direction);
            globalMoveNumber++;
            userMoves.push({
                direction,
                moveNumber: globalMoveNumber,
                x: localPlayer.x,
                y: localPlayer.y,
            });
            ws.send(
                JSON.stringify({
                    action: "move",
                    direction,
                    moveNumber: globalMoveNumber,
                })
            );
        }
    });
}

// Function to process the update queue and render updates
function processUpdateQueue() {
    while (updateQueue.length > 0) {
        const update = updateQueue.shift();
        if (update.id === localPlayer.id) {
            validateAndReconcile(update);
        } else if (players.has(update.id)) {
            players.get(update.id).x = update.x;
            players.get(update.id).y = update.y;
        } else {
            players.set(update.id, update);
        }
    }
    draw(players);
}

function validateAndReconcile(serverUpdate) {
    const serverMoveNumber = serverUpdate.moveNumber;
    const localMove = userMoves.find(
        (move) => move.moveNumber === serverMoveNumber
    );

    if (localMove) {
        if (localMove.x !== serverUpdate.x || localMove.y !== serverUpdate.y) {
            // Mismatch detected, start reconciliation
            console.log(
                "Starting reconciliation from move number:",
                serverMoveNumber
            );
            localPlayer.x = serverUpdate.x;
            localPlayer.y = serverUpdate.y;
            isReconciling = true;

            // Get moves to reapply
            const movesToReapply = userMoves.filter(
                (move) => move.moveNumber > serverMoveNumber
            );

            // Clear userMoves and add the server-confirmed move
            userMoves = [
                {
                    direction: localMove.direction,
                    moveNumber: serverMoveNumber,
                    x: serverUpdate.x,
                    y: serverUpdate.y,
                },
            ];

            // Reapply moves and update userMoves
            movesToReapply.forEach((move) => {
                movePlayer(localPlayer, move.direction);
                userMoves.push({
                    direction: move.direction,
                    moveNumber: move.moveNumber,
                    x: localPlayer.x,
                    y: localPlayer.y,
                });
            });

            isReconciling = false;
            console.log("Reconciliation complete");
        } else {
            // Remove processed moves up to and including the server-confirmed move
            userMoves = userMoves.filter(
                (move) => move.moveNumber > serverMoveNumber
            );
        }
    } else {
        // If we don't have the move, just update the player position
        localPlayer.x = serverUpdate.x;
        localPlayer.y = serverUpdate.y;
        // Clear all moves up to this point as they are now irrelevant
        userMoves = userMoves.filter((move) => move.moveNumber > serverMoveNumber);
    }
}

// Game loop function
function gameLoop() {
    processInput(); // Process input in the game loop
    processUpdateQueue(); // Process server updates and render players
    requestAnimationFrame(gameLoop);
}

// Handle keyboard input registration
window.addEventListener("keydown", (e) => {
    keyState[e.key] = true;
});

window.addEventListener("keyup", (e) => {
    keyState[e.key] = false;
});

ws.onopen = () => {
    console.log("Connected to server");
    gameLoop(); // Start the game loop once connection is open
};

ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.type === "spawn") {
        localPlayer = data.player;
        players.set(localPlayer.id, localPlayer);
    } else if (data.type === "update") {
        data.players.forEach((update) => {
            updateQueue.push(update); // Queue updates from the server
        });
    }
};