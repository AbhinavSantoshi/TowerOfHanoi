/**
 * Tower of Hanoi Game - Refactored with proper class architecture
 * Addresses: Code organization, error handling, performance, accessibility, memory management
 */

// Input validation for configuration
function validateConfig(config) {
    const requiredSections = ['SCORING', 'ANIMATIONS', 'AUDIO', 'STORAGE_KEY'];
    const requiredScoring = ['BASE_SCORE', 'DIFFICULTY_MULTIPLIER', 'MOVE_PENALTY'];
    const requiredAnimations = ['DISK_APPEAR_DURATION', 'MOVE_ANIMATION_DURATION'];
    const requiredAudio = ['MOVE_FREQUENCY', 'INVALID_FREQUENCY', 'WIN_FREQUENCIES'];

    try {
        requiredSections.forEach(section => {
            if (!config[section]) {
                throw new Error(`Missing required config section: ${section}`);
            }
        });

        requiredScoring.forEach(key => {
            if (typeof config.SCORING[key] !== 'number' || config.SCORING[key] < 0) {
                throw new Error(`Invalid scoring config: ${key}`);
            }
        });

        requiredAnimations.forEach(key => {
            if (typeof config.ANIMATIONS[key] !== 'number' || config.ANIMATIONS[key] <= 0) {
                throw new Error(`Invalid animation config: ${key}`);
            }
        });

        requiredAudio.forEach(key => {
            if (key === 'WIN_FREQUENCIES') {
                if (!Array.isArray(config.AUDIO[key]) || config.AUDIO[key].length === 0) {
                    throw new Error(`Invalid audio config: ${key} must be a non-empty array`);
                }
            } else if (typeof config.AUDIO[key] !== 'number' || config.AUDIO[key] <= 0) {
                throw new Error(`Invalid audio config: ${key}`);
            }
        });

        return true;
    } catch (error) {
        console.error('Configuration validation failed:', error);
        return false;
    }
}

// Configuration object to centralize all game settings
const CONFIG = {
    SCORING: {
        BASE_SCORE: 1000,
        DIFFICULTY_MULTIPLIER: 0,
        MOVE_PENALTY: 5,
        MOVE_PENALTY_PERCENTAGE: 0.02,
        INVALID_MOVE_PENALTY: 25,
        EFFICIENCY_BONUS: 50,
        STREAK_BONUS: 100,
        PERFECT_SOLUTION_BONUS: 500,
        PERFECT_GAME_BONUS: 300,
        TIME_PENALTY_PER_MINUTE: 10,
        HINT_PENALTY: 10
    },
    ANIMATIONS: {
        DISK_APPEAR_DURATION: 500,
        MOVE_ANIMATION_DURATION: 600,
        CONFETTI_COUNT: 50,
        ACHIEVEMENT_DURATION: 3000
    },
    AUDIO: {
        MOVE_FREQUENCY: 400,
        INVALID_FREQUENCY: 200,
        ACHIEVEMENT_FREQUENCY: 600,
        WIN_FREQUENCIES: [523, 659, 784, 1047], // C, E, G, C
        BEEP_DURATION: 0.1,
        INVALID_BEEP_DURATION: 0.3,
        ACHIEVEMENT_BEEP_DURATION: 0.2,
        WIN_NOTE_DURATION: 0.3
    },
    STORAGE_KEY: 'towerHanoiBestScore',
    VALIDATION: {
        MIN_DISKS: 3,
        MAX_DISKS: 8,
        MAX_TOWER_INDEX: 2
    }
};

// Validate configuration on load
if (!validateConfig(CONFIG)) {
    throw new Error('Invalid game configuration detected');
}

/**
 * Audio Manager - Handles all sound effects with proper error handling
 */
class AudioManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.isDestroyed = false;
        this.activeTimeouts = new Set(); // Track timeouts for cleanup
        this.initializeAudio();
    }

    initializeAudio() {
        if (this.isDestroyed) return;
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('Audio not available:', error);
            this.audioContext = null;
        }
    }

    async ensureAudioContext() {
        if (this.isDestroyed || !this.audioContext) {
            return false;
        }

        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (error) {
                console.warn('Could not resume audio context:', error);
                return false;
            }
        }
        return true;
    }

    createBeep(frequency, duration) {
        if (this.isDestroyed || !this.enabled || !this.audioContext) return;

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.value = Math.max(20, Math.min(20000, frequency)); // Validate frequency range
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        } catch (error) {
            console.warn('Error playing sound:', error);
        }
    }    playWinSound() {
        if (this.isDestroyed || !this.enabled) return;
        
        CONFIG.AUDIO.WIN_FREQUENCIES.forEach((freq, index) => {
            const timeoutId = setTimeout(() => {
                if (!this.isDestroyed) {
                    this.createBeep(freq, CONFIG.AUDIO.WIN_NOTE_DURATION);
                }
                this.activeTimeouts.delete(timeoutId);
            }, index * 200);
            this.activeTimeouts.add(timeoutId);
        });
    }

    async playSound(type) {
        if (this.isDestroyed || !await this.ensureAudioContext()) return;

        const soundMap = {
            move: [CONFIG.AUDIO.MOVE_FREQUENCY, CONFIG.AUDIO.BEEP_DURATION],
            invalid: [CONFIG.AUDIO.INVALID_FREQUENCY, CONFIG.AUDIO.INVALID_BEEP_DURATION],
            achievement: [CONFIG.AUDIO.ACHIEVEMENT_FREQUENCY, CONFIG.AUDIO.ACHIEVEMENT_BEEP_DURATION],
            win: null // Special case handled by playWinSound
        };

        if (type === 'win') {
            this.playWinSound();
        } else if (soundMap[type]) {
            const [frequency, duration] = soundMap[type];
            this.createBeep(frequency, duration);
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }    destroy() {
        this.isDestroyed = true;
        
        // Clear all active timeouts
        this.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.activeTimeouts.clear();
        
        if (this.audioContext) {
            try {
                this.audioContext.close();
            } catch (error) {
                console.warn('Error closing audio context:', error);
            }
            this.audioContext = null;
        }
    }
}

