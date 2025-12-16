const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const nextFoodNameElement = document.getElementById('next-food-name');
const introScreen = document.getElementById('intro-screen');
const introTitle = document.getElementById('intro-title');
const gameContainer = document.getElementById('game-container');
const playerEmojiElement = document.getElementById('player-emoji');
const playerNicknameElement = document.getElementById('player-nickname');
const refreshNicknameBtn = document.getElementById('refresh-nickname');
const leaderboardScreen = document.getElementById('leaderboard-screen');
const leaderboardList = document.getElementById('leaderboard-list');
const yourScoreDisplay = document.getElementById('your-score-display');
const enableGyroBtn = document.getElementById('enable-gyro');
const introSubtitle = document.getElementById('intro-subtitle');

// Mobile/Gyroscope support
let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
let gyroscopeEnabled = false;
let gyroscopePermissionGranted = false;

// Game constants
const CELL_SIZE = 44;
const SEGMENT_DISTANCE = 10;
const MOVEMENT_SPEED = isMobile ? 2.5 : 5; // 50% slower on mobile
const BUS_EMOJI = "🚍";

// Tilt thresholds (degrees)
const TILT_THRESHOLD = 15; // Minimum tilt to change direction
let lastTiltDirection = { dx: 0, dy: -1 };

// Player identity (persisted across rounds)
let playerEmoji = "";
let playerNickname = "";

// Game states
let introComplete = false;
let gameStarted = false;
let showingLeaderboard = false;

// Assign or load player identity
async function initPlayerIdentity() {
    const savedPlayer = await DB.getPlayer();
    
    if (savedPlayer) {
        playerEmoji = savedPlayer.emoji;
        playerNickname = savedPlayer.nickname;
    } else {
        await assignNewIdentity();
    }
    
    updateIdentityDisplay();
}

// Pick a random nickname from the list
function pickNickname(names) {
    return names[Math.floor(Math.random() * names.length)];
}

async function assignNewIdentity() {
    if (typeof EMOJI_DATA !== 'undefined' && EMOJI_DATA.length > 0) {
        const data = EMOJI_DATA[Math.floor(Math.random() * EMOJI_DATA.length)];
        playerEmoji = data.emoji;
        playerNickname = pickNickname(data.names);
    } else {
        playerEmoji = "😀";
        playerNickname = "Mystery Rider";
    }
    
    await DB.savePlayer(playerEmoji, playerNickname);
}

function updateIdentityDisplay() {
    playerEmojiElement.textContent = playerEmoji;
    playerNicknameElement.textContent = playerNickname;
}

// ========== GYROSCOPE CONTROLS ==========

function requestGyroscopePermission() {
    console.log('🎮 Requesting gyroscope permission...');
    
    // iOS 13+ requires permission request - MUST be called from user gesture
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        
        DeviceOrientationEvent.requestPermission()
            .then(permission => {
                console.log('Permission response:', permission);
                if (permission === 'granted') {
                    gyroscopePermissionGranted = true;
                    enableGyroscope();
                    enableGyroBtn.textContent = '✅ Tilt Enabled!';
                    enableGyroBtn.disabled = true;
                    console.log('✅ Gyroscope permission granted!');
                } else {
                    enableGyroBtn.textContent = '❌ Denied - Use Swipe';
                    console.log('❌ Gyroscope permission denied');
                }
            })
            .catch(error => {
                console.log('Gyroscope permission error:', error);
                enableGyroBtn.textContent = '❌ Error - Use Swipe';
            });
            
    } else if ('DeviceOrientationEvent' in window) {
        // Non-iOS or older iOS - no permission needed, try directly
        gyroscopePermissionGranted = true;
        enableGyroscope();
        enableGyroBtn.textContent = '✅ Tilt Enabled!';
        enableGyroBtn.disabled = true;
    } else {
        enableGyroBtn.textContent = '❌ Not Supported';
        console.log('DeviceOrientationEvent not available');
    }
}

