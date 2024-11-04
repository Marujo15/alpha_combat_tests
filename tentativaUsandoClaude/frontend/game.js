const ws = new WebSocket('ws://localhost:3000');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1000;
canvas.height = 600;

const keys = {};
let localTankId = null;
let isFirstTank = false;
const tanks = new Map();
const bullets = new Map();

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    sendInputUpdate();
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    sendInputUpdate();
});

function sendInputUpdate() {
    if (!localTankId) return;

    const controls = isFirstTank ?
        { forward: 'w', backward: 's', left: 'a', right: 'd', shoot: ' ' } :
        { forward: 'ArrowUp', backward: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Enter' };

    const actions = {
        forward: keys[controls.forward] || false,
        backward: keys[controls.backward] || false,
        left: keys[controls.left] || false,
        right: keys[controls.right] || false
    };

    ws.send(JSON.stringify({
        type: "move",
        actions
    }));

    if (keys[controls.shoot]) {
        ws.send(JSON.stringify({
            type: "shoot"
        }));
        keys[controls.shoot] = false; // Prevent continuous shooting
    }
}

function drawTank(tank) {
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle);

    // Corpo do tanque
    ctx.fillStyle = tank.color;
    ctx.fillRect(-20, -10, 30, 20);
    ctx.fillRect(-40, -30, 68, 20);
    ctx.fillRect(-40, 10, 68, 20);

    // Torre do tanque
    ctx.fillRect(0, -2.5, 20, 5);

    ctx.restore();
}

function drawBullet(bullet) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Desenha todos os tanques
    tanks.forEach(tank => drawTank(tank));

    // Desenha todas as balas
    bullets.forEach(bullet => drawBullet(bullet));

    requestAnimationFrame(render);
}

ws.onopen = () => {
    console.log("Conectado ao servidor");
    render();
};

ws.onmessage = (message) => {
    const data = JSON.parse(message.data);

    switch (data.type) {
        case "spawn":
            localTankId = data.tank.id;
            isFirstTank = data.isFirstTank;
            tanks.set(data.tank.id, data.tank);
            break;

        case "update":
            // Atualiza posições dos tanques
            data.gameState.tanks.forEach(tank => {
                tanks.set(tank.id, tank);
            });

            // Atualiza balas
            bullets.clear();
            data.gameState.bullets.forEach(bullet => {
                bullets.set(bullet.id, bullet);
            });
            break;

        case "newBullet":
            bullets.set(data.bullet.id, data.bullet);
            break;

        case "playerLeft":
            tanks.delete(data.tankId);
            break;
    }
};

ws.onclose = () => {
    console.log("Desconectado do servidor");
};