/**
 * Storage Manager - Handles localStorage with error handling
 */
class StorageManager {
    static validateScore(score) {
        return typeof score === 'number' && score >= 0 && score < 1000000;
    }

    static getBestScore() {
        try {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
            const score = parseInt(stored, 10);
            return this.validateScore(score) ? score : 0;
        } catch (error) {
            console.warn('Could not read from localStorage:', error);
            return 0;
        }
    }

    static setBestScore(score) {
        if (!this.validateScore(score)) {
            console.warn('Invalid score value:', score);
            return false;
        }

        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, score.toString());
            return true;
        } catch (error) {
            console.warn('Could not write to localStorage:', error);
            return false;
        }
    }
}

/**
 * Score Manager - Handles all scoring logic
 */
class ScoreManager {    constructor(numDisks) {
        this.validateNumDisks(numDisks);
        this.baseScore = CONFIG.SCORING.BASE_SCORE + (numDisks * CONFIG.SCORING.DIFFICULTY_MULTIPLIER);
        this.currentScore = this.baseScore;
        this.perfectGame = true;
        this.consecutivePerfectMoves = 0;
        this.numDisks = numDisks;
        this.bonusesApplied = {
            perfectGame: false,
            perfectSolution: false
        };
    }

    validateNumDisks(numDisks) {
        if (typeof numDisks !== 'number' || 
            numDisks < CONFIG.VALIDATION.MIN_DISKS || 
            numDisks > CONFIG.VALIDATION.MAX_DISKS) {
            throw new Error(`Invalid number of disks: ${numDisks}. Must be between ${CONFIG.VALIDATION.MIN_DISKS} and ${CONFIG.VALIDATION.MAX_DISKS}`);
        }
    }

    getMinimumMoves() {
        return Math.pow(2, this.numDisks) - 1;
    }

    calculateMoveScore(isValidMove, moveCount, startTime) {
        if (typeof isValidMove !== 'boolean' || typeof moveCount !== 'number' || moveCount < 0) {
            console.warn('Invalid parameters for calculateMoveScore');
            return null;
        }

        if (isValidMove) {
            const minMoves = this.getMinimumMoves();
            
            // Efficiency bonus for moves close to optimal
            if (moveCount <= minMoves + 2) {
                this.consecutivePerfectMoves++;
                this.currentScore += CONFIG.SCORING.EFFICIENCY_BONUS;
                
                if (this.consecutivePerfectMoves >= 3) {
                    this.currentScore += CONFIG.SCORING.STREAK_BONUS;
                    return 'streak'; // Signal for achievement
                }            } else {
                this.consecutivePerfectMoves = 0;
                this.perfectGame = false;
            }
            
            // Regular move penalty
            this.currentScore -= Math.max(
                CONFIG.SCORING.MOVE_PENALTY,
                Math.floor(this.currentScore * CONFIG.SCORING.MOVE_PENALTY_PERCENTAGE)
            );
        } else {
            // Invalid move penalty
            this.currentScore -= CONFIG.SCORING.INVALID_MOVE_PENALTY;
            this.perfectGame = false;
            this.consecutivePerfectMoves = 0;
        }

        // Time penalty
        if (startTime && typeof startTime === 'number') {
            const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
            this.currentScore -= elapsedMinutes * CONFIG.SCORING.TIME_PENALTY_PER_MINUTE;
        }

        this.currentScore = Math.max(0, this.currentScore);
        return null;
    }    calculateFinalScore(moveCount, startTime) {
        if (typeof moveCount !== 'number' || moveCount <= 0) {
            console.warn('Invalid move count for final score calculation');
            return { score: 0, efficiency: 0, isPerfectSolution: false, isPerfectGame: false };
        }

        const minMoves = this.getMinimumMoves();
        let finalScore = this.currentScore;
        
        // Perfect solution bonus - only add if not already applied
        if (moveCount === minMoves && !this.bonusesApplied.perfectSolution) {
            finalScore += CONFIG.SCORING.PERFECT_SOLUTION_BONUS;
            this.bonusesApplied.perfectSolution = true;
        }
        
        // Perfect game bonus - only add if not already applied
        if (this.perfectGame && !this.bonusesApplied.perfectGame) {
            finalScore += CONFIG.SCORING.PERFECT_GAME_BONUS;
            this.bonusesApplied.perfectGame = true;
        }
        
        // Time bonus (max 5 minutes)
        if (startTime && typeof startTime === 'number') {
            const timeBonus = Math.max(0, 300 - Math.floor((Date.now() - startTime) / 1000));
            finalScore += timeBonus;
        }
        
        return {
            score: Math.max(0, finalScore),
            efficiency: Math.round((minMoves / moveCount) * 100),
            isPerfectSolution: moveCount === minMoves,
            isPerfectGame: this.perfectGame
        };
    }

    applyHintPenalty() {
        this.currentScore -= CONFIG.SCORING.HINT_PENALTY;
        this.currentScore = Math.max(0, this.currentScore);
    }    getCurrentScore() {
        return Math.max(0, this.calculateCurrentScoreWithBonuses());
    }

    calculateCurrentScoreWithBonuses() {
        let scoreWithBonuses = this.currentScore;
        
        // Add perfect game bonus if still perfect and not already applied
        if (this.perfectGame && !this.bonusesApplied.perfectGame) {
            scoreWithBonuses += CONFIG.SCORING.PERFECT_GAME_BONUS;
        }
        
        return scoreWithBonuses;
    }
}

