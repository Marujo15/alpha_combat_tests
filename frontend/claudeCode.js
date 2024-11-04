const wsUrl = 'ws://localhost:3000'
const canvas = document.getElementById('gameCanvas');
const randomNumber = Math.floor(Math.random() * 100)
const player = {
    id: `player-${randomNumber}`,
    name: `Player ${randomNumber}`,
}

const ws = new WebSocket(wsUrl);

console.log(player)

class Tank {
    constructor(x, y, color, angle, playerId) {
        this.playerId = playerId;
        this.x = x;
        this.y = y;
        this.width = 40; // Largura do tanque base
        this.height = 20; // Altura do tanque base
        this.color = color;
        this.angle = angle;
        this.speed = 2;
        this.controls = {
            forward: 'ArrowUp',
            backward: 'ArrowDown',
            left: 'ArrowLeft',
            right: 'ArrowRight',
            shoot: ' ' // Tecla espaço
        };
        this.turretLength = 20; // Comprimento da torre
        this.turretWidth = 5; // Largura da torre
        this.lastShotTime = 0; // Tempo do último disparo

        // Margem adicional para colisão
        this.collisionWidth = this.width * 1.7; // Largura considerando as novas partes
        this.collisionHeight = this.height * 2.5; // Altura considerando novas partes
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Corpo do tanque
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width * 1.5 / 2, this.height);

        // Novas partes ao corpo do tanque
        ctx.fillRect(-this.width, -this.height * 1.5, this.width * 1.7, this.height);
        ctx.fillRect(-this.width, -this.height + 30, this.width * 1.7, this.height);

        // Torre do tanque
        ctx.fillRect(0, -this.turretWidth / 2, this.turretLength, this.turretWidth);

        ctx.restore();
    }

    shoot() {
        const canTankShoots = canShoot()
        if (canTankShoots) {
            const bullet = new Bullet(this.x, this.y, this.angle)
            return bullet
        }
    }

    #canShoot() {
        const currentTime = performance.now();
        if (currentTime - this.lastShotTime >= 1000) { // 1 segundo de cooldown
            this.lastShotTime = currentTime;
            return true;
        }
        return false;
    }
}

class Bullet {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.xDirection = 1;
        this.yDirection = 1;
        this.angle = angle;
        this.speed = 10;
        this.radius = 3;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
    }
}

class AlphaCombat {
    constructor(ws, screen) {
        this.ws = ws
        this.commandQueue = [];
        this.fps = 60;
        this.frameInterval = 1000 / this.fps;
        this.room = null

        this.gameState = {
            players: [],
            projectiles: [],
            enemyProjectiles: [],
        }

        // Track pressed keys
        this.keyState = {
            ArrowLeft: false,
            ArrowRight: false,
            ArrowUp: false,
            ArrowDown: false,
            ' ': false  // spacebar
        };

        this.setupWebSocket();
        this.setupEventListeners();
        this.startGameLoop();
    }

    setupWebSocket() {
        this.ws.onopen = () => {
            console.log('Connected to server');
            this.ws.send(JSON.stringify({
                type: 'connectPlayer',
                player: this.currentPlayer,
            }))
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (!data) {
                console.error('Invalid game state received:', event.data);
                return;
            }

            if (data.type === "gameState") {
                this.updateGameState(data);
            }

            if (data.type === "playerConnected") {
                console.log(`${data.player.name} connected`);
            }

            if (data.type === "playerDisconnected") {
                console.log(`${data.player.name} disconnected`);
            }

            if (data.type === "roomCreated") {
                this.room = data.room.id
            }
            if (data.type === "validate") {
                console.log(`${data.message}`)
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.log('Disconnected from server');
        };
    }

    setupEventListeners() {
        // Track key presses
        document.addEventListener('keydown', (event) => {
            if (this.keyState.hasOwnProperty(event.key)) {
                this.keyState[event.key] = true;
            }
        });

        // Track key releases
        document.addEventListener('keyup', (event) => {
            if (this.keyState.hasOwnProperty(event.key)) {
                this.keyState[event.key] = false;
            }
        });
    }

    checkInputs() {
        // Check movement keys
        if (this.keyState.ArrowLeft) {
            this.queueCommand({
                type: 'movePlayer',
                player: this.currentPlayer,
                direction: 'left'
            });
        }
        if (this.keyState.ArrowRight) {
            this.queueCommand({
                type: 'movePlayer',
                player: this.currentPlayer,
                direction: 'right'
            });
        }
        if (this.keyState.ArrowUp) {
            this.queueCommand({
                type: 'movePlayer',
                player: this.currentPlayer,
                direction: 'up'
            });
        }
        if (this.keyState.ArrowDown) {
            this.queueCommand({
                type: 'movePlayer',
                player: this.currentPlayer,
                direction: 'down'
            });
        }

        // Check shooting
        if (this.keyState[' ']) {
            this.queueCommand({
                type: 'shoot',
                player: this.currentPlayer,
                x: this.currentPlayer.x,
                y: this.currentPlayer.y,
                direction: this.currentPlayer.direction
            });
        }
    }

    queueCommand(command) {
        this.commandQueue.push({
            ...command,
            timestamp: Date.now()
        });
    }

    processCommandQueue() {
        while (this.commandQueue.length > 0) {
            const command = this.commandQueue.shift();

            this.sendCommandToServer(command);
            this.executeCommand(command);
        }
    }

    executeCommand(command) {
        const MOVE_SPEED = 5;

        switch (command.type) {
            case 'move':
                switch (command.direction) {
                    case 'left':
                        this.player.x -= MOVE_SPEED;
                        this.player.direction = 'left';
                        break;
                    case 'right':
                        this.player.x += MOVE_SPEED;
                        this.player.direction = 'right';
                        break;
                    case 'up':
                        this.player.y -= MOVE_SPEED;
                        this.player.direction = 'up';
                        break;
                    case 'down':
                        this.player.y += MOVE_SPEED;
                        this.player.direction = 'down';
                        break;
                }
                break;

            case 'shoot':
                console.log('Bullet shot from:', command.x, command.y, 'in direction:', command.direction);
                break;
        }
    }

    sendCommandToServer(command) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(command));
        }
    }

    updateGameState(gameState) {
        console.log('Received game state:', gameState);

        this.gameState = gameState
    }

    gameLoop(currentTime) {
        window.requestAnimationFrame((time) => this.gameLoop(time));

        // Control frame rate
        if (currentTime - this.lastFrameTime < this.frameInterval) {
            return;
        }

        // Check for active inputs and create commands
        this.checkInputs();

        // Process any queued commands
        this.processCommandQueue();

        // Render game
        this.render();

        this.lastFrameTime = currentTime;
    }

    update() {
        // Update game logic here
        // This could include bullet movement, collision detection, etc.
    }

    render() {
        this.gameState.players.forEach(player => {
            const playerTank = new Tank(player.x, player.y, '#FF3344', player.direction)
        })
        console.log('Render frame - Player position:', this.currentPlayer.x, this.currentPlayer.y);
    }

    startGameLoop() {
        window.requestAnimationFrame((time) => this.gameLoop(time));
    }
}

// Usage example:
const game = new AlphaCombat(ws, player, screen);


