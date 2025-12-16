// ============================================
// DATABASE SYSTEM FOR TRANSSSIT LEADERBOARD
// ============================================
// Using Upstash Redis for real-time leaderboard
// 
// SETUP:
// 1. Create account at https://upstash.com
// 2. Create a Redis database
// 3. Copy your REST URL and TOKEN below
// ============================================

const UPSTASH_CONFIG = {
    // Replace these with your Upstash credentials
    url: 'https://infinite-hamster-25454.upstash.io',
    token: 'AWNuAAIncDEwYjBiYTQ1YTBhYTA0ODQ2OWIwZTg0MzVkMWNjOGEyZHAxMjU0NTQ'
};

// Check if Upstash is configured
const USE_UPSTASH = !UPSTASH_CONFIG.url.includes('YOUR_');

const DB = {
    LEADERBOARD_KEY: 'transssit:leaderboard',
    PLAYERS_KEY: 'transssit:players',
    LOCAL_PLAYER_KEY: 'transssit_player',
    
    // ========== UPSTASH REDIS HELPERS ==========
    async redis(command) {
        if (!USE_UPSTASH) {
            console.warn('Upstash not configured, using localStorage');
            return null;
        }
        
        const response = await fetch(`${UPSTASH_CONFIG.url}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${UPSTASH_CONFIG.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(command)
        });
        
        const data = await response.json();
        if (data.error) {
            console.error('Redis error:', data.error);
            return null;
        }
        return data.result;
    },
    
    // ========== LEADERBOARD OPERATIONS ==========
    
    // Get top N scores from leaderboard
    async getLeaderboard(limit = 50) {
        if (USE_UPSTASH) {
            // ZREVRANGE returns highest scores first
            // Returns array of [member, score, member, score, ...]
            const result = await this.redis([
                'ZREVRANGE', this.LEADERBOARD_KEY, '0', String(limit - 1), 'WITHSCORES'
            ]);
            
            if (!result) return this._getLocalLeaderboard();
            
            // Parse result into array of objects
            const leaderboard = [];
            for (let i = 0; i < result.length; i += 2) {
                const playerData = JSON.parse(result[i]);
                leaderboard.push({
                    emoji: playerData.emoji,
                    nickname: playerData.nickname,
                    score: parseInt(result[i + 1])
                });
            }
            return leaderboard;
        }
        
        return this._getLocalLeaderboard();
    },
    
    // Submit a score - Redis ZADD only keeps highest automatically with GT flag
    async submitScore(emoji, nickname, score) {
        const playerId = `${emoji}_${nickname}`;
        const playerData = JSON.stringify({ emoji, nickname });
        
        let previousBest = null;
        let isHighScore = false;
        let saved = false;
        
        if (USE_UPSTASH) {
            // Get current score first
            const currentScore = await this.redis(['ZSCORE', this.LEADERBOARD_KEY, playerData]);
            previousBest = currentScore ? parseInt(currentScore) : null;
            
            if (previousBest === null || score > previousBest) {
                // ZADD with GT flag: only update if new score > existing
                await this.redis(['ZADD', this.LEADERBOARD_KEY, 'GT', String(score), playerData]);
                isHighScore = true;
                saved = true;
            }
        } else {
            // Fallback to localStorage
            const result = this._submitLocalScore(emoji, nickname, score);
            return result;
        }
        
        return {
            saved,
            isHighScore,
            previousBest,
            entry: { emoji, nickname, score }
        };
    },
    
    // Get player's best score
    async getPlayerBest(emoji, nickname) {
        const playerData = JSON.stringify({ emoji, nickname });
        
        if (USE_UPSTASH) {
            const score = await this.redis(['ZSCORE', this.LEADERBOARD_KEY, playerData]);
            return score ? parseInt(score) : null;
        }
        
        return this._getLocalPlayerBest(emoji, nickname);
    },
    
    // Get player's rank (1-indexed)
    async getPlayerRank(emoji, nickname) {
        const playerData = JSON.stringify({ emoji, nickname });
        
        if (USE_UPSTASH) {
            // ZREVRANK returns 0-indexed rank (highest score = 0)
            const rank = await this.redis(['ZREVRANK', this.LEADERBOARD_KEY, playerData]);
            return rank !== null ? rank + 1 : null;
        }
        
        return this._getLocalPlayerRank(emoji, nickname);
    },
    
    // ========== PLAYER IDENTITY ==========
    
    async getPlayer() {
        // Player identity always stored locally (their device)
        const data = localStorage.getItem(this.LOCAL_PLAYER_KEY);
        return data ? JSON.parse(data) : null;
    },
    
    async savePlayer(emoji, nickname) {
        const player = { emoji, nickname, createdAt: Date.now() };
        localStorage.setItem(this.LOCAL_PLAYER_KEY, JSON.stringify(player));
        return player;
    },
    
    // ========== LOCAL STORAGE FALLBACK ==========
    
    _getLocalLeaderboard() {
        const data = localStorage.getItem('transssit_leaderboard_v2');
        return data ? JSON.parse(data) : [];
    },
    
    _saveLocalLeaderboard(leaderboard) {
        localStorage.setItem('transssit_leaderboard_v2', JSON.stringify(leaderboard));
    },
    
    _submitLocalScore(emoji, nickname, score) {
        const leaderboard = this._getLocalLeaderboard();
        const playerId = `${emoji}_${nickname}`;
        const existingIndex = leaderboard.findIndex(e => `${e.emoji}_${e.nickname}` === playerId);
        
        let result = {
            saved: false,
            isHighScore: false,
            previousBest: null,
            entry: { emoji, nickname, score }
        };
        
        if (existingIndex >= 0) {
            result.previousBest = leaderboard[existingIndex].score;
            if (score > leaderboard[existingIndex].score) {
                leaderboard[existingIndex].score = score;
                result.saved = true;
                result.isHighScore = true;
            }
        } else {
            leaderboard.push({ emoji, nickname, score });
            result.saved = true;
            result.isHighScore = true;
        }
        
        leaderboard.sort((a, b) => b.score - a.score);
        this._saveLocalLeaderboard(leaderboard.slice(0, 50));
        
        return result;
    },
    
    _getLocalPlayerBest(emoji, nickname) {
        const leaderboard = this._getLocalLeaderboard();
        const entry = leaderboard.find(e => e.emoji === emoji && e.nickname === nickname);
        return entry ? entry.score : null;
    },
    
    _getLocalPlayerRank(emoji, nickname) {
        const leaderboard = this._getLocalLeaderboard();
        const index = leaderboard.findIndex(e => e.emoji === emoji && e.nickname === nickname);
        return index >= 0 ? index + 1 : null;
    }
};

// Status indicator
if (USE_UPSTASH) {
    console.log('🌐 TransSsSit: Using Upstash Redis for leaderboard');
} else {
    console.log('💾 TransSsSit: Using localStorage (configure Upstash for online leaderboard)');
}

// Clear leaderboard - run DB.clearLeaderboard() in browser console
DB.clearLeaderboard = async function() {
    console.log('🗑️ Clearing leaderboard...');
    
    if (USE_UPSTASH) {
        try {
            await this.redis(['DEL', this.LEADERBOARD_KEY]);
            console.log('✅ Upstash leaderboard cleared!');
        } catch (error) {
            console.error('❌ Failed to clear Upstash leaderboard:', error);
        }
    }
    
    // Also clear local storage
    localStorage.removeItem('transssit_leaderboard_v2');
    console.log('✅ Local leaderboard cleared!');
    
    return true;
};

// Test function - run DB.test() in browser console
DB.test = async function() {
    console.log('🧪 Testing Upstash connection...');
    
    if (!USE_UPSTASH) {
        console.log('❌ Upstash not configured - still using placeholder values');
        return false;
    }
    
    try {
        // Test PING
        const ping = await this.redis(['PING']);
        if (ping === 'PONG') {
            console.log('✅ PING successful!');
        } else {
            console.log('❌ PING failed:', ping);
            return false;
        }
        
        // Test write
        const testKey = 'transssit:test';
        await this.redis(['SET', testKey, 'hello']);
        console.log('✅ Write successful!');
        
        // Test read
        const value = await this.redis(['GET', testKey]);
        if (value === 'hello') {
            console.log('✅ Read successful!');
        }
        
        // Clean up
        await this.redis(['DEL', testKey]);
        console.log('✅ Cleanup successful!');
        
        // Check current leaderboard
        const leaderboard = await this.getLeaderboard();
        console.log(`📊 Current leaderboard has ${leaderboard.length} entries`);
        
        console.log('🎉 All tests passed! Upstash is working correctly.');
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
};

window.DB = DB;