/**
 * Game State Manager - Handles the core game logic
 */
class TowerOfHanoiGame {
    constructor(numDisks = 3) {
        this.validateInput(numDisks);
        this.towers = [[], [], []];
        this.numDisks = numDisks;
        this.moves = 0;
        this.startTime = null;
        this.gameStarted = false;
        this.selectedDisk = null;
        this.selectedTower = null;
        
        this.scoreManager = new ScoreManager(numDisks);
        this.initializeTowers();
    }

    validateInput(numDisks) {
        if (typeof numDisks !== 'number' || 
            numDisks < CONFIG.VALIDATION.MIN_DISKS || 
            numDisks > CONFIG.VALIDATION.MAX_DISKS) {
            throw new Error(`Invalid number of disks: ${numDisks}`);
        }
    }

    validateTowerIndex(towerIndex) {
        return typeof towerIndex === 'number' && 
               towerIndex >= 0 && 
               towerIndex <= CONFIG.VALIDATION.MAX_TOWER_INDEX;
    }

    initializeTowers() {
        this.towers = [[], [], []];
        for (let i = this.numDisks; i >= 1; i--) {
            this.towers[0].push(i);
        }
        this.moves = 0;
        this.startTime = null;
        this.gameStarted = false;
        this.selectedDisk = null;
        this.selectedTower = null;
    }

    startGame() {
        if (!this.gameStarted) {
            this.gameStarted = true;
            this.startTime = Date.now();
        }
    }

    isValidMove(fromTower, toTower) {
        if (!this.validateTowerIndex(fromTower) || !this.validateTowerIndex(toTower)) {
            return false;
        }
        
        if (fromTower === toTower) return false;
        if (this.towers[fromTower].length === 0) return false;
        
        const diskToMove = this.towers[fromTower][this.towers[fromTower].length - 1];
        const targetTopDisk = this.towers[toTower][this.towers[toTower].length - 1];
        
        return !targetTopDisk || diskToMove < targetTopDisk;
    }

    canSelectDisk(tower, diskSize) {
        if (!this.validateTowerIndex(tower) || typeof diskSize !== 'number') {
            return false;
        }
        
        const topDisk = this.towers[tower][this.towers[tower].length - 1];
        return topDisk === diskSize;
    }

    makeMove(fromTower, toTower) {
        if (!this.isValidMove(fromTower, toTower)) {
            return { success: false, achievement: null };
        }

        this.startGame();
        
        const disk = this.towers[fromTower].pop();
        this.towers[toTower].push(disk);
        this.moves++;

        const achievement = this.scoreManager.calculateMoveScore(true, this.moves, this.startTime);
        
        return { success: true, achievement, disk };
    }

    attemptInvalidMove() {
        this.scoreManager.calculateMoveScore(false, this.moves, this.startTime);
        return { success: false, achievement: null };
    }

    isGameWon() {
        return this.towers[2].length === this.numDisks;
    }

    getFinalResults() {
        if (!this.isGameWon()) return null;
        
        return this.scoreManager.calculateFinalScore(this.moves, this.startTime);
    }

    getHint() {
        this.scoreManager.applyHintPenalty();
        
        // Simple hint: suggest moving the smallest available disk
        for (let i = 0; i < 3; i++) {
            if (this.towers[i].length > 0) {
                const smallestDisk = Math.min(...this.towers[i]);
                if (this.towers[i][this.towers[i].length - 1] === smallestDisk) {
                    return {
                        tower: i,
                        disk: smallestDisk,
                        message: `Try moving the disk of size ${smallestDisk} from tower ${i + 1}!`
                    };
                }
            }
        }
        
        return { message: "Move the smallest available disk!" };
    }

    getCurrentScore() {
        return this.scoreManager.getCurrentScore();
    }

    reset() {
        this.scoreManager = new ScoreManager(this.numDisks);
        this.initializeTowers();
    }
}

/**
 * DOM Manager - Handles DOM operations and element caching
 */
class DOMManager {
    constructor() {
        this.elements = this.cacheElements();
        this.dynamicElements = new Set(); // Track dynamically created elements
    }

    cacheElements() {
        const elements = {
            difficulty: document.getElementById('difficulty'),
            moves: document.getElementById('moves'),
            score: document.getElementById('score'),
            bestScore: document.getElementById('bestScore'),
            timer: document.getElementById('timer'),
            towers: document.querySelectorAll('.tower'),
            winMessage: document.getElementById('winMessage'),
            finalScore: document.getElementById('finalScore'),
            starRating: document.getElementById('starRating'),
            achievementText: document.getElementById('achievementText'),
            achievement: document.getElementById('achievement'),
            soundBtn: document.getElementById('soundBtn'),
            gameContainer: document.querySelector('.game-container')
        };

        // Validate required elements
        const requiredElements = ['difficulty', 'moves', 'score', 'timer', 'gameContainer'];
        requiredElements.forEach(id => {
            if (!elements[id]) {
                console.warn(`Required element not found: ${id}`);
            }
        });

        return elements;
    }

    createElement(tag, className, attributes = {}) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        
        this.dynamicElements.add(element);
        return element;
    }

    removeElement(element) {
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
            this.dynamicElements.delete(element);
        }
    }

    clearDynamicElements() {
        this.dynamicElements.forEach(element => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        this.dynamicElements.clear();
    }

    updateTextContent(elementId, content) {
        const element = this.elements[elementId];
        if (element) {
            element.textContent = content;
        } else {
            console.warn(`Element not found for update: ${elementId}`);
        }
    }

    announceToScreenReader(message) {
        if (typeof message !== 'string') return;
        
        const liveRegion = document.getElementById('live-region');
        if (liveRegion) {
            liveRegion.textContent = message;
        }
    }

    destroy() {
        this.clearDynamicElements();
        this.elements = null;
    }
}