function enableGyroscope() {
    if (gyroscopeEnabled) return;
    gyroscopeEnabled = true;
    
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    console.log('🎮 Gyroscope controls enabled!');
}

function handleDeviceOrientation(event) {
    if (!isGameRunning) return;
    
    // beta: front/back tilt (-180 to 180, 0 = flat)
    // gamma: left/right tilt (-90 to 90, 0 = flat)
    const beta = event.beta;   // Front/back
    const gamma = event.gamma; // Left/right
    
    if (beta === null || gamma === null) return;
    
    // Determine strongest tilt direction
    const absBeta = Math.abs(beta);
    const absGamma = Math.abs(gamma);
    
    // Only change direction if tilt exceeds threshold
    if (absBeta > TILT_THRESHOLD || absGamma > TILT_THRESHOLD) {
        if (absGamma > absBeta) {
            // Left/right tilt is stronger
            if (gamma > TILT_THRESHOLD && dx !== -1) {
                // Tilting right
                nextDx = 1;
                nextDy = 0;
            } else if (gamma < -TILT_THRESHOLD && dx !== 1) {
                // Tilting left
                nextDx = -1;
                nextDy = 0;
            }
        } else {
            // Front/back tilt is stronger
            if (beta > TILT_THRESHOLD && dy !== -1) {
                // Tilting forward (toward you) = down
                nextDx = 0;
                nextDy = 1;
            } else if (beta < -TILT_THRESHOLD && dy !== 1) {
                // Tilting back (away from you) = up
                nextDx = 0;
                nextDy = -1;
            }
        }
    }
}

// ========== SWIPE CONTROLS (Backup for mobile) ==========
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 30;

function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e) {
    if (!isGameRunning) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    
    // Determine swipe direction
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD) {
        // Horizontal swipe
        if (diffX > 0 && dx !== -1) {
            nextDx = 1; nextDy = 0; // Right
        } else if (diffX < 0 && dx !== 1) {
            nextDx = -1; nextDy = 0; // Left
        }
    } else if (Math.abs(diffY) > SWIPE_THRESHOLD) {
        // Vertical swipe
        if (diffY > 0 && dy !== -1) {
            nextDx = 0; nextDy = 1; // Down
        } else if (diffY < 0 && dy !== 1) {
            nextDx = 0; nextDy = -1; // Up
        }
    }
}

// Refresh nickname button
refreshNicknameBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    // Spin animation
    refreshNicknameBtn.style.transform = 'rotate(360deg)';
    setTimeout(() => {
        refreshNicknameBtn.style.transform = 'rotate(0deg)';
    }, 300);
    
    await assignNewIdentity();
    updateIdentityDisplay();
});

function runIntroAnimation() {
    const title = "TransSsSit";
    let charIndex = 0;
    
    function addNextChar() {
        if (charIndex < title.length) {
            const span = document.createElement('span');
            span.className = 'pixel-char';
            span.textContent = title[charIndex];
            span.style.animationDelay = '0s';
            introTitle.appendChild(span);
            charIndex++;
            setTimeout(addNextChar, 80);
        } else {
            setTimeout(async () => {
                await initPlayerIdentity();
                introComplete = true;
            }, 300);
        }
    }
    
    addNextChar();
}

function startGameFromIntro() {
    if (!introComplete || gameStarted) return;
    gameStarted = true;
    
    introScreen.style.transition = 'opacity 0.3s, transform 0.3s';
    introScreen.style.opacity = '0';
    introScreen.style.transform = 'scale(0.95)';
    
    setTimeout(() => {
        introScreen.style.display = 'none';
        gameContainer.classList.remove('hidden');
        initGame();
    }, 300);
}

function startGameFromLeaderboard() {
    if (!showingLeaderboard) return;
    showingLeaderboard = false;
    
    leaderboardScreen.style.transition = 'opacity 0.3s';
    leaderboardScreen.style.opacity = '0';
    
    setTimeout(() => {
        leaderboardScreen.classList.add('hidden');
        leaderboardScreen.style.opacity = '1';
        gameContainer.classList.remove('hidden');
        initGame();
    }, 300);
}

