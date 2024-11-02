const ws = new WebSocket(wsUrl)
const canvas = document.getElementById('gameCanvas');

// wsUrl, currentPlayer, screen, initialState
class TankGame {
    constructor(wsUrl, currentPlayer, screen, initialState) {
        this.ws = new WebSocket(wsUrl);
        this.ctx = screen.getContext('2d');
        this.commandQueue = [];
        this.fps = 60;
        this.frameInterval = 1000 / this.fps;
        this.room = null
        this.player = {
            id: currentPlayer.id,
            name: currentPlayer.name,
            x: 0,
            y: 0,
            direction: 0
        };
        this.keyState = {
            ArrowLeft: false,
            ArrowRight: false,
            ArrowUp: false,
            ArrowDown: false,
            ' ': false
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
                player: this.player,
            }))
        };
        this.ws.onmessage = (event) => {
            const response = JSON.parse(event.data);
            if (!response) {
                console.error('Invalid game state received:', event.data);
                return;
            }
            if (response.type === "gameState") {
                this.updateGameState(response);
            }
            if (response.type === "playerConnected") {
                console.log(`${response.player.name} connected`);
            }
            if (response.type === "playerDisconnected") {
                console.log(`${response.player.name} disconnected`);
            }
            if (response.type === "roomCreated") {
                this.room = response.room.id
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
        document.addEventListener('keydown', (event) => {
            if (this.keyState.hasOwnProperty(event.key)) {
                this.keyState[event.key] = true;
            }
        });
        document.addEventListener('keyup', (event) => {
            if (this.keyState.hasOwnProperty(event.key)) {
                this.keyState[event.key] = false;
            }
        });
    }
    checkInputs() {
        if (this.keyState.ArrowLeft) {
            this.queueCommand({
                type: 'movePlayer',
                direction: 'left'
            });
        }
        if (this.keyState.ArrowRight) {
            this.queueCommand({
                type: 'movePlayer',
                direction: 'right'
            });
        }
        if (this.keyState.ArrowUp) {
            this.queueCommand({
                type: 'movePlayer',
                direction: 'up'
            });
        }
        if (this.keyState.ArrowDown) {
            this.queueCommand({
                type: 'movePlayer',
                direction: 'down'
            });
        }
        if (this.keyState[' ']) {
            this.queueCommand({
                type: 'shoot',
                x: this.player.x,
                y: this.player.y,
                direction: this.player.direction
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
        }
    }
    sendCommandToServer(command) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(command));
        }
    }
    updateGameState(gameState) {
        console.log('Received game state:', gameState);
    }
    gameLoop(currentTime) {
        window.requestAnimationFrame((time) => this.gameLoop(time));
        if (currentTime - this.lastFrameTime < this.frameInterval) {
            return;
        }
        this.checkInputs();
        this.processCommandQueue();
        this.update();
        this.render();
        this.lastFrameTime = currentTime;
    }
    update() {
    }
    render() {
        console.log('Render frame - Player position:', this.player.x, this.player.y);
    }
    startGameLoop() {
        window.requestAnimationFrame((time) => this.gameLoop(time));
    }
}
const game = new TankGame(wsUrl);

