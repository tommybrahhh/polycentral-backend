// server.js - Complete Backend Server for Predictions App
// This handles all API endpoints, database operations, and tournament management

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();
const isProduction = process.env.NODE_ENV === 'production';
const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500', 'http://127.0.0.1:5501'],
    credentials: true
}));

// Enhanced request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (process.env.NODE_ENV === 'production') {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
        } else {
            // Development logging - more detailed
            console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - User-Agent: ${req.get('User-Agent')}`);
        }
    });
    next();
});

// Rate limiting - prevent spam
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize SQLite Database
console.log('🔄 Initializing database...');
const db = new sqlite3.Database('./predictions.db', (err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Connected to SQLite database');
        
        // ✅ PRAGMA commands go here (after db is initialized)
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA busy_timeout = 5000');
        db.run('PRAGMA synchronous = NORMAL');
    }
});

// Create tables if they don't exist
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        wallet_address TEXT UNIQUE,
        username TEXT,
        password_hash TEXT,
        points INTEGER DEFAULT 1000,
        total_tournaments INTEGER DEFAULT 0,
        won_tournaments INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Error creating users table:', err);
        else console.log('✅ Users table ready');
    });

    // Tournaments table
    db.run(`CREATE TABLE IF NOT EXISTS tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        tournament_type TEXT NOT NULL,
        options TEXT NOT NULL,
        entry_fee INTEGER NOT NULL,
        max_participants INTEGER DEFAULT 100,
        prize_pool INTEGER DEFAULT 0,
        current_participants INTEGER DEFAULT 0,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        status TEXT DEFAULT 'pending',
        correct_answer TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Error creating tournaments table:', err);
        else console.log('✅ Tournaments table ready');
    });

    // Participants table
    db.run(`CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER,
        user_id INTEGER,
        prediction TEXT NOT NULL,
        points_paid INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id) REFERENCES tournaments (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`, (err) => {
        if (err) console.error('Error creating participants table:', err);
        else console.log('✅ Participants table ready');
    });

    // Create sample tournaments
    createSampleTournaments();
    createTestUsers();
});

