// server.js - Complete Backend Server for Predictions App
// This handles all API endpoints, database operations, and tournament management

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();
const isProduction = process.env.NODE_ENV === 'production';
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
// Configure CORS dynamically based on environment
const raw = process.env.CORS_ORIGIN || '';
const allowedOrigins = raw.split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
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
  max: 100,                 // limit each IP to 100 requests / window
  standardHeaders: true,    // adds RateLimit-* headers
  legacyHeaders: false,     // disables X-RateLimit-* (old)
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------- Postgres ----------
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }   // Render requires SSL
});

pool.on('connect', () => console.log('🐘 Postgres connected'));
pool.on('error',  err => console.error('❌ Postgres pool error', err));

// Helper: make sure options is always an array
function fmt(t) {
if (t.options && typeof t.options === 'string') t.options = JSON.parse(t.options);
return t;
}

// ----------  CREATE TABLES (idempotent) ----------
(async () => {
  try {
    /* 1.  users (unchanged) */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id               SERIAL PRIMARY KEY,
        email            TEXT UNIQUE,
        wallet_address   TEXT UNIQUE,
        username         TEXT,
        password_hash    TEXT,
        points           INTEGER DEFAULT 1000,
        total_tournaments INTEGER DEFAULT 0,
        won_tournaments  INTEGER DEFAULT 0,
        last_claim_date  TIMESTAMP,
        created_at       TIMESTAMP DEFAULT NOW()
      )`);

    /* 2.  tournament_types  – NEW */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_types (
        id          SERIAL PRIMARY KEY,
        name        TEXT UNIQUE NOT NULL,
        description TEXT
      )`);

    /* 3.  seed the types we actually use */
    await pool.query(`
      INSERT INTO tournament_types (name, description) VALUES
        ('prediction', 'Classic yes/no or multiple-choice prediction'),
        ('tournament', 'Head-to-head bracket-style tournament'),
        ('contest',    'Creative or photo contests')
      ON CONFLICT (name) DO NOTHING`);

    /* 4.  tournaments – drop old text column, add FK once */
    await pool.query(`
      ALTER TABLE tournaments
        ADD COLUMN IF NOT EXISTS tournament_type_id INTEGER
          REFERENCES tournament_types(id)
          ON UPDATE CASCADE ON DELETE RESTRICT`);

    /* 5.  migrate any old rows (tournament_type text → FK) */
    await pool.query(`
      UPDATE tournaments t
      SET    tournament_type_id = tt.id
      FROM   tournament_types tt
      WHERE  tt.name = COALESCE(t.tournament_type, 'prediction')
        AND  t.tournament_type_id IS NULL`);

    /* 6.  drop the obsolete text column */
    await pool.query(`
      ALTER TABLE tournaments
        DROP COLUMN IF EXISTS tournament_type`);

    /* 7.  make FK non-nullable from now on */
    await pool.query(`
      ALTER TABLE tournaments
        ALTER COLUMN tournament_type_id SET NOT NULL`);

    /* 8.  rest of your original tables */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id             SERIAL PRIMARY KEY,
        tournament_id  INTEGER REFERENCES tournaments(id),
        user_id        INTEGER REFERENCES users(id),
        prediction     TEXT NOT NULL,
        points_paid    INTEGER NOT NULL,
        created_at     TIMESTAMP DEFAULT NOW()
      )`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id          SERIAL PRIMARY KEY,
        title       TEXT NOT NULL,
        description TEXT,
        location    TEXT NOT NULL,
        start_time  TIMESTAMP NOT NULL,
        end_time    TIMESTAMP NOT NULL,
        capacity    INTEGER DEFAULT 100,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      )`);

    console.log('✅ All tables ready');
    await createSampleTournaments(); // we update this next
    await createTestUsers();
  } catch (err) {
    console.error('❌ DB init error:', err);
  }
})();