// Listen for any key
document.addEventListener('keydown', (e) => {
    if (showingLeaderboard) {
        startGameFromLeaderboard();
    } else if (!gameStarted && introComplete) {
        startGameFromIntro();
    } else if (gameStarted && isGameRunning) {
        handleGameInput(e);
    }
});

document.addEventListener('click', (e) => {
    // Don't trigger game start if clicking refresh button
    if (e.target === refreshNicknameBtn) return;
    
    if (showingLeaderboard) {
        startGameFromLeaderboard();
    } else if (!gameStarted && introComplete) {
        startGameFromIntro();
    }
});

// Touch events for mobile
document.addEventListener('touchstart', (e) => {
    // Don't trigger game start if touching refresh button
    if (e.target === refreshNicknameBtn) return;
    
    if (showingLeaderboard) {
        startGameFromLeaderboard();
    } else if (!gameStarted && introComplete) {
        startGameFromIntro();
    }
}, { passive: true });

// Color generator
let colorIndex = 0;
const COLORS = [
    { fill: 'hsl(0, 65%, 75%)',   border: 'hsl(0, 50%, 35%)' },
    { fill: 'hsl(30, 75%, 70%)',  border: 'hsl(30, 60%, 35%)' },
    { fill: 'hsl(50, 70%, 75%)',  border: 'hsl(50, 55%, 35%)' },
    { fill: 'hsl(145, 50%, 70%)', border: 'hsl(145, 45%, 30%)' },
    { fill: 'hsl(195, 60%, 75%)', border: 'hsl(195, 50%, 35%)' },
    { fill: 'hsl(210, 60%, 75%)', border: 'hsl(210, 50%, 35%)' },
    { fill: 'hsl(270, 50%, 75%)', border: 'hsl(270, 45%, 35%)' },
    { fill: 'hsl(320, 55%, 75%)', border: 'hsl(320, 45%, 35%)' },
    { fill: 'hsl(160, 50%, 70%)', border: 'hsl(160, 45%, 30%)' },
    { fill: 'hsl(35, 70%, 75%)',  border: 'hsl(35, 55%, 35%)' },
];

function getNextColor() {
    const color = COLORS[colorIndex % COLORS.length];
    colorIndex++;
    return color;
}

function getRandomEmojiData() {
    if (typeof EMOJI_DATA !== 'undefined' && EMOJI_DATA.length > 0) {
        return EMOJI_DATA[Math.floor(Math.random() * EMOJI_DATA.length)];
    }
    return { emoji: "😀", names: ["Smiley"] };
}

// Game State
let snakePath = [];
let snakeSegments = [];
let food = null;
let headPos = { x: 0, y: 0 };
let dx = 0;
let dy = 0;
let nextDx = 0;
let nextDy = 0;
let score = 0;
let animationFrameId = null;
let isGameRunning = false;

function initGame() {
    const startX = canvas.width / 2;
    const startY = canvas.height / 2;
    
    headPos = { x: startX, y: startY };
    snakePath = [];
    
    colorIndex = 0;
    snakeSegments = [];
    
    // First segment is always the bus
    snakeSegments.push({
        emoji: BUS_EMOJI,
        color: getNextColor()
    });
    
    for(let i = 0; i < 2; i++) {
        const data = getRandomEmojiData();
        snakeSegments.push({
            emoji: data.emoji,
            color: getNextColor()
        });
    }
    
    for (let i = 0; i <= snakeSegments.length * SEGMENT_DISTANCE + 100; i++) {
        snakePath.push({ x: startX, y: startY + i });
    }
    
    dx = 0;
    dy = -1;
    nextDx = 0;
    nextDy = -1;
    
    score = 0;
    scoreElement.textContent = `Score: ${score}`;
    
    createFood();
    
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    isGameRunning = true;
    gameLoop();
}