// Create sample tournaments for testing
function createSampleTournaments() {
    const sampleTournaments = [
        {
            title: "Bitcoin Price Prediction - End of Week",
            category: "crypto",
            type: "yes_no",
            options: JSON.stringify(["Above $45,000", "Below $45,000"]),
            entry_fee: 100,
            max_participants: 50,
            start_time: new Date(Date.now() - 60000).toISOString(),
            end_time: new Date(Date.now() + 2 * 3600000).toISOString(),
            status: 'active'
        },
        {
            title: "Tesla Stock Movement Next Day",
            category: "stocks",
            type: "multiple_choice",
            options: JSON.stringify(["Up 3%+", "Down 3%+", "Sideways (-3% to +3%)"]),
            entry_fee: 150,
            max_participants: 30,
            start_time: new Date(Date.now() - 60000).toISOString(),
            end_time: new Date(Date.now() + 4 * 3600000).toISOString(),
            status: 'active'
        },
        {
            title: "Next US Fed Interest Rate Decision",
            category: "politics",
            type: "multiple_choice",
            options: JSON.stringify(["Increase 0.25%", "Keep Same", "Decrease 0.25%"]),
            entry_fee: 200,
            max_participants: 40,
            start_time: new Date(Date.now() - 60000).toISOString(),
            end_time: new Date(Date.now() + 6 * 3600000).toISOString(),
            status: 'active'
        },
        {
            title: "Ethereum vs Solana Market Cap",
            category: "crypto",
            type: "yes_no",
            options: JSON.stringify(["Ethereum higher", "Solana higher"]),
            entry_fee: 75,
            max_participants: 25,
            start_time: new Date(Date.now() - 60000).toISOString(),
            end_time: new Date(Date.now() + 5 * 3600000).toISOString(),
            status: 'active'
        },
        {
            title: "Apple Stock Prediction",
            category: "stocks",
            type: "multiple_choice",
            options: JSON.stringify(["Up 5%+", "Down 5%+", "Flat"]),
            entry_fee: 120,
            max_participants: 60,
            start_time: new Date(Date.now() - 60000).toISOString(),
            end_time: new Date(Date.now() + 3 * 3600000).toISOString(),
            status: 'active'
        }
    ];

    sampleTournaments.forEach(tournament => {
        db.run(`INSERT OR IGNORE INTO tournaments
            (title, category, tournament_type, options, entry_fee, max_participants, start_time, end_time, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tournament.title, tournament.category, tournament.type,
             tournament.options, tournament.entry_fee, tournament.max_participants,
             tournament.start_time, tournament.end_time, tournament.status],
            function(err) {
                if (err) {
                    console.error('Error inserting tournament:', err);
                } else if (this.changes > 0) {
                    console.log(`Created tournament: ${tournament.title}`);
                }
            }
        );
    });
}

// Create test users for demo
function createTestUsers() {
    const testUsers = [
        { email: 'demo@test.com', username: 'DemoUser', points: 2500 },
        { email: 'alice@test.com', username: 'Alice', points: 1800 },
        { email: 'bob@test.com', username: 'Bob', points: 3200 }
    ];

    testUsers.forEach(user => {
        db.run(`INSERT OR IGNORE INTO users (email, username, points) VALUES (?, ?, ?)`,
            [user.email, user.username, user.points],
            function(err) {
                if (this.changes > 0) {
                    console.log(`✅ Created test user: ${user.username}`);
                }
            }
        );
    });
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'mvp-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.userId = user.userId;
        next();
    });
};

// API Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// User Registration
app.post('/api/auth/register', async (req, res) => {
    console.log('📝 Registration attempt:', req.body);
    const { email, wallet_address, username, password } = req.body;

    try {
        // Debug: Check what's missing
        if (!email && !wallet_address) {
            console.log('❌ Missing email or wallet');
            return res.status(400).json({ error: 'Email or wallet address required' });
        }

        if (!username) {
            console.log('❌ Missing username');
            return res.status(400).json({ error: 'Username required' });
        }

        console.log('✅ Validation passed, creating user...');

        // Simplified insert (skip password for now)
        db.run('INSERT INTO users (email, username, points) VALUES (?, ?, 1000)',
            [email || null, username], function(err) {
            if (err) {
                console.error('❌ Database error:', err);
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).json({ error: 'Username or email already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }

            console.log('✅ User created:', this.lastID);
            const token = jwt.sign(
                { userId: this.lastID }, 
                'mvp-secret-key',
                { expiresIn: '7d' }
            );

            res.json({
                token,
                user: {
                    id: this.lastID,
                    email: email || null,
                    username: username,
                    points: 1000
                }
            });
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// User Login - Updated to handle wallet-only login attempts
// User Login - Fixed version
app.post('/api/auth/login', async (req, res) => {
    console.log('🔐 Login attempt:', req.body);
    const { email, wallet_address, password } = req.body;

    if (!email && !wallet_address) {
        return res.status(400).json({ error: 'Email or wallet address required' });
    }

    const query = email ?
        'SELECT * FROM users WHERE email = ?' :
        'SELECT * FROM users WHERE wallet_address = ?';
    const param = email || wallet_address;

    db.get(query, [param], async (err, user) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
            console.log('❌ User not found:', param);
            return res.status(404).json({ error: 'User not found' });
        }

        // If user has password, check it
        if (user.password_hash && password) {
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid password' });
            }
        }

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET || 'mvp-secret-key',
            { expiresIn: '7d' }
        );

        console.log(`✅ User logged in: ${user.username || user.email}`);
        res.json({ token, user: { ...user, password_hash: undefined } });
    });
});

// Get Active Tournaments
app.get('/api/tournaments', (req, res) => {
    console.log('🏆 Fetching tournaments...');
    const category = req.query.category || 'all';

    let query = 'SELECT * FROM tournaments WHERE status IN ("pending", "active")';
    let params = [];

    if (category !== 'all') {
        query += ' AND category = ?';
        params.push(category);
    }

    query += ' ORDER BY created_at DESC';

    db.all(query, params, (err, tournaments) => {
        if (err) {
            console.error('Error fetching tournaments:', err);
            return res.status(500).json({ error: 'Failed to fetch tournaments' });
        }

        const formattedTournaments = tournaments.map(t => ({
            ...t,
            options: JSON.parse(t.options)
        }));

        console.log(`✅ Returning ${formattedTournaments.length} tournaments`);
        res.json(formattedTournaments);
    });
});

// Enter Tournament
app.post('/api/tournaments/:id/enter', authenticateToken, (req, res) => {
    const tournamentId = req.params.id;
    const { prediction } = req.body;
    const userId = req.userId;

    console.log(`🎯 User ${userId} entering tournament ${tournamentId} with prediction: ${prediction}`);

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Check tournament and user points
        db.get(`SELECT t.*, u.points FROM tournaments t, users u 
                WHERE t.id = ? AND u.id = ? AND t.status = "active"`,
            [tournamentId, userId], (err, data) => {

            if (err || !data) {
                db.run('ROLLBACK');
                return res.status(400).json({ error: 'Tournament not found or not active' });
            }

            if (data.points < data.entry_fee) {
                db.run('ROLLBACK');
                return res.status(400).json({ error: 'Insufficient points' });
            }

            if (data.current_participants >= data.max_participants) {
                db.run('ROLLBACK');
                return res.status(400).json({ error: 'Tournament full' });
            }

            // Check if already participated
            db.get('SELECT id FROM participants WHERE tournament_id = ? AND user_id = ?',
                [tournamentId, userId], (err, existing) => {

                if (existing) {
                    db.run('ROLLBACK');
                    return res.status(400).json({ error: 'Already participated' });
                }

                // Deduct points
                db.run('UPDATE users SET points = points - ?, total_tournaments = total_tournaments + 1 WHERE id = ?',
                    [data.entry_fee, userId], (err) => {

                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to deduct points' });
                    }

                    // Add participant
                    db.run(`INSERT INTO participants (tournament_id, user_id, prediction, points_paid) 
                            VALUES (?, ?, ?, ?)`,
                        [tournamentId, userId, prediction, data.entry_fee], (err) => {

                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to enter tournament' });
                        }

                        // Update tournament
                        db.run(`UPDATE tournaments SET 
                                current_participants = current_participants + 1,
                                prize_pool = prize_pool + ?
                                WHERE id = ?`,
                            [data.entry_fee, tournamentId], (err) => {

                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Failed to update tournament' });
                            }

                            db.run('COMMIT');
                            console.log(`✅ User ${userId} successfully entered tournament ${tournamentId}`);
                            res.json({ success: true, message: 'Successfully entered tournament' });
                        });
                    });
                });
            });
        });
    });
});

// Get User Stats
app.get('/api/user/stats', authenticateToken, (req, res) => {
    const userId = req.userId;

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const accuracy = user.total_tournaments > 0 ? 
            Math.round((user.won_tournaments / user.total_tournaments) * 100) : 0;

        const userStats = {
            ...user,
            password_hash: undefined, // Don't send password hash
            accuracy
        };

        res.json(userStats);
    });
});

// Admin Routes (for manual tournament management)

// Start Tournament
app.post('/api/admin/tournaments/:id/start', (req, res) => {
    const tournamentId = req.params.id;
    console.log(`🚀 Starting tournament ${tournamentId}`);

    db.run('UPDATE tournaments SET status = "active" WHERE id = ? AND status = "pending"',
        [tournamentId], function(err) {
        if (err) {
            console.error('Error starting tournament:', err);
            return res.status(500).json({ error: 'Failed to start tournament' });
        }
        console.log(`✅ Tournament ${tournamentId} started`);
        res.json({ success: true, message: 'Tournament started' });
    });
});

// Resolve Tournament
app.post('/api/admin/tournaments/:id/resolve', (req, res) => {
    const tournamentId = req.params.id;
    const { correct_answer } = req.body;

    console.log(`🏁 Resolving tournament ${tournamentId} with answer: ${correct_answer}`);

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Update tournament
        db.run('UPDATE tournaments SET status = "resolved", correct_answer = ? WHERE id = ?',
            [correct_answer, tournamentId], (err) => {

            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Failed to resolve tournament' });
            }

            // Get winners and prize pool
            db.all(`SELECT p.user_id, t.prize_pool, COUNT(*) OVER() as winner_count
                    FROM participants p
                    JOIN tournaments t ON p.tournament_id = t.id
                    WHERE p.tournament_id = ? AND p.prediction = ?`,
                [tournamentId, correct_answer], (err, winners) => {

                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to get winners' });
                }

                if (winners.length === 0) {
                    db.run('COMMIT');
                    console.log(`🏁 Tournament ${tournamentId} resolved, no winners`);
                    return res.json({ success: true, message: 'Tournament resolved, no winners' });
                }

                // Distribute prizes
                const prizePerWinner = Math.floor(winners[0].prize_pool / winners.length);

                let completed = 0;
                winners.forEach(winner => {
                    db.run('UPDATE users SET points = points + ?, won_tournaments = won_tournaments + 1 WHERE id = ?',
                        [prizePerWinner, winner.user_id], (err) => {
                        completed++;
                        if (completed === winners.length) {
                            db.run('COMMIT');
                            console.log(`✅ Tournament ${tournamentId} resolved, ${winners.length} winners got ${prizePerWinner} points each`);
                            res.json({
                                success: true,
                                message: `Tournament resolved, ${winners.length} winners`,
                                prize_per_winner: prizePerWinner
                            });
                        }
                    });
                });
            });
        });
    });
});

// Automated Tournament Management (runs every minute)
cron.schedule('* * * * *', () => {
    console.log('⏰ Cron job starting...');
    const now = new Date().toISOString();
    
    // Auto-start tournaments
    db.run(`UPDATE tournaments SET status = 'active' 
            WHERE status = 'pending' AND start_time <= ?`, [now]);
    
    // Auto-close tournaments  
    db.run(`UPDATE tournaments SET status = 'closed' 
            WHERE status = 'active' AND end_time <= ?`, [now]);
}, {
    scheduled: true
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('💥 Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log('\n🚀 =====================================');
    console.log(`   Predictions API Server Started`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Log Level: ${isProduction ? 'Production' : 'Development'}`);
    console.log('🚀 =====================================\n');
    console.log('📋 Test Users Available:');
    console.log('   - demo@test.com');
    console.log('   - alice@test.com');
    console.log('   - bob@test.com\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('✅ Database connection closed');
        }
        process.exit(0);
    });
});