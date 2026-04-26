// Game Constants
const CANVAS = document.getElementById('gameCanvas');
const CTX = CANVAS.getContext('2d');

const GRAVITY = 0.3;
const GROUND_Y = 580;
const PLAYER_SPEED = 5;
const JUMP_FORCE = -12;
const BULLET_SPEED = 4;

// Game State
let gameState = {
    player: null,
    enemies: [],
    bullets: [],
    particles: [],
    score: 0,
    gameOver: false,
};

// Vector helper class for position/velocity
class Vector {
    constructor(x, y) {
        this.x = x || 0;
        this.y = y || 0;
    }
}

// Input State
const keys = {};

class Particle {
    constructor(x, y, color, vx, vy, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
    }

    draw() {
        const opacity = this.life / this.maxLife;
        CTX.globalAlpha = opacity;
        CTX.fillStyle = this.color;
        CTX.beginPath();
        CTX.arc(this.x, this.y, 3, 0, Math.PI * 2);
        CTX.fill();
        CTX.globalAlpha = 1;
    }
}

class Projectile {
    constructor(x, y, vx, vy, owner) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(vx, vy);
        this.owner = owner; // 'player' or enemy index
        this.radius = 5;
        this.active = true;
    }

    update() {
        if (gameState.gameOver) return;

        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        this.vel.y += GRAVITY * 0.6;

        // Ground collision - don't explode on ground, just stop
        if (this.pos.y >= GROUND_Y - this.radius * 2) {
            this.pos.y = GROUND_Y - this.radius * 2;
            this.vel.y = 0;

            if (Math.abs(this.vel.x) > 1) {
                this.vel.x *= 0.85;
            } else {
                this.active = false;
            }
        }

        // Boundaries
        if (this.pos.x < 20 || this.pos.x > CANVAS.width - 20) {
            this.active = false;
        }
        if (this.pos.y < 0) {
            this.active = false;
        }
    }

    draw() {
        CTX.fillStyle = '#ff6347';
        CTX.beginPath();
        CTX.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        CTX.fill();
    }

    checkCollisions() {
        if (gameState.gameOver) return;

        const allWorms = [gameState.player, ...gameState.enemies];

        for (const worm of allWorms) {
            // Skip if not active or wrong side
            if (!worm.active) continue;
            // Skip friendly fire: player bullets skip the player, enemy bullets skip enemies
            if (this.owner === 'player' && worm.isPlayer) continue;
            if (this.owner === 'enemy' && !worm.isPlayer) continue;

            const dx = this.pos.x - worm.pos.x;
            const dy = this.pos.y - worm.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Only damage when bullet hits the worm directly
            if (dist < worm.radius + this.radius) {
                this.active = false;
                worm.takeDamage(3); // Small, manageable damage
                createExplosion(this.pos.x, this.pos.y, '#ff4500', 12);

                // Death effect with particles
                if (!worm.active) {
                    for (let i = 0; i < 8; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = Math.random() * 3 + 1;
                        gameState.particles.push(new Particle(
                            worm.pos.x, worm.pos.y,
                            worm.color,
                            Math.cos(angle) * speed,
                            Math.sin(angle) * speed,
                            30
                        ));
                    }
                }

                // Score tracking
                if (this.owner === 'player' && !worm.isPlayer) {
                    gameState.score += 100;
                } else if (this.owner === 'enemy' && worm.isPlayer) {
                    gameState.score -= 10;
                }
            }
        }

        // Bullet-bullet collisions
        for (let i = gameState.bullets.length - 1; i >= 0; i--) {
            const other = gameState.bullets[i];
            if (this === other) continue;

            const dx = this.pos.x - other.pos.x;
            const dy = this.pos.y - other.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.radius + other.radius) {
                this.active = false;
                other.active = false;
                createExplosion((this.pos.x + other.pos.x) / 2, (this.pos.y + other.pos.y) / 2, '#ff6347', 8);
            }
        }

        gameState.bullets = gameState.bullets.filter(b => b.active);
    }
}