function createFood() {
    let validPosition = false;
    
    while (!validPosition) {
        const emojiData = getRandomEmojiData();
        const nickname = pickNickname(emojiData.names);
        
        food = {
            x: Math.random() * (canvas.width - CELL_SIZE * 2) + CELL_SIZE,
            y: Math.random() * (canvas.height - CELL_SIZE * 2) + CELL_SIZE,
            emoji: emojiData.emoji,
            color: getNextColor(),
            nickname: nickname
        };
        
        validPosition = true;
        const dist = Math.hypot(headPos.x - food.x, headPos.y - food.y);
        if (dist < CELL_SIZE * 2) {
             validPosition = false;
        }
    }
    
    nextFoodNameElement.textContent = food.nickname;
}

function update() {
    if (nextDx !== -dx && nextDy !== -dy) {
        dx = nextDx;
        dy = nextDy;
    }
    
    headPos.x += dx * MOVEMENT_SPEED;
    headPos.y += dy * MOVEMENT_SPEED;

    snakePath.unshift({ x: headPos.x, y: headPos.y });
    
    const maxPathLength = snakeSegments.length * SEGMENT_DISTANCE + 50;
    if (snakePath.length > maxPathLength) {
        snakePath.length = maxPathLength;
    }

    if (headPos.x < CELL_SIZE/2 || headPos.x > canvas.width - CELL_SIZE/2 || 
        headPos.y < CELL_SIZE/2 || headPos.y > canvas.height - CELL_SIZE/2) {
        gameOver();
        return;
    }

    const selfCollisionStartIndex = SEGMENT_DISTANCE * 4; 
    
    for (let i = selfCollisionStartIndex; i < snakePath.length; i += 5) {
        const pt = snakePath[i];
        if (i > snakeSegments.length * SEGMENT_DISTANCE) break;

        const dist = Math.hypot(headPos.x - pt.x, headPos.y - pt.y);
        if (dist < CELL_SIZE / 2) {
            gameOver();
            return;
        }
    }

    const distToFood = Math.hypot(headPos.x - food.x, headPos.y - food.y);
    if (distToFood < CELL_SIZE) {
        snakeSegments.push({
            emoji: food.emoji,
            color: food.color
        });
        
        score += 10;
        scoreElement.textContent = `Score: ${score}`;
        createFood();
    }
}

function draw() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0a5c2e');
    gradient.addColorStop(1, '#0d7a3e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (food) {
        drawCircle(food.x, food.y, food.color);
    }

    for (let i = snakeSegments.length - 1; i >= 0; i--) {
        const segment = snakeSegments[i];
        const pathIndex = i * SEGMENT_DISTANCE;
        
        if (pathIndex < snakePath.length) {
            const pos = snakePath[pathIndex];
            drawCircle(pos.x, pos.y, segment.color);
        }
    }
    
    for (let i = snakeSegments.length - 1; i >= 0; i--) {
        const segment = snakeSegments[i];
        const pathIndex = i * SEGMENT_DISTANCE;
        
        if (pathIndex < snakePath.length) {
            const pos = snakePath[pathIndex];
            drawEmoji(pos.x, pos.y, segment.emoji);
        }
    }
    
    if (food) {
        drawEmoji(food.x, food.y, food.emoji);
    }
}

function drawCircle(x, y, colorObj) {
    const radius = CELL_SIZE / 2 + 5;
    const borderWidth = 4;
    const whiteRimWidth = 3;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = colorObj.border;
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x, y, radius - borderWidth, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x, y, radius - borderWidth - whiteRimWidth, 0, Math.PI * 2);
    ctx.fillStyle = colorObj.fill;
    ctx.fill();
}