// Create sample tournaments for testing
async function createSampleTournaments() {
  /* get the FK id for “prediction” once */
  const { rows: [typeRow] } = await pool.query(
    'SELECT id FROM tournament_types WHERE name = $1',
    ['prediction']
  );
  if (!typeRow) throw new Error('tournament_type “prediction” not found');

  const sampleTournaments = [
    {
      title: 'Bitcoin Price Prediction - End of Week',
      category: 'crypto',
      options: JSON.stringify(['Above $45,000', 'Below $45,000']),
      entry_fee: 100,
      max_participants: 50,
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: new Date(Date.now() + 2 * 3600000).toISOString(),
      status: 'active'
    },
    {
      title: 'Tesla Stock Movement Next Day',
      category: 'stocks',
      options: JSON.stringify(['Up 3%+', 'Down 3%+', 'Sideways (-3% to +3%)']),
      entry_fee: 150,
      max_participants: 30,
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: new Date(Date.now() + 4 * 3600000).toISOString(),
      status: 'active'
    },
    {
      title: 'Next US Fed Interest Rate Decision',
      category: 'politics',
      options: JSON.stringify(['Increase 0.25%', 'Keep Same', 'Decrease 0.25%']),
      entry_fee: 200,
      max_participants: 40,
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: new Date(Date.now() + 6 * 3600000).toISOString(),
      status: 'active'
    },
    {
      title: 'Ethereum vs Solana Market Cap',
      category: 'crypto',
      options: JSON.stringify(['Ethereum higher', 'Solana higher']),
      entry_fee: 75,
      max_participants: 25,
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: new Date(Date.now() + 5 * 3600000).toISOString(),
      status: 'active'
    },
    {
      title: 'Apple Stock Prediction',
      category: 'stocks',
      options: JSON.stringify(['Up 5%+', 'Down 5%+', 'Flat']),
      entry_fee: 120,
      max_participants: 60,
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: new Date(Date.now() + 3 * 3600000).toISOString(),
      status: 'active'
    }
  ];

  for (const t of sampleTournaments) {
    await pool.query(
      `INSERT INTO tournaments
         (title, category, tournament_type_id, options,
          entry_fee, max_participants,
          start_time, end_time, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (title) DO NOTHING`,
      [
        t.title,
        t.category,
        typeRow.id, // ← FK instead of text
        t.options,
        t.entry_fee,
        t.max_participants,
        t.start_time,
        t.end_time,
        t.status
      ]
    );
    console.log('Created tournament:', t.title);
  }
}

