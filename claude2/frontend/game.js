class TankInterpolator {
    constructor() {
        this.tankBuffers = new Map();
        this.interpolationDelay = 100; // 100ms interpolation delay
    }

    addState(tankId, state, timestamp) {
        if (!this.tankBuffers.has(tankId)) {
            this.tankBuffers.set(tankId, []);
        }
        const buffer = this.tankBuffers.get(tankId);
        buffer.push({ state, timestamp });

        // Keep only last second of states
        const bufferDuration = 1000;
        const cutoff = timestamp - bufferDuration;
        this.tankBuffers.set(
            tankId,
            buffer.filter(item => item.timestamp > cutoff)
        );
    }

    interpolate(tankId, renderTimestamp) {
        const buffer = this.tankBuffers.get(tankId);
        if (!buffer || buffer.length < 2) return null;

        const targetTime = renderTimestamp - this.interpolationDelay;

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

        const totalTime = afterState.timestamp - beforeState.timestamp;
        const currentTime = targetTime - beforeState.timestamp;
        const t = Math.max(0, Math.min(1, currentTime / totalTime));

        return {
            x: beforeState.state.x + (afterState.state.x - beforeState.state.x) * t,
            y: beforeState.state.y + (afterState.state.y - beforeState.state.y) * t,
            angle: this.interpolateAngle(beforeState.state.angle, afterState.state.angle, t),
            color: beforeState.state.color
        };
    }

    interpolateAngle(a1, a2, t) {
        const shortestAngle = ((((a2 - a1) % (Math.PI * 2)) + (Math.PI * 3)) % (Math.PI * 2)) - Math.PI;
        return a1 + shortestAngle * t;
    }
}

class TankPredictor {
    constructor() {
        this.pendingMoves = [];
    }

    predictMovement(tank, actions, moveNumber, speed = 5, rotationSpeed = 0.1) {
        const predictedState = {
            x: tank.x,
            y: tank.y,
            angle: tank.angle,
            color: tank.color
        };

        if (actions.forward) {
            predictedState.x += Math.cos(predictedState.angle) * speed;
            predictedState.y += Math.sin(predictedState.angle) * speed;
        }
        if (actions.backward) {
            predictedState.x -= Math.cos(predictedState.angle) * speed;
            predictedState.y -= Math.sin(predictedState.angle) * speed;
        }
        if (actions.left) {
            predictedState.angle -= rotationSpeed;
        }
        if (actions.right) {
            predictedState.angle += rotationSpeed;
        }

        // Keep tank within bounds
        predictedState.x = Math.max(0, Math.min(1000, predictedState.x));
        predictedState.y = Math.max(0, Math.min(600, predictedState.y));

        this.pendingMoves.push({
            actions,
            moveNumber,
            predictedState: { ...predictedState }
        });

        return predictedState;
    }
}

class TankGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameStatusElement = document.getElementById('gameStatus');
        this.roomInfoElement = document.getElementById('roomInfo');

        this.canvas.width = 1000;
        this.canvas.height = 600;

        this.gameState = {
            localTankId: null,
            isFirstTank: false,
            gameStarted: false,
            tanks: new Map(),
            bullets: new Map(),
            keys: {},
            moveNumber: 0,
        };

        // Adiciona propriedades para networking
        this.interpolator = new TankInterpolator();
        this.predictor = new TankPredictor();
        this.lastServerTimestamp = performance.now();
        this.serverTimeOffset = 0;
        this.lastUpdateTime = performance.now();

        this.ws = null;
        this.animationFrame = null;

        this.init();
    }

    init() {
        this.ws = new WebSocket('ws://localhost:3000');
        this.setupWebSocket();
        this.setupEventListeners();
        this.startGameLoop();
    }

    setupWebSocket() {
        this.ws.onopen = () => {
            console.log('Conectado ao servidor');
            this.updateGameStatus('Conectado! Aguardando outro jogador...');
        };

        this.ws.onmessage = (message) => {
            const data = JSON.parse(message.data);
            this.handleMessage(data);
        };

        this.ws.onclose = () => {
            console.log('Desconectado do servidor');
            this.updateGameStatus('Desconectado do servidor. Recarregue a página para reconectar.');
            this.gameState.gameStarted = false;
        };
    }

    handleMessage(data) {
        const serverTimestamp = performance.now();

        switch (data.type) {
            case 'spawn':
                this.gameState.localTankId = data.tank.id;
                this.gameState.isFirstTank = data.isFirstTank;
                this.gameState.tanks.set(data.tank.id, data.tank);
                this.updateGameStatus(
                    data.isFirstTank
                        ? 'Você é o tanque verde. Aguardando segundo jogador...'
                        : 'Você é o tanque azul. Preparando para iniciar...'
                );
                this.updateRoomInfo(data.roomId);
                break;

            case 'gameStart':
                this.gameState.gameStarted = true;
                this.updateGameStatus('Partida iniciada! Boa sorte!');
                break;

            case 'update':
                // Atualiza timestamp do servidor e calcula offset
                this.lastServerTimestamp = serverTimestamp;
                this.serverTimeOffset = data.timestamp ? data.timestamp - serverTimestamp : 0;

                // Armazena estado para interpolação
                data.gameState.tanks.forEach(serverTank => {
                    if (serverTank.id !== this.gameState.localTankId) {
                        this.interpolator.addState(serverTank.id, serverTank, serverTimestamp);
                    }
                });

                // Reconcilia posição do tanque local
                if (this.gameState.localTankId) {
                    this.reconcileState(data.gameState);
                }

                // Atualiza projéteis diretamente do servidor
                this.gameState.bullets.clear();
                data.gameState.bullets.forEach(bullet => {
                    this.gameState.bullets.set(bullet.id, bullet);
                });
                break;

            case 'newBullet':
                this.gameState.bullets.set(data.bullet.id, data.bullet);
                break;

            case 'playerLeft':
                this.gameState.tanks.delete(data.tankId);
                this.updateGameStatus('O outro jogador saiu. Aguardando novo jogador...');
                break;
        }
    }

    reconcileState(serverState) {
        const serverTank = serverState.tanks.find(t => t.id === this.gameState.localTankId);
        if (!serverTank) return;

        const lastProcessedMove = serverState.lastProcessedMove;
        this.predictor.pendingMoves = this.predictor.pendingMoves.filter(
            move => move.moveNumber > lastProcessedMove
        );

        const localTank = this.gameState.tanks.get(this.gameState.localTankId);
        Object.assign(localTank, serverTank);

        this.predictor.pendingMoves.forEach(move => {
            this.applyMove(localTank, move.actions);
        });
    }

    applyMove(tank, actions) {
        const speed = 5;
        const rotationSpeed = 0.1;

        if (actions.forward) {
            tank.x += Math.cos(tank.angle) * speed;
            tank.y += Math.sin(tank.angle) * speed;
        }
        if (actions.backward) {
            tank.x -= Math.cos(tank.angle) * speed;
            tank.y -= Math.sin(tank.angle) * speed;
        }
        if (actions.left) {
            tank.angle -= rotationSpeed;
        }
        if (actions.right) {
            tank.angle += rotationSpeed;
        }

        tank.x = Math.max(0, Math.min(this.canvas.width, tank.x));
        tank.y = Math.max(0, Math.min(this.canvas.height, tank.y));
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.gameState.keys[e.key] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.gameState.keys[e.key] = false;
        });
    }

    processInputs() {
        if (!this.gameState.localTankId || !this.gameState.gameStarted) return;

        const controls = this.gameState.isFirstTank
            ? { forward: 'w', backward: 's', left: 'a', right: 'd', shoot: ' ' }
            : {
                forward: 'ArrowUp',
                backward: 'ArrowDown',
                left: 'ArrowLeft',
                right: 'ArrowRight',
                shoot: 'Enter'
            };

        const actions = {
            forward: this.gameState.keys[controls.forward] || false,
            backward: this.gameState.keys[controls.backward] || false,
            left: this.gameState.keys[controls.left] || false,
            right: this.gameState.keys[controls.right] || false
        };

        if (Object.values(actions).some(value => value)) {
            const moveNumber = ++this.gameState.moveNumber;
            const localTank = this.gameState.tanks.get(this.gameState.localTankId);

            // Predição de movimento
            const predictedState = this.predictor.predictMovement(
                localTank,
                actions,
                moveNumber
            );

            // Aplica predição
            Object.assign(localTank, predictedState);

            // Envia para o servidor
            this.ws.send(JSON.stringify({
                type: 'move',
                actions,
                moveNumber
            }));
        }

        if (this.gameState.keys[controls.shoot]) {
            this.ws.send(JSON.stringify({ type: 'shoot' }));
            this.gameState.keys[controls.shoot] = false;
        }
    }

    gameLoop = (currentTime) => {
        const deltaTime = currentTime - this.lastUpdateTime;

        if (deltaTime >= (1000 / 60)) {
            this.processInputs();
            this.render();
            this.lastUpdateTime = currentTime;
        }

        requestAnimationFrame(this.gameLoop);
    }

    startGameLoop() {
        this.lastUpdateTime = performance.now();
        requestAnimationFrame(this.gameLoop);
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Renderiza cada tanque
        this.gameState.tanks.forEach(tank => {
            if (tank.id === this.gameState.localTankId) {
                // Renderiza tanque local diretamente
                this.drawTank(tank);
            } else {
                // Interpola outros tanques
                const interpolatedState = this.interpolator.interpolate(
                    tank.id,
                    performance.now()
                );
                if (interpolatedState) {
                    this.drawTank(interpolatedState);
                }
            }
        });

        // Renderiza projéteis
        this.gameState.bullets.forEach(bullet => this.drawBullet(bullet));
    }

    drawTank(tank) {
        this.ctx.save();
        this.ctx.translate(tank.x, tank.y);
        this.ctx.rotate(tank.angle);

        this.ctx.fillStyle = tank.color;
        this.ctx.fillRect(-20, -10, 30, 20);
        this.ctx.fillRect(-40, -30, 68, 20);
        this.ctx.fillRect(-40, 10, 68, 20);
        this.ctx.fillRect(0, -2.5, 20, 5);

        this.ctx.restore();
    }

    drawBullet(bullet) {
        this.ctx.beginPath();
        this.ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
        this.ctx.fillStyle = 'white';
        this.ctx.fill();
    }

    updateGameStatus(status) {
        this.gameStatusElement.textContent = status;
    }

    updateRoomInfo(roomId) {
        if (roomId) {
            this.roomInfoElement.textContent = `Sala: ${roomId}`;
        } else {
            this.roomInfoElement.textContent = '';
        }
    }
}

window.addEventListener('load', () => {
    new TankGame();
});