/**
 * Keyboard Manager - Handles keyboard navigation and interactions
 */
class KeyboardManager {
    constructor(gameCallback, focusCallback) {
        this.gameCallback = gameCallback;
        this.focusCallback = focusCallback;
        this.currentFocusedElement = null;
        this.isDestroyed = false;
    }

    handleKeyboard(e) {
        if (this.isDestroyed || !this.gameCallback) return;

        const keyHandlers = {
            'ArrowLeft': () => {
                e.preventDefault();
                this.moveFocus(-1);
            },
            'ArrowRight': () => {
                e.preventDefault();
                this.moveFocus(1);
            },
            ' ': () => { // Space
                e.preventDefault();
                this.gameCallback('space', this.currentFocusedElement);
            },
            'Enter': () => {
                e.preventDefault();
                this.gameCallback('enter', this.currentFocusedElement);
            },
            'Escape': () => {
                e.preventDefault();
                this.gameCallback('escape', this.currentFocusedElement);
            },
            'h': () => {
                if (!e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    this.gameCallback('hint', this.currentFocusedElement);
                }
            },
            'H': () => {
                if (!e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    this.gameCallback('hint', this.currentFocusedElement);
                }
            }
        };

        const handler = keyHandlers[e.key];
        if (handler) {
            handler();
        }
    }

    moveFocus(direction) {
        if (this.isDestroyed || !this.focusCallback) return;
        
        const towers = document.querySelectorAll('.tower');
        if (towers.length === 0) return;
        
        let currentIndex = this.currentFocusedElement || 0;
        currentIndex = (currentIndex + direction + towers.length) % towers.length;
        this.currentFocusedElement = currentIndex;
        
        if (towers[currentIndex]) {
            towers[currentIndex].focus();
            this.focusCallback(currentIndex);
        }
    }

    setFocus(elementIndex) {
        this.currentFocusedElement = elementIndex;
    }

    destroy() {
        this.isDestroyed = true;
        this.gameCallback = null;
        this.focusCallback = null;
        this.currentFocusedElement = null;
    }
}

/**
 * Drag Drop Manager - Handles drag and drop interactions
 */
class DragDropManager {
    constructor(gameCallback) {
        this.gameCallback = gameCallback;
        this.isDestroyed = false;
    }

    handleDragStart(e) {
        if (this.isDestroyed || !this.gameCallback) {
            e.preventDefault();
            return;
        }

        const tower = parseInt(e.target.dataset.tower);
        const diskSize = parseInt(e.target.dataset.size);
        
        if (isNaN(tower) || isNaN(diskSize)) {
            e.preventDefault();
            return;
        }

        const result = this.gameCallback('dragStart', { tower, diskSize, element: e.target });
        if (!result) {
            e.preventDefault();
            return;
        }

        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
    }

    handleDragEnd(e) {
        if (this.isDestroyed) return;
        e.target.classList.remove('dragging');
    }

    handleDragOver(e) {
        if (this.isDestroyed) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e, towerIndex) {
        if (this.isDestroyed || !this.gameCallback) return;
        
        const result = this.gameCallback('dragEnter', towerIndex);
        if (result === 'valid') {
            e.currentTarget.classList.add('drop-zone');
        } else if (result === 'invalid') {
            e.currentTarget.classList.add('drop-zone-invalid');
        }
    }

    handleDragLeave(e) {
        if (this.isDestroyed) return;
        e.currentTarget.classList.remove('drop-zone');
        e.currentTarget.classList.remove('drop-zone-invalid');
    }

    handleDrop(e, towerIndex) {
        if (this.isDestroyed || !this.gameCallback) return;
        
        e.preventDefault();
        e.currentTarget.classList.remove('drop-zone');
        e.currentTarget.classList.remove('drop-zone-invalid');
        
        this.gameCallback('drop', towerIndex);
    }

    destroy() {
        this.isDestroyed = true;
        this.gameCallback = null;
    }
}

/**
 * Animation Manager - Handles animations and visual effects
 */
class AnimationManager {
    constructor() {
        this.activeAnimations = new Set();
        this.isDestroyed = false;
    }    highlightValidMove(diskSize) {
        if (this.isDestroyed) return;
        
        const timeoutId = setTimeout(() => {
            if (this.isDestroyed) return;
            
            const movedDisk = document.querySelector(`[data-size="${diskSize}"]`);
            if (movedDisk) {
                movedDisk.classList.add('valid-move');
                const removeTimeoutId = setTimeout(() => {
                    if (!this.isDestroyed && movedDisk) {
                        movedDisk.classList.remove('valid-move');
                    }
                    this.activeAnimations.delete(removeTimeoutId);
                }, CONFIG.ANIMATIONS.MOVE_ANIMATION_DURATION);
                
                this.activeAnimations.add(removeTimeoutId);
            }
            this.activeAnimations.delete(timeoutId);
        }, 100);
        
        this.activeAnimations.add(timeoutId);
    }    highlightInvalidMove(diskSize) {
        if (this.isDestroyed || diskSize === null) return;
        
        const diskElement = document.querySelector(`[data-size="${diskSize}"]`);
        if (diskElement) {
            diskElement.classList.add('invalid-move');
            const timeoutId = setTimeout(() => {
                if (!this.isDestroyed && diskElement) {
                    diskElement.classList.remove('invalid-move');
                }
                this.activeAnimations.delete(timeoutId);
            }, CONFIG.ANIMATIONS.MOVE_ANIMATION_DURATION);
            
            this.activeAnimations.add(timeoutId);
        }
    }    showAchievement(text, achievementElement) {
        if (this.isDestroyed || !achievementElement) return;
        
        achievementElement.textContent = text;
        achievementElement.classList.add('show');
        
        const timeoutId = setTimeout(() => {
            if (!this.isDestroyed && achievementElement) {
                achievementElement.classList.remove('show');
            }
            this.activeAnimations.delete(timeoutId);
        }, CONFIG.ANIMATIONS.ACHIEVEMENT_DURATION);
        
        this.activeAnimations.add(timeoutId);
    }    createConfetti() {
        if (this.isDestroyed) return;
        
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f093fb', '#ffd93d'];
        
        for (let i = 0; i < CONFIG.ANIMATIONS.CONFETTI_COUNT; i++) {
            const timeoutId = setTimeout(() => {
                if (this.isDestroyed) return;
                
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * 100 + 'vw';
                confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.animationDelay = Math.random() * 2 + 's';
                document.body.appendChild(confetti);
                
                const removeTimeoutId = setTimeout(() => {
                    if (confetti.parentNode) {
                        confetti.parentNode.removeChild(confetti);
                    }
                    this.activeAnimations.delete(removeTimeoutId);
                }, 3000);
                
                this.activeAnimations.add(removeTimeoutId);
                this.activeAnimations.delete(timeoutId);
            }, i * 50);
            
            this.activeAnimations.add(timeoutId);
        }
    }