class Worm {
    constructor(x, y, isPlayer, color) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(0, 0);
        this.isPlayer = isPlayer;
        this.color = color;
        this.radius = 15;
        this.health = 30;
        this.maxHealth = 30;
        this.active = true;
        this.facingRight = isPlayer ? true : false;
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.active = false;
            createExplosion(this.pos.x, this.pos.y, '#ff4500', 20);

            if (this.isPlayer) {
                endGame('DEFEAT');
            } else {
                gameState.score += 1000;
                checkVictory();
            }
        }
    }

    move(speed) {
        if (!gameState.gameOver) {
            this.vel.x = speed;
            this.facingRight = speed > 0;
            this.jumpTimer = 0;
        }
    }

    stop() {
        this.vel.x *= 0.8;
    }

    jump() {
        const onGround = this.pos.y >= GROUND_Y - this.radius * 2 - 2;
        if (this.active && onGround) {
            this.vel.y = JUMP_FORCE;
        }
    }

    shoot(owner, angleOffset = -0.2) {
        const speed = BULLET_SPEED;
        const dir = this.facingRight ? 1 : -1;
        const vx = speed * Math.cos(Math.abs(angleOffset)) * dir;
        const vy = -speed * Math.sin(Math.abs(angleOffset));
        // Spawn bullet at the worm's edge so it doesn't immediately self-collide
        const spawnX = this.pos.x + dir * (this.radius + this.radius);
        gameState.bullets.push(new Projectile(spawnX, this.pos.y, vx, vy, owner));
    }

    update() {
        if (!this.active || gameState.gameOver) return;

        this.vel.y += GRAVITY;
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;

        // Ground collision
        if (this.pos.y >= GROUND_Y - this.radius * 2) {
            this.pos.y = GROUND_Y - this.radius * 2;
            this.vel.y = 0;
            if (!this.isPlayer) {
                this.vel.x *= 0.85;
                if (Math.abs(this.vel.x) < 0.1) this.vel.x = 0;
            }
        }

        // Boundaries
        if (this.pos.x < 25) this.pos.x = 25;
        if (this.pos.x > CANVAS.width - 25) this.pos.x = CANVAS.width - 25;
    }

    draw() {
        if (!this.active) return;

        // Shadow
        CTX.fillStyle = 'rgba(0,0,0,0.3)';
        CTX.beginPath();
        CTX.arc(this.pos.x + 3, this.pos.y + 3, this.radius, 0, Math.PI * 2);
        CTX.fill();

        // Body
        CTX.fillStyle = this.color;
        CTX.beginPath();
        CTX.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        CTX.fill();

        // Outline
        CTX.strokeStyle = '#000';
        CTX.lineWidth = 2;
        CTX.stroke();

        // Eyes (facing direction of movement)
        let eyeOffsetX;
        if (Math.abs(this.vel.x) > 0.1) {
            eyeOffsetX = this.vel.x > 0 ? 5 : -5;
        } else if (this.isPlayer) {
            eyeOffsetX = 5;
        } else {
            eyeOffsetX = this.facingRight ? 5 : -5;
        }

        CTX.fillStyle = 'white';
        CTX.beginPath();
        CTX.arc(this.pos.x + eyeOffsetX, this.pos.y - 6, 5, 0, Math.PI * 2);
        CTX.fill();

        // Pupil
        CTX.fillStyle = 'black';
        CTX.beginPath();
        CTX.arc(this.pos.x + eyeOffsetX + (eyeOffsetX > 0 ? 2 : -2), this.pos.y - 6, 2, 0, Math.PI * 2);
        CTX.fill();

        // Health bar background
        CTX.fillStyle = 'red';
        CTX.fillRect(this.pos.x - 15, this.pos.y - 22, 30, 4);

        // Health bar foreground
        CTX.fillStyle = '#32cd32';
        CTX.fillRect(this.pos.x - 15, this.pos.y - 22, 30 * (this.health / this.maxHealth), 4);
    }
}

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        gameState.particles.push(new Particle(
            x, y, color,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            20 + Math.random() * 10
        ));
    }
}