/* const keys = {};  // Para capturar as teclas pressionadas.

// // Registrar teclas
// window.addEventListener('keydown', (e) => keys[e.key] = true);
// window.addEventListener('keyup', (e) => keys[e.key] = false);

// class Tank {
//     constructor(x, y, color, angle, controls) {
//         this.x = x;
//         this.y = y;
//         this.width = 40; // Largura do tanque base
//         this.height = 20; // Altura do tanque base
//         this.color = color;
//         this.angle = angle;
//         this.speed = 2;
//         this.controls = controls;
//         this.turretLength = 20; // Comprimento da torre
//         this.turretWidth = 5; // Largura da torre
//         this.lastShotTime = 0; // Tempo do último disparo

//         // Margem adicional para colisão
//         this.collisionWidth = this.width * 1.7; // Largura considerando as novas partes
//         this.collisionHeight = this.height * 2.5; // Altura considerando novas partes
//     }

//     draw() {
//         ctx.save();
//         ctx.translate(this.x, this.y);
//         ctx.rotate(this.angle);

//         // Corpo do tanque
//         ctx.fillStyle = this.color;
//         ctx.fillRect(-this.width / 2, -this.height / 2, this.width * 1.5 / 2, this.height);

//         // Novas partes ao corpo do tanque
//         ctx.fillRect(-this.width, -this.height * 1.5, this.width * 1.7, this.height);
//         ctx.fillRect(-this.width, -this.height + 30, this.width * 1.7, this.height);

//         // Torre do tanque
//         ctx.fillRect(0, -this.turretWidth / 2, this.turretLength, this.turretWidth);

//         ctx.restore();
//     }

//     update() {
//         // Movimenta o tanque com base nos controles
//         if (keys[this.controls.forward]) {
//             this.x += Math.cos(this.angle) * this.speed;
//             this.y += Math.sin(this.angle) * this.speed;
//         }
//         if (keys[this.controls.backward]) {
//             this.x -= Math.cos(this.angle) * this.speed;
//             this.y -= Math.sin(this.angle) * this.speed;
//         }

//         // Rotaciona o tanque com base nos controles
//         if (keys[this.controls.left]) this.angle -= 0.03;
//         if (keys[this.controls.right]) this.angle += 0.03;

//         // Ajustes de borda para incluir novas partes
//         if (this.x < this.collisionWidth / 2) this.x = this.collisionWidth / 2;
//         if (this.x > canvas.width - this.collisionWidth / 2) this.x = canvas.width - this.collisionWidth / 2;
//         if (this.y < this.collisionHeight / 2) this.y = this.collisionHeight / 2;
//         if (this.y > canvas.height - this.collisionHeight / 2) this.y = canvas.height - this.collisionHeight / 2;
//     }

//     canShoot() {
//         const currentTime = performance.now();
//         if (currentTime - this.lastShotTime >= 1000) { // 1 segundo de cooldown
//             this.lastShotTime = currentTime;
//             return true;
//         }
//         return false;
//     }
// }

// const controlsTank1 = { forward: 'w', backward: 's', left: 'a', right: 'd' };
// const controlsTank2 = { forward: 'ArrowUp', backward: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

// const tank1 = new Tank(100, canvas.height / 2, 'green', 0, controlsTank1);
// const tank2 = new Tank(canvas.width - 100, canvas.height / 2, 'blue', Math.PI, controlsTank2);

// class Bullet {
//     constructor(x, y, angle) {
//         this.x = x;
//         this.y = y;
//         this.sentidoX = 1;
//         this.sentidoY = 1;
//         this.angle = angle;
//         this.speed = 10;
//         this.radius = 3;
//         this.time = 10;
//         this.elapsedTime = 0;
//     }

//     draw() {
//         ctx.beginPath();
//         ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
//         ctx.fillStyle = 'white';
//         ctx.fill();
//     }

//     update(deltaTime, bullets) {
//         this.x += Math.cos(this.angle) * this.speed * this.sentidoX;
//         this.y += Math.sin(this.angle) * this.speed * this.sentidoY;

//         this.elapsedTime += deltaTime;

//         if (this.elapsedTime >= this.time) {
//             const index = bullets.indexOf(this);
//             if (index > -1) bullets.splice(index, 1);
//         }

//         if (this.x < this.radius) this.sentidoX *= -1;
//         if (this.x > canvas.width - this.radius) this.sentidoX *= -1;
//         if (this.y < this.radius) this.sentidoY *= -1;
//         if (this.y > canvas.height - this.radius) this.sentidoY *= -1;
//     }
// }

// let bullets = [];

// // Evento para disparar
// window.addEventListener('keydown', (e) => {
//     if (e.key === ' ' && tank1.canShoot()) {
//         bullets.push(
//             new Bullet(
//                 tank1.x + Math.cos(tank1.angle) * tank1.width / 2,
//                 tank1.y + Math.sin(tank1.angle) * tank1.width / 2,
//                 tank1.angle
//             )
//         );
//     } else if (e.key === 'Enter' && tank2.canShoot()) {
//         bullets.push(
//             new Bullet(
//                 tank2.x + Math.cos(tank2.angle) * tank2.width / 2,
//                 tank2.y + Math.sin(tank2.angle) * tank2.width / 2,
//                 tank2.angle
//             )
//         );
//     }
// });

// let lastTime = performance.now();

// function gameLoop() {
//     const now = performance.now();
//     const deltaTime = (now - lastTime) / 1000;
//     lastTime = now;

//     ctx.clearRect(0, 0, canvas.width, canvas.height);

//     tank1.update();
//     tank1.draw();

//     tank2.update();
//     tank2.draw();

//     bullets.forEach((bullet) => {
//         bullet.update(deltaTime, bullets);
//         bullet.draw();
//     });

//     requestAnimationFrame(gameLoop);
// }

// gameLoop(); */

// Código corrigido
let connected = false;
const gameCanvas = document.getElementById('gameCanvas');
let totalPlayersCount = '';

function enviarMensagem(message) {
    console.log(typeof message)
    // Verifique se a conexão está aberta antes de enviar
    if (connected) {
        let messageToSend

        if (typeof message === 'string') {
            messageToSend = JSON.stringify({ message: message })
        } else {
            messageToSend = JSON.stringify(message)
        }

        ws.send(messageToSend);
    } else {
        console.error('Erro: Conexão não está aberta. Não é possível enviar a mensagem.');
    }
}

function createPartida(ws) {
    return {
        encontrarPartida(dadosDoJogador) {
            const mensagem = {
                type: "enterNewMatch",
                ...dadosDoJogador
            };
            ws.send(JSON.stringify(mensagem));
            console.log("> Mensagem enviada para entrar em nova partida:", mensagem);
        },

        moverJogador(keyPressed) {
            const mensagem = {
                type: "movePlayer",
                ...keyPressed
            };
            ws.send(JSON.stringify(mensagem));
            console.log("> Mensagem enviada para mover jogador:", mensagem);
        }
    };
}


console.log(ws);
console.log('aqui')


ws.onopen = () => {
    connected = true;
    console.log('> Connected to server');

    const partida = createPartida(ws);

    document.addEventListener('keydown', (event) => {
        if (ws.readyState === WebSocket.OPEN && partida) {
            const keyPressed = {
                type: "movePlayer",
                matchId: "match1",
                userId: "1",
                key: event.key // Exemplo de captura de tecla pressionada
            };
            partida.moverJogador(keyPressed);
        }
    });
};

ws.onerror = (error) => {
    console.error('Erro na conexão WebSocket:', error);
};
ws.onmessage = (event) => {
    try {
        const gameInitialState = JSON.parse(event.data)
        console.log('> Received initial state:', gameInitialState.state)
    } catch (error) {
        console.error(error)
    }
};

ws.onclose = () => {
    connected = false;
    console.log('> Disconnected');
};