    destroy() {
        this.isDestroyed = true;
        this.activeAnimations.forEach(timeoutId => clearTimeout(timeoutId));
        this.activeAnimations.clear();
    }
}

/**
 * Main UI Manager - Orchestrates all UI components
 */
class GameUI {
    constructor() {
        try {
            this.game = null;
            this.audioManager = new AudioManager();
            this.domManager = new DOMManager();
            this.keyboardManager = new KeyboardManager(
                (action, data) => this.handleKeyboardAction(action, data),
                (towerIndex) => this.handleTowerFocus(towerIndex)
            );
            this.dragDropManager = new DragDropManager(
                (action, data) => this.handleDragDropAction(action, data)
            );
            this.animationManager = new AnimationManager();
            
            this.timerInterval = null;
            this.boundHandlers = new Map();
            this.isDestroyed = false;
            
            this.setupEventListeners();
            this.initializeAccessibility();
        } catch (error) {
            console.error('Failed to initialize GameUI:', error);
            this.destroy();
            throw error;
        }
    }

    addEventListenerWithCleanup(element, event, handler, options = false) {
        if (this.isDestroyed || !element) return;
        
        const boundHandler = handler.bind(this);
        element.addEventListener(event, boundHandler, options);
        
        if (!this.boundHandlers.has(element)) {
            this.boundHandlers.set(element, []);
        }
        this.boundHandlers.get(element).push({ event, handler: boundHandler, options });
    }

    destroy() {
        if (this.isDestroyed) return;
        
        this.isDestroyed = true;
        
        // Clear timer
        this.stopTimer();
        
        // Remove all tracked event listeners
        this.boundHandlers.forEach((handlers, element) => {
            handlers.forEach(({ event, handler, options }) => {
                try {
                    element.removeEventListener(event, handler, options);
                } catch (error) {
                    console.warn('Error removing event listener:', error);
                }
            });
        });
        this.boundHandlers.clear();
        
        // Destroy all managers
        if (this.audioManager) {
            this.audioManager.destroy();
            this.audioManager = null;
        }
        
        if (this.domManager) {
            this.domManager.destroy();
            this.domManager = null;
        }
        
        if (this.keyboardManager) {
            this.keyboardManager.destroy();
            this.keyboardManager = null;
        }
        
        if (this.dragDropManager) {
            this.dragDropManager.destroy();
            this.dragDropManager = null;
        }
        
        if (this.animationManager) {
            this.animationManager.destroy();
            this.animationManager = null;
        }
        
        // Clear references
        this.game = null;
        
        console.log('GameUI destroyed and cleaned up');
    }    initializeAccessibility() {
        if (this.isDestroyed) return;
        
        try {
            // Add ARIA labels and roles to towers (elements already exist in HTML)
            this.domManager.elements.towers.forEach((tower, index) => {
                tower.setAttribute('tabindex', '0');
                tower.setAttribute('role', 'button');
                tower.setAttribute('aria-label', `Tower ${index + 1}`);
                tower.setAttribute('aria-describedby', 'game-instructions');
            });

            // Only create elements if they don't already exist
            if (!document.getElementById('game-instructions')) {
                const instructions = this.domManager.createElement('div', 'sr-only', {
                    id: 'game-instructions'
                });
                instructions.textContent = 'Use arrow keys to navigate between towers, Space to select/deselect disks, Enter to move selected disk to current tower, H for hints.';
                this.domManager.elements.gameContainer.appendChild(instructions);
            }

            // Use existing live-region from HTML instead of creating a new one
            // (live-region already exists in HTML)
        } catch (error) {
            console.error('Error initializing accessibility:', error);
        }
    }