function drawEmoji(x, y, char) {
    const fontSize = CELL_SIZE * 0.7;
    ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`; 
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(char, x, y + fontSize * 0.35); 
}

// Show leaderboard with score comparison
async function showLeaderboard(currentScore) {
    const result = await DB.submitScore(playerEmoji, playerNickname, currentScore);
    const leaderboard = await DB.getLeaderboard();
    const playerRank = await DB.getPlayerRank(playerEmoji, playerNickname);
    
    // Show your score status
    yourScoreDisplay.innerHTML = '';
    
    if (result.isHighScore) {
        if (result.previousBest !== null) {
            // Beat previous best
            yourScoreDisplay.innerHTML = `
                <div class="score-result new-high">
                    <div class="score-label">🎉 NEW HIGH SCORE!</div>
                    <div class="score-value">${currentScore}</div>
                    <div class="score-previous">Previous best: ${result.previousBest}</div>
                </div>
            `;
        } else {
            // First score
            yourScoreDisplay.innerHTML = `
                <div class="score-result new-high">
                    <div class="score-label">🎉 SCORE RECORDED!</div>
                    <div class="score-value">${currentScore}</div>
                </div>
            `;
        }
    } else {
        // Didn't beat high score - show fading lower score
        yourScoreDisplay.innerHTML = `
            <div class="score-result not-high">
                <div class="score-label">Your Score</div>
                <div class="score-value fading">${currentScore}</div>
                <div class="score-best">Your best: ${result.previousBest}</div>
            </div>
        `;
    }
    
    // Build leaderboard
    leaderboardList.innerHTML = '';
    
    const playerId = `${playerEmoji}_${playerNickname}`;
    
    leaderboard.slice(0, 10).forEach((entry, index) => {
        const entryId = `${entry.emoji}_${entry.nickname}`;
        const isCurrentPlayer = entryId === playerId;
        
        const div = document.createElement('div');
        div.className = 'leaderboard-entry' + (isCurrentPlayer ? ' current' : '');
        
        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        
        div.innerHTML = `
            <span class="leaderboard-rank">${rankEmoji}</span>
            <span class="leaderboard-player">
                <span class="leaderboard-emoji">${entry.emoji}</span>
                <span class="leaderboard-name">${entry.nickname}</span>
            </span>
            <span class="leaderboard-score">${entry.score}</span>
        `;
        
        leaderboardList.appendChild(div);
    });
    
    gameContainer.classList.add('hidden');
    leaderboardScreen.classList.remove('hidden');
    showingLeaderboard = true;
}

function gameOver() {
    isGameRunning = false;
    cancelAnimationFrame(animationFrameId);
    
    setTimeout(() => {
        showLeaderboard(score);
    }, 500);
}

function gameLoop() {
    if (!isGameRunning) return;
    
    update();
    draw();
    
    animationFrameId = requestAnimationFrame(gameLoop);
}

function handleGameInput(e) {
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(e.code) > -1) {
        e.preventDefault();
    }

    const key = e.key.toLowerCase();
    
    if (key === 'w' || key === 'arrowup') {
        if (dy !== 1) { nextDx = 0; nextDy = -1; }
    } else if (key === 's' || key === 'arrowdown') {
        if (dy !== -1) { nextDx = 0; nextDy = 1; }
    } else if (key === 'a' || key === 'arrowleft') {
        if (dx !== 1) { nextDx = -1; nextDy = 0; }
    } else if (key === 'd' || key === 'arrowright') {
        if (dx !== -1) { nextDx = 1; nextDy = 0; }
    }
}

window.onload = function() {
    runIntroAnimation();
    
    // Update UI based on device
    const instructions = document.getElementById('instructions');
    
    if (isMobile) {
        introSubtitle.textContent = 'Tap to start';
        instructions.textContent = 'Tilt or swipe to steer';
        
        // Always show gyro button on mobile
        enableGyroBtn.classList.remove('hidden');
        
        // On Android/non-iOS, we can try to enable directly but still show button
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission !== 'function') {
            // Android or older iOS - try to enable directly
            enableGyroscope();
            enableGyroBtn.textContent = '✅ Tilt Enabled!';
            enableGyroBtn.disabled = true;
        }
        
        // Add swipe controls as backup
        canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
};

// Gyro button click handler - MUST be direct user gesture for iOS
enableGyroBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    requestGyroscopePermission();
});