// Create test users for demo
async function createTestUsers() {
    const testUsers = [
        { email: 'demo@test.com', username: 'DemoUser', points: 2500 },
        { email: 'alice@test.com', username: 'Alice', points: 1800 },
        { email: 'bob@test.com', username: 'Bob', points: 3200 }
    ];

    for (const user of testUsers) {
        const { rows: [result] } = await pool.query(
            `INSERT INTO users (email, username, points)
            VALUES ($1, $2, $3)
            ON CONFLICT (email) DO NOTHING
            RETURNING id, email, username`,
            [
                user.email,
                user.username,
                user.points
            ]
        );
        
        if (result) {
            console.log('✅ Created test user:', user.username);
        }
    };
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
            console.error('❌ Token verification error:', {
                name: err.name,
                message: err.message,
                token: token,  // Log the problematic token for debugging
                timestamp: new Date().toISOString()
            });
            
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            return res.status(403).json({ error: 'Invalid token' });
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

        // Add password validation for email registrations
        if (email && password) {
            // Password validation: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!\-%*?&])[A-Za-z\d@$!\-%*?&]{8,}$/;
            if (!passwordRegex.test(password)) {
                console.log('❌ Invalid password format');
                return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character (@$!%*?&-)' });
            }
        }

        console.log('✅ Validation passed, creating user...');

        let password_hash = null;
        if (email && password) {
            password_hash = await bcrypt.hash(password, 10);
        }

        const { rows: [newUser] } = await pool.query(
            'INSERT INTO users (email, username, password_hash, points) VALUES ($1, $2, $3, 1000) RETURNING id, email, username, points',
            [email || null, username, password_hash]
        );
        
        if (!newUser) {
            return res.status(500).json({ error: 'Failed to create user' });
        }

        console.log('✅ User created:', newUser.id);
        const token = jwt.sign(
            { userId: newUser.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            user: {
                id: newUser.id,
                email: newUser.email,
                username: newUser.username,
                points: newUser.points
            }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// User Login - Updated to handle wallet-only login attempts
// User Login - Updated to support username or email
app.post('/api/auth/login', async (req, res) => {
    console.log('🔐 Login attempt:', req.body);
    const { identifier, wallet_address, password } = req.body;
    const useWallet = wallet_address && !identifier;

    if (!identifier && !wallet_address) {
        return res.status(400).json({ error: 'Identifier (username/email) or wallet address required' });
    }

    let query;
    let params;

    if (useWallet) {
        query = 'SELECT * FROM users WHERE wallet_address = $1';
        params = [wallet_address];
    } else {
        // Check both username and email fields for identifier
        query = 'SELECT * FROM users WHERE username = $1 OR email = $2';
        params = [identifier, identifier];
    }

    try {
        const { rows: [user] } = await pool.query(query, params);

        if (!user) {
            console.log('❌ User not found:', params[0]);
            return res.status(404).json({ error: 'User not found' });
        }

        // For non-wallet logins, require password validation
        if (!useWallet) {
            if (!user.password_hash) {
                console.log('❌ Password not set for user');
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid password' });
            }
        }

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log('✅ User logged in:', user.username || user.email || user.wallet_address);
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                points: user.points
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Token Refresh
app.post('/api/auth/refresh', (req, res) => {
    const refreshToken = req.body.refreshToken;
    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required' });
    }

    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, user) => {
        if (err) {
            console.error('❌ Refresh token verification error:', err);
            return res.status(403).json({ error: 'Invalid refresh token' });
        }
        
        // Generate new access token
        const accessToken = jwt.sign(
            { userId: user.userId },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );
        
        res.json({ token: accessToken });
    });
});

// Get Active Tournaments with filtering and pagination
app.get('/api/tournaments', async (req, res) => {
    const VALID_CATEGORIES = ['crypto', 'stocks', 'politics', 'all'];
    const DEFAULT_PAGE_SIZE = 20;
    const MAX_PAGE_SIZE = 100;

    try {
        // Parameter validation
        const category = VALID_CATEGORIES.includes(req.query.category)
            ? req.query.category
            : 'all';
            
        const page = parseInt(req.query.page) || 1;
        const pageSize = Math.min(
            parseInt(req.query.pageSize) || DEFAULT_PAGE_SIZE,
            MAX_PAGE_SIZE
        );

        // Base query construction
        const queryParams = [];
        let whereClause = 'WHERE status IN ($1, $2)';
        queryParams.push('pending', 'active');

        // Category filtering
        if (category !== 'all') {
            whereClause += ' AND category = $3';
            queryParams.push(category);
        }

        // Main data query
        const dataQuery = `
            SELECT
                t.id,
                t.title,
                t.category,
                t.tournament_type as "tournamentType",
                t.options,
                t.entry_fee as "entryFee",
                t.max_participants as "maxParticipants",
                t.prize_pool as "prizePool",
                t.current_participants as "currentParticipants",
                t.start_time as "startTime",
                t.end_time as "endTime",
                t.status,
                (t.end_time < NOW())::boolean as "expired",
                COUNT(p.*)::integer as "participantCount"
            FROM tournaments t
            LEFT JOIN participants p ON t.id = p.tournament_id
            ${whereClause}
            GROUP BY t.id
            ORDER BY t.created_at DESC
            LIMIT $${queryParams.length + 1}
            OFFSET $${queryParams.length + 2}
        `;

        // Count query for pagination
        const countQuery = `
            SELECT COUNT(*)
            FROM tournaments
            ${whereClause}
        `;

        // Execute parallel queries
        const [tournamentsResult, countResult] = await Promise.all([
            pool.query(dataQuery, [
                ...queryParams,
                pageSize,
                (page - 1) * pageSize
            ]),
            pool.query(countQuery, queryParams)
        ]);

        // Format options inline using PostgreSQL JSON functions
        const formattedTournaments = tournamentsResult.rows.map(t => ({
            ...t,
            options: JSON.parse(t.options)
        }));

        // Set cache headers
        res.set({
            'Cache-Control': 'public, max-age=60',
            'X-Total-Count': countResult.rows[0].count,
            'X-Page': page,
            'X-Page-Size': pageSize
        });

        // Structured logging
        console.log({
            event: 'tournaments_fetched',
            category,
            page,
            pageSize,
            count: formattedTournaments.length,
            total: countResult.rows[0].count,
            timestamp: new Date().toISOString()
        });

        res.json(formattedTournaments);
    } catch (error) {
        console.error('Tournaments endpoint error:', {
            error: error.message,
            stack: error.stack,
            queryParams: req.query,
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({
            error: 'Failed to fetch tournaments',
            reference: 'ERR_TOURNAMENTS_FETCH'
        });
    }
});

// GET /api/tournament-types  – list all types
app.get('/api/tournament-types', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM tournament_types ORDER BY id');
  res.json(rows);
});

// Enter Tournament
app.post('/api/tournaments/:id/enter', authenticateToken, async (req, res) => {
    const tournamentId = req.params.id;
    const { prediction } = req.body;
    const userId = req.userId;

    console.log('🎯 User', userId, 'entering tournament', tournamentId, 'with prediction:', prediction);
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Get tournament and user status
        const tournamentResult = await client.query(
            `SELECT
                t.*,
                u.points AS user_points
            FROM tournaments t
            JOIN users u ON u.id = $2
            WHERE t.id = $1 AND t.status = 'active'`,
            [tournamentId, userId]
        );

        if (tournamentResult.rows.length === 0) {
            throw new Error('Tournament not found or not active');
        }

        const tournament = tournamentResult.rows[0];
        
        // 2. Validate user can enter
        if (tournament.user_points < tournament.entry_fee) {
            throw new Error('Insufficient points');
        }

        if (tournament.current_participants >= tournament.max_participants) {
            throw new Error('Tournament full');
        }

        // 3. Check existing participation
        const existingResult = await client.query(
            'SELECT id FROM participants WHERE tournament_id = $1 AND user_id = $2',
            [tournamentId, userId]
        );

        if (existingResult.rows.length > 0) {
            throw new Error('Already participated');
        }

        // 4. Execute transaction
        await client.query(
            'UPDATE users SET points = points - $1 WHERE id = $2',
            [tournament.entry_fee, userId]
        );

        await client.query(
            `INSERT INTO participants
            (tournament_id, user_id, prediction, points_paid)
            VALUES ($1, $2, $3, $4)`,
            [
                tournamentId,
                userId,
                prediction,
                tournament.entry_fee
            ]
        );

        await client.query(
            `UPDATE tournaments SET
            current_participants = current_participants + 1,
            prize_pool = prize_pool + $1
            WHERE id = $2`,
            [tournament.entry_fee, tournamentId]
        );

        await client.query('COMMIT');
        client.release();
        console.log('User', userId, 'successfully entered tournament', tournamentId);
        res.json({ success: true, message: 'Successfully entered tournament' });
    } catch (err) {
        await client.query('ROLLBACK');
        client.release();
        console.error('❌ Tournament entry error:', err);
        const statusCode = err.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({
            error: err.message || 'Failed to enter tournament',
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Get User Stats
app.get('/api/user/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { rows: [user] } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const accuracy = user.total_tournaments > 0 ?
            Math.round((user.won_tournaments / user.total_tournaments) * 100) : 0;
        
        // Calculate time until next claim
        const lastClaim = user.last_claim_date ? new Date(user.last_claim_date) : null;
        const nextClaimAvailable = lastClaim ?
            new Date(lastClaim.getTime() + (24 * 60 * 60 * 1000)) :
            new Date();

        const userStats = {
            ...user,
            password_hash: undefined,
            accuracy,
            next_claim_available: nextClaimAvailable.toISOString()
        };

        res.json(userStats);
    } catch (error) {
        console.error('❌ Error fetching user stats:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Claim Free Points
app.post('/api/user/claim-free-points', authenticateToken, async (req, res) => {
    const userId = req.userId;
    const pointsToAdd = 500;
    const cooldownHours = 24;

    try {
        const { rows: [user] } = await pool.query('SELECT last_claim_date FROM users WHERE id = $1', [userId]);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const now = new Date();
        const lastClaim = user.last_claim_date ? new Date(user.last_claim_date) : null;
        
        if (lastClaim) {
            const hoursSinceClaim = Math.abs(now.getTime() - lastClaim.getTime()) / 36e5;
            if (hoursSinceClaim < cooldownHours) {
                const remainingHours = (cooldownHours - hoursSinceClaim).toFixed(1);
                return res.status(429).json({
                    error: 'Cooldown active',
                    details: `Wait ${remainingHours} hours before claiming again`,
                    next_claim_available: new Date(lastClaim.getTime() + (cooldownHours * 60 * 60 * 1000))
                });
            }
        }

        await pool.query({
            text: 'UPDATE users SET points = points + $1, last_claim_date = NOW() WHERE id = $2',
            values: [pointsToAdd, userId]
        });

        console.log('✅ User', userId, 'claimed', pointsToAdd, 'free points');
        res.json({
            success: true,
            points: pointsToAdd,
            next_claim_available: new Date(now.getTime() + (cooldownHours * 60 * 60 * 1000))
        });

    } catch (error) {
        console.error('❌ Points claim error:', error);
        res.status(500).json({ error: 'Failed to claim points' });
    }
});

// Admin Routes - Event/Tournament Management

// Events CRUD Operations
app.post('/api/events', authenticateToken, async (req, res) => {
    const { title, description, location, start_time, end_time, capacity } = req.body;
    
    try {
        const { rows: [newEvent] } = await pool.query(
            `INSERT INTO events
            (title, description, location, start_time, end_time, capacity)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [title, description, location, start_time, end_time, capacity]
        );
        
        res.status(201).json(newEvent);
    } catch (error) {
        console.error('Event creation error:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
});

app.get('/api/events', async (req, res) => {
    try {
        const { rows: events } = await pool.query(
            `SELECT * FROM events
            ORDER BY start_time DESC`
        );
        res.json(events);
    } catch (error) {
        console.error('Events fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

app.put('/api/events/:id', authenticateToken, async (req, res) => {
    const eventId = req.params.id;
    const updates = req.body;
    
    try {
        const { rows: [updatedEvent] } = await pool.query(
            `UPDATE events SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                location = COALESCE($3, location),
                start_time = COALESCE($4, start_time),
                end_time = COALESCE($5, end_time),
                capacity = COALESCE($6, capacity),
                updated_at = NOW()
            WHERE id = $7
            RETURNING *`,
            [
                updates.title,
                updates.description,
                updates.location,
                updates.start_time,
                updates.end_time,
                updates.capacity,
                eventId
            ]
        );
        
        if (!updatedEvent) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        res.json(updatedEvent);
    } catch (error) {
        console.error('Event update error:', error);
        res.status(500).json({ error: 'Failed to update event' });
    }
});

app.delete('/api/events/:id', authenticateToken, async (req, res) => {
    const eventId = req.params.id;
    
    try {
        const { rowCount } = await pool.query(
            'DELETE FROM events WHERE id = $1',
            [eventId]
        );
        
        if (rowCount === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Event deletion error:', error);
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// Create New Tournament Event
app.post('/api/admin/events', authenticateToken, async (req, res) => {
    const {
        title,
        description,
        category,
        event_type,
        location,
        options,
        entry_fee,
        max_participants,
        start_time,
        end_time,
        visibility
    } = req.body;

    try {
        const { rows: [newEvent] } = await pool.query(
            `INSERT INTO tournaments (
                title, description, category, event_type, location, options,
                entry_fee, max_participants, start_time, end_time, visibility
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                title,
                description,
                category,
                event_type,
                location,
                JSON.stringify(options),
                entry_fee,
                max_participants,
                start_time,
                end_time,
                visibility || 'public'
            ]
        );

        res.status(201).json({
            ...newEvent,
            options: JSON.parse(newEvent.options)
        });
    } catch (error) {
        console.error('Event creation error:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
});

// Update Event
app.put('/api/admin/events/:id', authenticateToken, async (req, res) => {
    const eventId = req.params.id;
    const updates = req.body;

    try {
        const { rows: [updatedEvent] } = await pool.query(
            `UPDATE tournaments SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                category = COALESCE($3, category),
                location = COALESCE($4, location),
                options = COALESCE($5, options),
                entry_fee = COALESCE($6, entry_fee),
                max_participants = COALESCE($7, max_participants),
                start_time = COALESCE($8, start_time),
                end_time = COALESCE($9, end_time),
                visibility = COALESCE($10, visibility),
                updated_at = NOW()
            WHERE id = $11
            RETURNING *`,
            [
                updates.title,
                updates.description,
                updates.category,
                updates.location,
                updates.options ? JSON.stringify(updates.options) : null,
                updates.entry_fee,
                updates.max_participants,
                updates.start_time,
                updates.end_time,
                updates.visibility,
                eventId
            ]
        );

        if (!updatedEvent) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({
            ...updatedEvent,
            options: JSON.parse(updatedEvent.options)
        });
    } catch (error) {
        console.error('Event update error:', error);
        res.status(500).json({ error: 'Failed to update event' });
    }
});

// Resolve Tournament
app.post('/api/admin/tournaments/:id/resolve', async (req, res) => {
    const tournamentId = req.params.id;
    const { correct_answer } = req.body;
    const client = await pool.connect();

    console.log('🏁 Resolving tournament', tournamentId, 'with answer:', correct_answer);

    try {
        await client.query('BEGIN');

        // Update tournament status
        await client.query(
            'UPDATE tournaments SET status = $1, correct_answer = $2 WHERE id = $3',
            ['resolved', correct_answer, tournamentId]
        );

        // Get winners and prize pool
        const winners = await client.query(
            `SELECT p.user_id, t.prize_pool, COUNT(*) OVER() as winner_count
             FROM participants p
             JOIN tournaments t ON p.tournament_id = t.id
             WHERE p.tournament_id = $1 AND p.prediction = $2`,
            [tournamentId, correct_answer]
        );

        if (winners.rows.length === 0) {
            await client.query('COMMIT');
            console.log('🏁 Tournament', tournamentId, 'resolved, no winners');
            return res.json({ success: true, message: 'Tournament resolved, no winners' });
        }

        const prizePerWinner = Math.floor(winners.rows[0].prize_pool / winners.rows.length);
        
        // Update winners' points
        for (const winner of winners.rows) {
            await client.query(
                'UPDATE users SET points = points + $1, won_tournaments = won_tournaments + 1 WHERE id = $2',
                [prizePerWinner, winner.user_id]
            );
        }

        await client.query('COMMIT');
        console.log(`✅ Tournament ${tournamentId} resolved with ${winners.rows.length} winners`);
        res.json({
            success: true,
            message: `Tournament resolved with ${winners.rows.length} winners`,
            prize_per_winner: prizePerWinner
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Tournament resolution error:', err);
        res.status(500).json({ error: 'Failed to resolve tournament' });
    } finally {
        client.release();
    }
});

// Automated Tournament Management (runs every minute)
cron.schedule('* * * * *', async () => {
    console.log('⏰ Cron job starting...');
    const now = new Date().toISOString();
    
    try {
        // Update pending tournaments to active
        const startResult = await pool.query(
            `UPDATE tournaments
            SET status = 'active'
            WHERE status = 'pending' AND start_time <= $1`,
            [now]
        );
        
        // Close expired active tournaments
        const closeResult = await pool.query(
            `UPDATE tournaments
            SET status = 'closed'
            WHERE status = 'active' AND end_time <= $1`,
            [now]
        );
        
        console.log(`Automated updates - Started: ${startResult.rowCount}, Closed: ${closeResult.rowCount}`);
    } catch (err) {
        console.error('Cron job error:', err);
    }
}, {
    scheduled: true,
    timezone: 'Europe/Madrid'
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
    console.log('   Predictions API Server Started');
    console.log('   Port:', PORT);
    console.log('   Environment:', process.env.NODE_ENV || 'development');
    console.log('   Log Level:', isProduction ? 'Production' : 'Development');
    console.log('🚀 =====================================\n');
    console.log('📋 Test Users Available:');
    console.log('   - demo@test.com');
    console.log('   - alice@test.com');
    console.log('   - bob@test.com\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    pool.end((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('✅ Database connection closed');
        }
        process.exit(0);
    });
});