    setupEventListeners() {
        if (this.isDestroyed) return;
        
        try {
            // Difficulty change
            this.addEventListenerWithCleanup(
                this.domManager.elements.difficulty, 
                'change', 
                () => this.initializeGame()
            );
            
            // Keyboard navigation
            this.addEventListenerWithCleanup(
                document, 
                'keydown', 
                (e) => this.keyboardManager.handleKeyboard(e)
            );
            
            // Drag and drop for towers
            this.domManager.elements.towers.forEach((tower, index) => {
                this.addEventListenerWithCleanup(tower, 'dragover', (e) => this.dragDropManager.handleDragOver(e));
                this.addEventListenerWithCleanup(tower, 'drop', (e) => this.dragDropManager.handleDrop(e, index));
                this.addEventListenerWithCleanup(tower, 'dragenter', (e) => this.dragDropManager.handleDragEnter(e, index));
                this.addEventListenerWithCleanup(tower, 'dragleave', (e) => this.dragDropManager.handleDragLeave(e));
                this.addEventListenerWithCleanup(tower, 'click', () => this.handleTowerClick(index));
                this.addEventListenerWithCleanup(tower, 'focus', () => this.handleTowerFocus(index));
            });

            // Window events
            this.addEventListenerWithCleanup(window, 'beforeunload', () => this.destroy());
            
            // Page visibility API for cleanup
            this.addEventListenerWithCleanup(document, 'visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.stopTimer();
                }
            });
        } catch (error) {
            console.error('Error setting up event listeners:', error);
        }
    }

    handleKeyboardAction(action, data) {
        if (this.isDestroyed || !this.game) return;

        try {
            switch (action) {
                case 'space':
                    if (data !== null) {
                        this.handleTowerClick(data);
                    }
                    break;
                case 'enter':
                    if (data !== null && this.game.selectedTower !== null) {
                        this.attemptMove(this.game.selectedTower, data);
                    }
                    break;
                case 'escape':
                    this.clearSelection();
                    break;
                case 'hint':
                    this.showHint();
                    break;
            }
        } catch (error) {
            console.error('Error handling keyboard action:', error);
        }
    }

    handleDragDropAction(action, data) {
        if (this.isDestroyed || !this.game) return false;

        try {
            switch (action) {
                case 'dragStart':
                    if (!this.game.canSelectDisk(data.tower, data.diskSize)) {
                        return false;
                    }
                    this.game.selectedDisk = data.diskSize;
                    this.game.selectedTower = data.tower;
                    this.game.startGame();
                    return true;

                case 'dragEnter':
                    if (this.game.selectedDisk !== null) {
                        return this.game.isValidMove(this.game.selectedTower, data) ? 'valid' : 'invalid';
                    }
                    return null;

                case 'drop':
                    if (this.game.selectedDisk !== null) {
                        this.attemptMove(this.game.selectedTower, data);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling drag drop action:', error);
            return false;
        }
    }

    handleTowerFocus(towerIndex) {
        if (this.isDestroyed || !this.game) return;
        
        try {
            this.keyboardManager.setFocus(towerIndex);
            this.domManager.announceToScreenReader(
                `Tower ${towerIndex + 1} focused. ${this.getTowerDescription(towerIndex)}`
            );
        } catch (error) {
            console.error('Error handling tower focus:', error);
        }
    }

    getTowerDescription(towerIndex) {
        if (!this.game || !this.game.validateTowerIndex(towerIndex)) {
            return "Invalid tower";
        }
        
        const tower = this.game.towers[towerIndex];
        if (tower.length === 0) {
            return "Empty tower";
        }
        return `Has ${tower.length} disk${tower.length === 1 ? '' : 's'}. Top disk size: ${tower[tower.length - 1]}`;
    }

    handleTowerClick(towerIndex) {
        if (this.isDestroyed || !this.game || !this.game.validateTowerIndex(towerIndex)) return;
        
        try {
            if (this.game.selectedTower === null) {
                this.selectDiskFromTower(towerIndex);
            } else {
                this.attemptMove(this.game.selectedTower, towerIndex);
            }
        } catch (error) {
            console.error('Error handling tower click:', error);
        }
    }

    selectDiskFromTower(towerIndex) {
        if (this.isDestroyed || !this.game) return;
        
        try {
            const tower = this.game.towers[towerIndex];
            if (tower.length === 0) {
                this.domManager.announceToScreenReader("Cannot select from empty tower");
                return;
            }

            const topDisk = tower[tower.length - 1];
            if (this.game.canSelectDisk(towerIndex, topDisk)) {
                this.game.selectedDisk = topDisk;
                this.game.selectedTower = towerIndex;
                this.updateDiskSelection();
                this.domManager.announceToScreenReader(`Selected disk size ${topDisk} from tower ${towerIndex + 1}`);
            }
        } catch (error) {
            console.error('Error selecting disk from tower:', error);
        }
    }

    clearSelection() {
        if (this.isDestroyed || !this.game) return;
        
        try {
            this.game.selectedDisk = null;
            this.game.selectedTower = null;
            this.updateDiskSelection();
            this.domManager.announceToScreenReader("Selection cleared");
        } catch (error) {
            console.error('Error clearing selection:', error);
        }
    }

    attemptMove(fromTower, toTower) {
        if (this.isDestroyed || !this.game) return;
        
        try {
            const result = this.game.makeMove(fromTower, toTower);
            
            if (result.success) {
                this.audioManager.playSound('move');
                this.domManager.announceToScreenReader(
                    `Moved disk size ${result.disk} from tower ${fromTower + 1} to tower ${toTower + 1}`
                );
                
                if (result.achievement === 'streak') {
                    this.animationManager.showAchievement("🔥 Perfect Streak!", this.domManager.elements.achievement);
                    this.audioManager.playSound('achievement');
                }
                
                this.clearSelection();
                this.updateDisplay();
                this.animationManager.highlightValidMove(result.disk);
                
                if (this.game.isGameWon()) {
                    this.handleGameWon();
                }
            } else {
                this.audioManager.playSound('invalid');
                this.domManager.announceToScreenReader("Invalid move");
                this.game.attemptInvalidMove();
                this.animationManager.highlightInvalidMove(this.game.selectedDisk);
                this.updateDisplay();
            }
        } catch (error) {
            console.error('Error attempting move:', error);
        }
    }

    updateDiskSelection() {
        if (this.isDestroyed) return;
        
        try {
            // Remove all existing selections
            document.querySelectorAll('.disk').forEach(disk => {
                disk.classList.remove('selected');
            });

            // Highlight selected disk
            if (this.game && this.game.selectedDisk !== null && this.game.selectedTower !== null) {
                const selectedDisk = document.querySelector(
                    `[data-tower="${this.game.selectedTower}"][data-size="${this.game.selectedDisk}"]`
                );
                if (selectedDisk) {
                    selectedDisk.classList.add('selected');
                }
            }
        } catch (error) {
            console.error('Error updating disk selection:', error);
        }
    }

    updateDisplay() {
        if (this.isDestroyed) return;
        
        try {
            this.renderTowers();
            this.updateGameInfo();
        } catch (error) {
            console.error('Error updating display:', error);
        }
    }

    renderTowers() {
        if (this.isDestroyed || !this.game) return;
        
        try {
            // Clear all towers
            this.domManager.elements.towers.forEach(tower => {
                const disks = tower.querySelectorAll('.disk');
                disks.forEach(disk => {
                    this.domManager.removeElement(disk);
                });
            });            // Render disks
            this.game.towers.forEach((tower, towerIndex) => {
                const towerElement = this.domManager.elements.towers[towerIndex];
                const towerBase = towerElement.querySelector('.tower-base');
                
                // Reverse the tower array to get proper stacking order (largest at bottom)
                [...tower].reverse().forEach(diskSize => {
                    const disk = this.createDiskElement(diskSize, towerIndex);
                    // Insert disk before the base to ensure proper stacking
                    towerElement.insertBefore(disk, towerBase);
                });
            });

            this.updateDiskSelection();
        } catch (error) {
            console.error('Error rendering towers:', error);
        }
    }

    createDiskElement(diskSize, towerIndex) {
        if (this.isDestroyed) return null;
        
        try {
            const disk = this.domManager.createElement('div', `disk disk-${diskSize}`, {
                draggable: 'true',
                'data-size': diskSize,
                'data-tower': towerIndex,
                tabindex: '0',
                role: 'button',
                'aria-label': `Disk size ${diskSize}`
            });
            
            this.addEventListenerWithCleanup(disk, 'dragstart', (e) => this.dragDropManager.handleDragStart(e));
            this.addEventListenerWithCleanup(disk, 'dragend', (e) => this.dragDropManager.handleDragEnd(e));
            
            return disk;
        } catch (error) {
            console.error('Error creating disk element:', error);
            return null;
        }
    }

    updateGameInfo() {
        if (this.isDestroyed || !this.game) return;
        
        try {
            this.domManager.updateTextContent('moves', this.game.moves);
            this.domManager.updateTextContent('score', this.game.getCurrentScore());
            this.domManager.updateTextContent('bestScore', StorageManager.getBestScore() || '-');
        } catch (error) {
            console.error('Error updating game info:', error);
        }
    }    startTimer() {
        if (this.isDestroyed) return;
        
        try {
            // Clear any existing timer first to prevent multiple timers
            this.stopTimer();
            
            // Set start time if not already set
            if (this.game && !this.game.startTime) {
                this.game.startTime = Date.now();
            }
            
            this.timerInterval = setInterval(() => {
                if (this.isDestroyed || !this.game) {
                    this.stopTimer();
                    return;
                }
                
                try {
                    const startTime = this.game.startTime || Date.now();
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                    const seconds = (elapsed % 60).toString().padStart(2, '0');
                    this.domManager.updateTextContent('timer', `${minutes}:${seconds}`);
                } catch (error) {
                    console.error('Error updating timer:', error);
                    this.stopTimer();
                }
            }, 1000);
        } catch (error) {
            console.error('Error starting timer:', error);
        }
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    handleGameWon() {
        if (this.isDestroyed || !this.game) return;
        
        try {
            this.stopTimer();
            
            const results = this.game.getFinalResults();
            if (!results) return;
            
            // Check for achievements
            if (results.isPerfectSolution) {
                this.animationManager.showAchievement("🏆 Perfect Solution!", this.domManager.elements.achievement);
                this.audioManager.playSound('achievement');
            }
              if (results.isPerfectGame) {
                const timeoutId = setTimeout(() => {
                    if (!this.isDestroyed) {
                        this.animationManager.showAchievement("✨ Flawless Victory!", this.domManager.elements.achievement);
                        this.audioManager.playSound('achievement');
                    }
                }, CONFIG.ANIMATIONS.ACHIEVEMENT_DURATION + 500);
                this.animationManager.activeAnimations.add(timeoutId);
            }
            
            // Update best score
            const currentBest = StorageManager.getBestScore();            if (results.score > currentBest) {
                StorageManager.setBestScore(results.score);
                const timeoutId = setTimeout(() => {
                    if (!this.isDestroyed) {
                        this.animationManager.showAchievement("🥇 New High Score!", this.domManager.elements.achievement);
                        this.audioManager.playSound('achievement');
                    }
                }, (CONFIG.ANIMATIONS.ACHIEVEMENT_DURATION * 2) + 1000);
                this.animationManager.activeAnimations.add(timeoutId);
            }
            
            this.showWinMessage(results);
            this.audioManager.playSound('win');
            this.animationManager.createConfetti();
            
            this.domManager.announceToScreenReader(
                `Congratulations! You won with a score of ${results.score} in ${this.game.moves} moves!`
            );
        } catch (error) {
            console.error('Error handling game won:', error);
        }
    }    showWinMessage(results) {
        if (this.isDestroyed || !results) return;
        
        try {
            this.domManager.updateTextContent('finalScore', `Final Score: ${results.score}`);
            
            // Calculate star rating
            let stars = '⭐';
            let achievementText = 'Good job!';
            
            if (results.efficiency >= 90 && results.isPerfectGame) {
                stars = '⭐⭐⭐⭐⭐';
                achievementText = 'Legendary Master!';
            } else if (results.efficiency >= 80) {
                stars = '⭐⭐⭐⭐';
                achievementText = 'Excellent!';
            } else if (results.efficiency >= 70) {
                stars = '⭐⭐⭐';
                achievementText = 'Great job!';
            } else if (results.efficiency >= 60) {
                stars = '⭐⭐';
                achievementText = 'Well done!';
            }
            
            this.domManager.updateTextContent('starRating', stars);
            this.domManager.updateTextContent('achievementText', achievementText);
            
            if (this.domManager.elements.winMessage) {
                this.domManager.elements.winMessage.style.display = 'block';
                const timeoutId = setTimeout(() => {
                    if (!this.isDestroyed && this.domManager.elements.winMessage) {
                        this.domManager.elements.winMessage.style.display = 'none';
                    }
                }, 5000);
                
                // Track timeout for cleanup
                if (this.animationManager) {
                    this.animationManager.activeAnimations.add(timeoutId);
                }
            }
        } catch (error) {
            console.error('Error showing win message:', error);
        }
    }

    showHint() {
        if (this.isDestroyed || !this.game) return;
        
        try {
            if (!this.game.gameStarted) {
                this.animationManager.showAchievement("💡 Start playing to get hints!", this.domManager.elements.achievement);
                return;
            }
            
            const hint = this.game.getHint();
            this.animationManager.showAchievement(`💡 ${hint.message}`, this.domManager.elements.achievement);
            this.updateDisplay();
            
            this.domManager.announceToScreenReader(`Hint: ${hint.message}`);
        } catch (error) {
            console.error('Error showing hint:', error);
        }
    }    toggleSound() {
        if (this.isDestroyed) return;
        
        try {
            const isEnabled = this.audioManager.toggle();
            const soundButton = this.domManager.elements.soundBtn;
            if (soundButton) {
                soundButton.textContent = isEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
            }
            this.domManager.announceToScreenReader(`Sound ${isEnabled ? 'enabled' : 'disabled'}`);
        } catch (error) {
            console.error('Error toggling sound:', error);
        }
    }

    initializeGame() {
        if (this.isDestroyed) return;
        
        try {
            const difficulty = parseInt(this.domManager.elements.difficulty.value);
            
            if (isNaN(difficulty) || difficulty < CONFIG.VALIDATION.MIN_DISKS || difficulty > CONFIG.VALIDATION.MAX_DISKS) {
                console.error('Invalid difficulty selected:', difficulty);
                return;
            }
            
            this.game = new TowerOfHanoiGame(difficulty);
            this.stopTimer();
            this.clearSelection();
            this.updateDisplay();
            this.startTimer();
            
            this.domManager.announceToScreenReader(`New game started with ${difficulty} disks`);
        } catch (error) {
            console.error('Error initializing game:', error);
        }
    }

    resetGame() {
        if (this.isDestroyed || !this.game) return;
        
        try {
            this.game.reset();
            this.stopTimer();
            this.clearSelection();
            this.updateDisplay();
            this.startTimer();
            
            this.domManager.announceToScreenReader("Game reset");
        } catch (error) {
            console.error('Error resetting game:', error);
        }
    }
}

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

// Global functions for backward compatibility with HTML onclick handlers
let gameUI;

function newGame() {
    try {
        if (gameUI) gameUI.initializeGame();
    } catch (error) {
        console.error('Error in newGame:', error);
    }
}

function toggleSound() {
    try {
        if (gameUI) gameUI.toggleSound();
    } catch (error) {
        console.error('Error in toggleSound:', error);
    }
}

function showHint() {
    try {
        if (gameUI) gameUI.showHint();
    } catch (error) {
        console.error('Error in showHint:', error);
    }
}

function showHelp() {
    try {
        const helpModal = document.getElementById('helpModal');
        if (helpModal) {
            helpModal.classList.add('show');
            helpModal.style.display = 'flex';
            
            // Focus management for accessibility
            const closeButton = helpModal.querySelector('.help-close-btn');
            if (closeButton) {
                closeButton.focus();
            }
            
            // Add escape key listener for this specific modal instance
            const handleEscapeKey = (e) => {
                if (e.key === 'Escape') {
                    closeHelp();
                    document.removeEventListener('keydown', handleEscapeKey);
                }
            };
            document.addEventListener('keydown', handleEscapeKey);
            
            // Store the escape handler for cleanup
            helpModal._escapeHandler = handleEscapeKey;
        }
    } catch (error) {
        console.error('Error in showHelp:', error);
    }
}

function closeHelp() {
    try {
        const helpModal = document.getElementById('helpModal');
        if (helpModal) {
            helpModal.classList.remove('show');
            
            // Add a small delay before hiding to allow animation to complete
            setTimeout(() => {
                if (helpModal && !helpModal.classList.contains('show')) {
                    helpModal.style.display = 'none';
                }
            }, 300);
            
            // Clean up escape key listener
            if (helpModal._escapeHandler) {
                document.removeEventListener('keydown', helpModal._escapeHandler);
                delete helpModal._escapeHandler;
            }
            
            // Return focus to help button if it exists
            const helpButton = document.getElementById('helpBtn');
            if (helpButton) {
                helpButton.focus();
            }
        }
    } catch (error) {
        console.error('Error in closeHelp:', error);
    }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        gameUI = new GameUI();
        gameUI.initializeGame();
    } catch (error) {
        console.error('Failed to initialize game:', error);
        // Fallback: show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position: fixed; top: 20px; left: 20px; background: red; color: white; padding: 20px; border-radius: 5px; z-index: 9999;';
        errorDiv.textContent = 'Game failed to initialize. Please refresh the page.';
        document.body.appendChild(errorDiv);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (gameUI) {
        gameUI.destroy();
    }
});

// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        TowerOfHanoiGame, 
        AudioManager, 
        StorageManager, 
        ScoreManager, 
        GameUI, 
        DOMManager,
        KeyboardManager,
        DragDropManager,
        AnimationManager,
        CONFIG 
    };
}
