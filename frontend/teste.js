// const canvas = document.getElementById('gameCanvas');
// const ctx = canvas.getContext('2d');

// const keys = {};  // Para capturar as teclas pressionadas.
// let bullets = [];

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
//         if (keys[this.controls.left] && !keys[this.controls.backward]) {
//             this.angle -= 0.03
//         } else if (keys[this.controls.left] && keys[this.controls.backward]) {
//             this.angle += 0.03
//         };

//         if (keys[this.controls.right] && !keys[this.controls.backward]) {
//             this.angle += 0.03
//         } else if (keys[this.controls.right] && keys[this.controls.backward]) {
//             this.angle -= 0.03
//         };

//         // Dispara o tiro com base nos controles
//         if (keys[this.controls.shoot]) {
//             if (this.#canShoot()) {
//                 const bullet = new Bullet(
//                     this.x + Math.cos(this.angle) * this.width / 2,
//                     this.y + Math.sin(this.angle) * this.width / 2,
//                     this.angle
//                 );
//                 bullets.push(bullet);
//             }
//         };

//         // Ajustes de borda para incluir novas partes
//         if (this.x < this.collisionWidth / 2) this.x = this.collisionWidth / 2;
//         if (this.x > canvas.width - this.collisionWidth / 2) this.x = canvas.width - this.collisionWidth / 2;
//         if (this.y < this.collisionHeight / 2) this.y = this.collisionHeight / 2;
//         if (this.y > canvas.height - this.collisionHeight / 2) this.y = canvas.height - this.collisionHeight / 2;
//     }

//     #canShoot() {
//         const currentTime = performance.now();
//         if (currentTime - this.lastShotTime >= 1000) { // 1 segundo de cooldown
//             this.lastShotTime = currentTime;
//             return true;
//         }
//         return false;
//     }
// }
// class Bullet {
//     constructor(x, y, angle) {
//         this.x = x;
//         this.y = y;
//         this.sentidoX = 1;
//         this.sentidoY = 1;
//         this.angle = angle;
//         this.speed = 10;
//         this.radius = 3;
//         this.time = 1.5;
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

// const controlsTank1 = { forward: 'w', backward: 's', left: 'a', right: 'd', shoot: ' ' };
// const controlsTank2 = { forward: 'ArrowUp', backward: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Enter' };

// const tank1 = new Tank(100, canvas.height / 2, 'green', 0, controlsTank1);
// const tank2 = new Tank(canvas.width - 100, canvas.height / 2, 'blue', Math.PI, controlsTank2);


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

// gameLoop();

const ws = new WebSocket(window.origin);
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const size = 40;

let localPlayer = null;
const players = new Map();
const bullets = [];

const keyState = {};

window.addEventListener("keydown", (e) => keyState[e.key] = true);
window.addEventListener("keyup", (e) => keyState[e.key] = false);

function movePlayer(direction) {
    if (localPlayer) {
        ws.send(JSON.stringify({ action: "move", direction }));
    }
}

function shoot() {
    ws.send(JSON.stringify({ action: "shoot" }));
}

function gameLoop() {
    if (keyState['w']) movePlayer("up");
    if (keyState['s']) movePlayer("down");
    if (keyState['a']) movePlayer("left");
    if (keyState['d']) movePlayer("right");
    if (keyState[' ']) shoot();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const player of players.values()) {
        ctx.fillStyle = player.id === localPlayer.id ? "red" : "blue";
        ctx.fillRect(player.x, player.y, size, size);
    }

    for (const bullet of bullets) {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
    }

    requestAnimationFrame(gameLoop);
}

ws.onopen = () => {
    console.log("Connected to server");
    gameLoop();
};

ws.onmessage = (message) => {
    const data = JSON.parse(message.data);

    if (data.type === "spawn") {
        localPlayer = data.player;
        players.set(localPlayer.id, localPlayer);
    } else if (data.type === "update") {
        data.data.forEach((update) => {
            if (update.type === "bullet") {
                bullets.push(update);
            } else if (players.has(update.id)) {
                players.get(update.id).x = update.x;
                players.get(update.id).y = update.y;
            }
        });
    }
};