function initGame() {
    // Create player worm - facing right by default
    gameState.player = new Worm(400, GROUND_Y - 30, true, '#32cd32');

    // Create enemy worms
    const enemyColors = ['#ff6b6b', '#feca57', '#5f27cd'];
    for (let i = 0; i < 3; i++) {
        gameState.enemies.push(new Worm(
            150 + i * 220,
            GROUND_Y - 30,
            false,
            enemyColors[i]
        ));
    }

    updateUI();
}

function checkVictory() {
    const aliveEnemies = gameState.enemies.filter(e => e.active).length;
    if (aliveEnemies === 0 && !gameState.gameOver) {
        endGame('VICTORY!');
    } else if (gameState.player.health <= 0) {
        endGame('DEFEAT');
    }
}

function updateEnemyAI() {
    if (gameState.gameOver) return;

    const now = Date.now();
    for (const enemy of gameState.enemies.filter(e => e.active)) {
        if (now - (enemy.lastActionTime || 0) < 1200) continue;

        // Face the player
        if (gameState.player.active) {
            enemy.facingRight = gameState.player.pos.x > enemy.pos.x;
        }

        const action = Math.random();
        if (action < 0.35) {
            enemy.move(PLAYER_SPEED * (enemy.facingRight ? 1 : -1));
        } else if (action < 0.45) {
            enemy.vel.x = 0;
        } else if (action < 0.6) {
            enemy.jump();
        } else if (action < 0.8) {
            enemy.shoot('enemy', 0.1);
        }

        enemy.lastActionTime = now;
    }
}

function endGame(result) {
    gameState.gameOver = true;
    const gameOverDiv = document.getElementById('gameOver');
    gameOverDiv.textContent = result + ' Score: ' + gameState.score;
    gameOverDiv.classList.add('show');

    draw();
}

function updateUI() {
    document.getElementById('playerScore').textContent = gameState.score;
    const aliveEnemies = gameState.enemies.filter(e => e.active).length;
    document.getElementById('enemyCount').textContent = aliveEnemies;
}

document.addEventListener('keyup', (e) => {
    keys[e.code] = false;

    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (!gameState.gameOver) {
            gameState.player.vel.x = 0;
        }
    }
});

document.addEventListener('keydown', (e) => {
    keys[e.code] = true;

    if (!gameState.gameOver) {
        if (e.code === 'ArrowLeft') {
            gameState.player.move(-PLAYER_SPEED);
        } else if (e.code === 'ArrowRight') {
            gameState.player.move(PLAYER_SPEED);
        } else if (e.code === 'ArrowUp') {
            gameState.player.jump();
        } else if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            gameState.player.shoot('player', -0.2);
        }
    }
});

function draw() {
    CTX.fillStyle = '#87ceeb';
    CTX.fillRect(0, 0, CANVAS.width, CANVAS.height);

    // Draw ground
    CTX.fillStyle = '#2d5a27';
    CTX.fillRect(0, GROUND_Y - 15, CANVAS.width, 30);

    // Grass top border
    CTX.fillStyle = '#32cd32';
    CTX.fillRect(0, GROUND_Y - 30, CANVAS.width, 8);

    updateEnemyAI();
    updateUI();

    if (gameState.player.active) {
        gameState.player.update();
        gameState.player.draw();
    }

    for (const enemy of gameState.enemies) {
        enemy.update();
        enemy.draw();
    }

    // Update and render all bullets after enemies
    for (const bullet of gameState.bullets) {
        bullet.update();
        bullet.checkCollisions();
    }

    for (let i = gameState.particles.length - 1; i >= 0; i--) {
        const p = gameState.particles[i];
        p.update();
        p.draw();
        if (p.life <= 0) {
            gameState.particles.splice(i, 1);
        }
    }

    if (gameState.player.active && !gameState.gameOver) {
        checkVictory();
    }
}

function gameLoop() {
    draw();
    requestAnimationFrame(gameLoop);
}

initGame();
gameLoop();
