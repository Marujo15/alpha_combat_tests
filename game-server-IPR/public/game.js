const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const ws = new WebSocket(`ws://${window.location.host}`);
let playerId = null;
let players = new Map();
let currentInput = { up: false, down: false, left: false, right: false };
let inputSequence = 0;
let lastFrameTime = 0;
const PLAYER_SPEED = 300; // Pixels per second

class Interpolator {
    constructor() {
        this.playerBuffers = new Map(); // Separate buffer for each player
        this.interpolationDelay = 100; // 100ms interpolation delay
    }

    addState(playerId, state, timestamp) {
        if (!this.playerBuffers.has(playerId)) {
            this.playerBuffers.set(playerId, []);
        }
        const buffer = this.playerBuffers.get(playerId);
        buffer.push({ state, timestamp });

        // Keep only last second of states
        const bufferDuration = 1000;
        const cutoff = timestamp - bufferDuration;
        this.playerBuffers.set(
            playerId,
            buffer.filter(item => item.timestamp > cutoff)
        );
    }

    interpolate(playerId, renderTimestamp) {
        const buffer = this.playerBuffers.get(playerId);
        if (!buffer || buffer.length < 2) return null;

        // Target time is current time minus interpolation delay
        const targetTime = renderTimestamp - this.interpolationDelay;

        // Find the two states to interpolate between
        let beforeState = null;
        let afterState = null;

        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i].timestamp > targetTime) {
                afterState = buffer[i];
                beforeState = buffer[i - 1];
                break;
            }
        }

        if (!beforeState || !afterState) {
            return buffer[buffer.length - 1]?.state;
        }

        // Calculate interpolation factor
        const totalTime = afterState.timestamp - beforeState.timestamp;
        const currentTime = targetTime - beforeState.timestamp;
        const t = Math.max(0, Math.min(1, currentTime / totalTime));

        // Linear interpolation between states
        return {
            x: beforeState.state.x + (afterState.state.x - beforeState.state.x) * t,
            y: beforeState.state.y + (afterState.state.y - beforeState.state.y) * t,
            color: beforeState.state.color
        };
    }
}

class Predictor {
    constructor() {
        this.pendingInputs = [];
    }

    predictMovement(player, input, sequence, deltaTime) {
        const predictedState = {
            x: player.x,
            y: player.y,
            color: player.color
        };

        // Apply input to get predicted state with delta time
        const moveAmount = PLAYER_SPEED * deltaTime;
        if (input.left) predictedState.x -= moveAmount;
        if (input.right) predictedState.x += moveAmount;
        if (input.up) predictedState.y -= moveAmount;
        if (input.down) predictedState.y += moveAmount;

        // Simple collision with canvas boundaries
        predictedState.x = Math.max(0, Math.min(800 - 50, predictedState.x));
        predictedState.y = Math.max(0, Math.min(600 - 50, predictedState.y));

        this.pendingInputs.push({
            input,
            sequence,
            predictedState: { ...predictedState },
            deltaTime
        });

        return predictedState;
    }
}

class Reconciler {
    constructor(predictor) {
        this.predictor = predictor;
    }

    reconcile(serverState, lastProcessedInputSequence) {
        // Remove processed inputs
        this.predictor.pendingInputs = this.predictor.pendingInputs.filter(
            input => input.sequence > lastProcessedInputSequence
        );

        // Re-apply remaining inputs
        let reconciledState = { ...serverState };

        this.predictor.pendingInputs.forEach(({ input, deltaTime }) => {
            const moveAmount = PLAYER_SPEED * deltaTime;
            if (input.left) reconciledState.x -= moveAmount;
            if (input.right) reconciledState.x += moveAmount;
            if (input.up) reconciledState.y -= moveAmount;
            if (input.down) reconciledState.y += moveAmount;

            // Simple collision with canvas boundaries
            reconciledState.x = Math.max(0, Math.min(800 - 50, reconciledState.x));
            reconciledState.y = Math.max(0, Math.min(600 - 50, reconciledState.y));
        });

        return reconciledState;
    }
}

// Initialize netcode components
const predictor = new Predictor();
const reconciler = new Reconciler(predictor);
const interpolator = new Interpolator();

ws.onopen = () => {

}

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
        case 'init':
            playerId = data.playerId;
            data.gameState.forEach(([id, state]) => {
                players.set(id, state);
            });
            break;

        case 'worldState':
            const timestamp = Date.now();

            // Handle own player with reconciliation
            const serverPlayer = data.worldState.find(([id]) => id === playerId)?.[1];
            if (serverPlayer) {
                const lastProcessedInput = data.lastProcessedInputs.find(([id]) => id === playerId)?.[1];
                const reconciledState = reconciler.reconcile(serverPlayer, lastProcessedInput);
                players.set(playerId, reconciledState);
            }

            // Handle other players with interpolation
            data.worldState.forEach(([id, state]) => {
                if (id !== playerId) {
                    interpolator.addState(id, state, timestamp);
                }
            });
            break;
    }
};

// Input handling
const keys = {
    'w': 'up',
    's': 'down',
    'a': 'left',
    'd': 'right'
};

window.addEventListener('keydown', (e) => {
    if (keys[e.key]) {
        currentInput[keys[e.key]] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys[e.key]) {
        currentInput[keys[e.key]] = false;
    }
});

// Game loop
function gameLoop(timestamp) {
    // Calculate delta time in seconds
    const deltaTime = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Send input to server and predict own movement
    if (playerId && players.has(playerId)) {
        const player = players.get(playerId);
        inputSequence++;

        // Send input to server
        ws.send(JSON.stringify({
            type: 'input',
            input: currentInput,
            sequence: inputSequence,
            deltaTime
        }));

        // Predict movement
        const predictedState = predictor.predictMovement(player, currentInput, inputSequence, deltaTime);
        players.set(playerId, predictedState);
    }

    // Render all players
    const renderTimestamp = Date.now();

    players.forEach((player, id) => {
        if (id === playerId) {
            // Render own player
            ctx.fillStyle = player.color;
            ctx.fillRect(player.x, player.y, 50, 50);
        } else {
            // Render other players with interpolation
            const interpolatedState = interpolator.interpolate(id, renderTimestamp);
            if (interpolatedState) {
                ctx.fillStyle = interpolatedState.color;
                ctx.fillRect(interpolatedState.x, interpolatedState.y, 50, 50);
            }
        }
    });

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);