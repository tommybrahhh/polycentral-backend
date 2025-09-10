// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001/api' 
    : 'https://polycentral-backend.onrender.com/api';
    
// Global State
let currentUser = null;
let authToken = localStorage.getItem('auth_token') || null;
let tournaments = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('App initializing...');
    
    // Check if user is already logged in
    if (authToken) {
        loadUserData();
    }
    
    // Load tournaments from backend
    loadTournaments();
    
    // Initialize timers
    updateDailyTimer();
    setInterval(updateDailyTimer, 60000);
    
    // Initialize tournament tabs
    initializeTournamentTabs();
    
    // Refresh tournaments every 60 seconds
    setInterval(() => {
        loadTournaments();
    }, 60000);
});

// Connect wallet functionality (now with backend integration)
window.connectWallet = async function() {
    // Show connection options modal instead of direct MetaMask
    showConnectionOptionsModal();
};

// Show connection options modal
function showConnectionOptionsModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0, 0, 0, 0.8)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header">
                <h3>Connect to PolyCentral</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div style="text-align: center; margin-bottom: 20px;">
                    <p style="color: #A5A5A5; margin-bottom: 20px;">Choose your preferred connection method:</p>
                </div>
                
                <div class="connection-options" style="display: flex; flex-direction: column; gap: 15px;">
                    <button onclick="connectWithMetaMask()" class="connection-option" style="
                        width: 100%;
                        padding: 15px;
                        border: 2px solid #FF6F00;
                        border-radius: 8px;
                        background: transparent;
                        color: #FF6F00;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                    " onmouseover="this.style.background='#FF6F00'; this.style.color='white'" 
                       onmouseout="this.style.background='transparent'; this.style.color='#FF6F00'">
                        🦊 Connect with MetaMask
                    </button>
                    
                    <button onclick="connectWithEmail()" class="connection-option" style="
                        width: 100%;
                        padding: 15px;
                        border: 2px solid #A5FF90;
                        border-radius: 8px;
                        background: transparent;
                        color: #A5FF90;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                    " onmouseover="this.style.background='#A5FF90'; this.style.color='black'" 
                       onmouseout="this.style.background='transparent'; this.style.color='#A5FF90'">
                        ✉️ Continue with Email
                    </button>
                </div>
                
                <p style="text-align: center; margin-top: 20px; font-size: 12px; color: #666;">
                    By connecting, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Connect with MetaMask specifically
window.connectWithMetaMask = async function() {
    try {
        if (typeof window.ethereum === 'undefined') {
            alert('MetaMask is not installed. Please install MetaMask extension first.');
            return;
        }
        
        console.log('Attempting MetaMask connection...');
        
        // Request account access
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });
        
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found');
        }
        
        const wallet_address = accounts[0];
        console.log('MetaMask wallet connected:', wallet_address);
        
        // Close the connection options modal
        closeModal();
        
        // Try to login with wallet address first
        try {
            await loginUser({ wallet_address });
            console.log('Existing wallet user logged in');
        } catch (loginError) {
            console.log('Wallet not registered, showing registration modal...');
            // If login fails, show registration modal with wallet address
            showWalletRegistrationModal(wallet_address);
        }
        
    } catch (error) {
        console.error('MetaMask connection failed:', error);
        
        if (error.code === 4001) {
            // User rejected the request
            alert('MetaMask connection was cancelled');
        } else if (error.code === -32002) {
            // Request already pending
            alert('MetaMask connection request already pending. Please check MetaMask.');
        } else {
            alert('MetaMask connection failed: ' + error.message);
        }
    }
};

// Show wallet registration modal (for new MetaMask users)
function showWalletRegistrationModal(wallet_address) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0, 0, 0, 0.8)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h3>Complete Your Registration</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 20px; color: #A5A5A5;">
                    Wallet connected! Please choose a username to complete registration.
                </p>
                <p style="margin-bottom: 15px; font-size: 12px; color: #666;">
                    <strong>Wallet:</strong> ${wallet_address.slice(0, 6)}...${wallet_address.slice(-4)}
                </p>
                
                <div id="wallet-registration-form">
                    <input type="text" id="wallet-username-input" placeholder="Choose username" required
                           style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="button" id="wallet-register-btn" class="btn-claim-daily" style="flex: 1;">Complete Registration</button>
                        <button type="button" onclick="closeModal()" class="btn-secondary" style="flex: 1; background: #666;">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listener for wallet registration
    document.getElementById('wallet-register-btn').onclick = async () => {
        const username = document.getElementById('wallet-username-input').value;
        
        if (!username) {
            alert('Please enter a username');
            return;
        }
        
        try {
            await registerUser({ wallet_address, username });
            closeModal();
        } catch (error) {
            alert('Registration failed: ' + error.message);
        }
    };
}

// Connect with Email
window.connectWithEmail = function() {
    closeModal(); // Close connection options modal
    showEmailLoginModal();
};

// Show email login modal
function showEmailLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0, 0, 0, 0.8)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h3>Login</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div id="email-auth-form">
                    <input type="text" id="login-input" placeholder="Username or Email" required
                           style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
                    <input type="password" id="password-input" placeholder="Password" required
                           style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="button" id="login-btn" class="btn-claim-daily" style="flex: 1;">Login</button>
                        <button type="button" onclick="closeModal()" class="btn-secondary" style="flex: 1; background: #666;">Cancel</button>
                    </div>
                </div>
                <p style="text-align: center; margin-top: 15px; font-size: 14px; color: #666;">
                    New user? <a href="#" onclick="switchToRegister()" style="color: #007bff; text-decoration: none;">Register here</a>
                </p>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listener for login button
    document.getElementById('login-btn').onclick = async (e) => {
        e.preventDefault();
        const identifier = document.getElementById('login-input').value;
        const password = document.getElementById('password-input').value;
        
        if (!identifier || !password) {
            alert('Please fill in all fields');
            return;
        }
        
        try {
            await loginUser({ identifier, password });
            closeModal();
        } catch (error) {
            alert('Login failed: ' + error.message);
        }
    };
}

// Switch to register mode
window.switchToRegister = function() {
    const form = document.getElementById('email-auth-form');
    form.innerHTML = `
        <input type="email" id="email-input" placeholder="Enter your email" required
               style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
        <input type="text" id="username-input" placeholder="Choose username" required
               style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
        <input type="password" id="password-input" placeholder="Password" required
               style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;"
               oninput="validatePassword()">
        <div id="password-strength" style="font-size: 12px; margin: 0 0 10px 0;">
            <div id="length" style="color: #ff6f00;">• 8+ characters</div>
            <div id="upper" style="color: #ff6f00;">• Uppercase letter</div>
            <div id="lower" style="color: #ff6f00;">• Lowercase letter</div>
            <div id="digit" style="color: #ff6f00;">• Digit</div>
            <div id="special" style="color: #ff6f00;">• Special character</div>
        </div>
        <input type="password" id="confirm-password-input" placeholder="Confirm Password" required
               style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;"
               oninput="validatePassword()">
        <div id="password-match" style="font-size: 12px; color: #ff6f00; margin-bottom: 10px; display: none;">
            Passwords must match
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button type="button" id="register-btn" class="btn-claim-daily" style="flex: 1;" disabled>Register</button>
            <button type="button" onclick="closeModal()" class="btn-secondary" style="flex: 1; background: #666;">Cancel</button>
        </div>
    `;
    
    document.getElementById('register-btn').onclick = async (e) => {
        e.preventDefault();
        const email = document.getElementById('email-input').value;
        const username = document.getElementById('username-input').value;
        const password = document.getElementById('password-input').value;
        const confirmPassword = document.getElementById('confirm-password-input').value;
        
        if (!email || !username || !password || !confirmPassword) {
            alert('Please fill in all fields');
            return;
        }
        
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        try {
            await registerUser({ email, username, password });
            closeModal();
        } catch (error) {
            alert('Registration failed: ' + error.message);
        }
    };
};

// Switch to login mode
window.switchToLogin = function() {
    const form = document.getElementById('email-auth-form');
    form.innerHTML = `
        <input type="email" id="email-input" placeholder="Enter your email" required 
               style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button type="button" id="login-btn" class="btn-claim-daily" style="flex: 1;">Login</button>
            <button type="button" onclick="closeModal(this)" class="btn-secondary" style="flex: 1; background: #666;">Cancel</button>
        </div>
    `;
    
    document.getElementById('login-btn').onclick = async (e) => {
        e.preventDefault();
        const email = document.getElementById('email-input').value;
        
        if (!email) {
            alert('Please enter your email');
            return;
        }
        
        try {
            await loginUser({ email });
            closeModal();
        } catch (error) {
            alert('Login failed: ' + error.message);
        }
    };
};

// Close modal
window.closeModal = function(button) {
    const modal = button ? button.closest('.modal-overlay') : document.querySelector('.modal-overlay');
    if (modal) document.body.removeChild(modal);
};

// Register user
async function registerUser(userData) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('auth_token', authToken);
        
        console.log('User registered:', currentUser.username || currentUser.email);
        updateUserInterface();
        loadTournaments();
        
        // Show success notification
        showSuccessNotification();
        
    } catch (error) {
        console.error('Registration error:', error);
        throw error;
    }
}

// Show success notification after registration
function showSuccessNotification() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0, 0, 0, 0.8)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div class="modal-header">
                <h3>Registration Successful!</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div style="font-size: 48px; color: #A5FF90; margin: 20px 0;">✓</div>
                <p>Your account has been created successfully.</p>
                <p>You can now log in to start playing.</p>
            </div>
            <div class="modal-footer">
                <button class="btn-claim-daily" onclick="closeModal()" style="margin: 0 auto;">
                    Continue
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Password validation logic
window.validatePassword = function() {
    const password = document.getElementById('password-input')?.value || '';
    const confirmPassword = document.getElementById('confirm-password-input')?.value || '';
    const registerBtn = document.getElementById('register-btn');
    const matchError = document.getElementById('password-match');
    const strengthDiv = document.getElementById('password-strength');
    
    if (!strengthDiv) return;
    
    // Password strength criteria
    const hasMinLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const passwordsMatch = password === confirmPassword;
    
    // Update strength indicators
    document.getElementById('length').style.color = hasMinLength ? '#A5FF90' : '#ff6f00';
    document.getElementById('upper').style.color = hasUpperCase ? '#A5FF90' : '#ff6f00';
    document.getElementById('lower').style.color = hasLowerCase ? '#A5FF90' : '#ff6f00';
    document.getElementById('digit').style.color = hasDigit ? '#A5FF90' : '#ff6f00';
    document.getElementById('special').style.color = hasSpecial ? '#A5FF90' : '#ff6f00';
    
    // Update match indicator
    if (matchError) {
        if (confirmPassword && !passwordsMatch) {
            matchError.style.display = 'block';
        } else {
            matchError.style.display = 'none';
        }
    }
    
    // Enable/disable register button
    if (registerBtn) {
        const isValid = hasMinLength && hasUpperCase && hasLowerCase && hasDigit && hasSpecial && passwordsMatch;
        registerBtn.disabled = !isValid;
    }
}

// Login user
async function loginUser(credentials) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('auth_token', authToken);
        
        console.log('User logged in:', currentUser.username || currentUser.email);
        updateUserInterface();
        loadTournaments();
        
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

// Initialize password validation on load
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for any existing password fields
    const passwordInput = document.getElementById('password-input');
    const confirmPasswordInput = document.getElementById('confirm-password-input');
    
    if (passwordInput) {
        passwordInput.addEventListener('input', validatePassword);
    }
    
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', validatePassword);
    }
});

// Load user data from backend
async function loadUserData() {
    try {
        const response = await fetch(`${API_BASE_URL}/user/stats`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            currentUser = await response.json();
            updateUserInterface();
        } else {
            // Token invalid, clear auth
            authToken = null;
            currentUser = null;
            localStorage.removeItem('auth_token');
        }
    } catch (error) {
        console.error('Failed to load user data:', error);
    }
}

// Filter tournaments by category
window.filterTournaments = function(category) {
    // Update active button state
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.classList.contains(category)) {
            btn.classList.add('active');
        }
    });
    
    // Load tournaments with filter
    loadTournaments(category);
};

// Filter tournaments by category
window.filterTournaments = function(category) {
    // Update active button state
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.classList.contains(category)) {
            btn.classList.add('active');
        }
    });
    
    // Load tournaments with filter
    loadTournaments(category);
};

// Load tournaments from backend
async function loadTournaments(category = 'all') {
    try {
        const response = await fetch(`${API_BASE_URL}/tournaments?category=${category}`);
        if (response.ok) {
            tournaments = await response.json();
            displayTournaments();
            updateCategoryContent(category);
            console.log(`Loaded ${tournaments.length} tournaments for category: ${category}`);
        } else {
            console.error('Failed to load tournaments:', response.statusText);
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
    }
}

// Ensure "All" filter is active on initial load
document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('.category-filter-btn.all')?.classList.add('active');
});
// Display tournaments in UI
function displayTournaments() {
    if (tournaments.length === 0) return;
    
    // Update main tournament display
    if (tournaments.length > 0) {
        updateMainTournament(tournaments[0]);
    }
    
    // Update hot tournaments section (tournaments with high participation)
    const hotTournaments = tournaments
        .filter(t => t.current_participants > 5)
        .slice(0, 3);
    
    const hotTournamentsGrid = document.getElementById('hot-tournaments-grid');
    if (hotTournamentsGrid) {
        hotTournamentsGrid.style.display = hotTournaments.length > 0 ? 'block' : 'none';
        hotTournamentsGrid.innerHTML = `
            <h3 style="color: var(--primary); margin-bottom: 15px;">HOT TOURNAMENTS</h3>
            ${hotTournaments.map(tournament => `
                <div class="tournament-card hot-card" style="margin-bottom: 10px; padding: 15px; border: 1px solid #333; border-radius: 8px; background: var(--gradient-card);">
                    <div class="category-badge ${tournament.category}-badge">${tournament.category}</div>
                    <h5>${tournament.title}</h5>
                    <div style="display: flex; justify-content: space-between; margin: 5px 0;">
                        <span>${tournament.entry_fee} pts</span>
                        <span>${tournament.current_participants}/${tournament.max_participants}</span>
                    </div>
                    <button class="btn-enter-tournament" onclick="openTournamentModal('${tournament.id}')" style="width: 100%; margin-top: 5px;">
                        Enter
                    </button>
                </div>
            `).join('')}
        `;
    }
    
    // Update rising tournaments section (newer tournaments)
    const risingTournaments = tournaments
        .filter(t => t.current_participants <= 5)
        .slice(0, 3);
    
    const risingTournamentsGrid = document.getElementById('rising-tournaments-grid');
    if (risingTournamentsGrid) {
        risingTournamentsGrid.style.display = risingTournaments.length > 0 ? 'block' : 'none';
        risingTournamentsGrid.innerHTML = `
            <h3 style="color: var(--chart-1); margin-bottom: 15px;">RISING TOURNAMENTS</h3>
            ${risingTournaments.map(tournament => `
                <div class="tournament-card rising-card" style="margin-bottom: 10px; padding: 15px; border: 1px solid #333; border-radius: 8px; background: var(--gradient-card);">
                    <div class="category-badge ${tournament.category}-badge">${tournament.category}</div>
                    <h5>${tournament.title}</h5>
                    <div style="display: flex; justify-content: space-between; margin: 5px 0;">
                        <span>${tournament.entry_fee} pts</span>
                        <span>${tournament.current_participants}/${tournament.max_participants}</span>
                    </div>
                    <button class="btn-enter-tournament" onclick="openTournamentModal('${tournament.id}')" style="width: 100%; margin-top: 5px;">
                        Enter
                    </button>
                </div>
            `).join('')}
        `;
    }
}

// Update category content areas with real data
function updateCategoryContent(category) {
    // Hide all content areas
    document.querySelectorAll('.tournament-content-area').forEach(area => {
        area.classList.remove('active');
    });
    
    // Show selected category content
    const activeContent = document.getElementById(`content-${category}`);
    if (activeContent) {
        activeContent.classList.add('active');
        
        // Update category-specific tournaments
        const categoryTournaments = category === 'all' ? tournaments : tournaments.filter(t => t.category === category);
        const grid = activeContent.querySelector('.relevant-tournaments-grid');
        
        if (grid) {
            grid.innerHTML = categoryTournaments.map(tournament => `
                <div class="relevant-tournament-card" data-category="${tournament.category}">
                    <div class="category-badge ${tournament.category}-badge">${tournament.category}</div>
                    <h4 class="tournament-card-title">${tournament.title}</h4>
                    <div class="tournament-stats">
                        <div class="tournament-stat">
                            <span class="tournament-stat-value">${tournament.prize_pool}</span>
                            <span class="tournament-stat-label">Prize Pool</span>
                        </div>
                        <div class="tournament-stat">
                            <span class="tournament-stat-value">${tournament.current_participants}/${tournament.max_participants}</span>
                            <span class="tournament-stat-label">Players</span>
                        </div>
                    </div>
                    <button class="btn-enter-tournament" onclick="openTournamentModal('${tournament.id}')">
                        Enter Tournament
                    </button>
                </div>
            `).join('');
        }
    }
}

// Update main tournament display
function updateMainTournament(tournament) {
    const mainDisplay = document.querySelector('.main-tournament-display');
    if (!mainDisplay) return;
    
    mainDisplay.innerHTML = `
        <div class="tournament-display-label label-main">MAIN EVENT</div>
        <div class="tournament-header">
            <div>
                <h3 class="tournament-title">${tournament.title}</h3>
                <p class="tournament-subtitle">Live Tournament</p>
                <div class="category-badge ${tournament.category}-badge">${tournament.category}</div>
            </div>
            <div class="prize-pool">
                <span class="prize-amount">${tournament.prize_pool}</span>
                <span class="prize-usd">Points</span>
            </div>
        </div>
        
        <div class="tournament-stats">
            <div class="tournament-stat">
                <span class="tournament-stat-value">${tournament.current_participants}/${tournament.max_participants}</span>
                <span class="tournament-stat-label">Participants</span>
            </div>
            <div class="tournament-stat">
                <span class="tournament-stat-value">${tournament.entry_fee}</span>
                <span class="tournament-stat-label">Entry Fee</span>
            </div>
            <div class="tournament-stat">
                <span class="tournament-stat-value" id="main-countdown">--:--:--</span>
                <span class="tournament-stat-label">Time Left</span>
            </div>
        </div>
        
        <button class="btn-enter-tournament" onclick="openTournamentModal('${tournament.id}')">
            Enter Main Tournament
        </button>
    `;
    
    // Start countdown timer
    startCountdownTimer('main-countdown', new Date(tournament.end_time));
}

// Start countdown timer
function startCountdownTimer(elementId, endTime) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Clear any existing interval
    if (element.countdownInterval) {
        clearInterval(element.countdownInterval);
    }
    
    const updateTimer = () => {
        const now = new Date().getTime();
        const distance = new Date(endTime).getTime() - now;
        
        if (distance < 0) {
            element.textContent = "ENDED";
            clearInterval(element.countdownInterval);
            return;
        }
        
        const hours = Math.floor(distance / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        element.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };
    
    updateTimer();
    element.countdownInterval = setInterval(updateTimer, 1000);
}

// Open tournament modal (updated with real data)
window.openTournamentModal = function(tournamentId) {
    if (!authToken) {
        alert('Please login first to enter tournaments!');
        connectWallet();
        return;
    }
    
    const tournament = tournaments.find(t => t.id === parseInt(tournamentId));
    if (!tournament) {
        console.error('Tournament not found:', tournamentId);
        console.log('Available tournaments:', tournaments);
        alert('Tournament not found!');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0, 0, 0, 0.8)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Enter Tournament</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="category-badge ${tournament.category}-badge">${tournament.category}</div>
                <h4>${tournament.title}</h4>
                <p><strong>Entry Fee:</strong> ${tournament.entry_fee} points</p>
                <p><strong>Prize Pool:</strong> ${tournament.prize_pool} points</p>
                <p><strong>Participants:</strong> ${tournament.current_participants}/${tournament.max_participants}</p>
                <p><strong>Your Points:</strong> ${currentUser?.points || 0}</p>
                
                <div style="margin: 20px 0;">
                    <h5>Make Your Prediction:</h5>
                    <div class="prediction-options" style="margin-top: 10px;">
                        ${tournament.options.map(option => `
                            <label class="prediction-option" style="display: block; margin: 8px 0; cursor: pointer;">
                                <input type="radio" name="prediction" value="${option}" style="margin-right: 8px;">
                                <span>${option}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-claim-daily" onclick="enterTournament(${tournament.id})">
                    Enter Tournament (${tournament.entry_fee} points)
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
};

// Enter tournament (updated with backend API)
window.enterTournament = async function(tournamentId) {
    const prediction = document.querySelector('input[name="prediction"]:checked')?.value;
    if (!prediction) {
        alert('Please select a prediction!');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/tournaments/${tournamentId}/enter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ prediction })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Successfully entered tournament! Good luck!');
            closeModal();
            
            // Refresh user data and tournaments
            await loadUserData();
            await loadTournaments();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Entry failed:', error);
        alert('Failed to enter tournament. Please try again.');
    }
};

// Submit daily prediction (updated with real points)
window.submitDailyPrediction = function() {
    if (!authToken) {
        alert('Please login first!');
        connectWallet();
        return;
    }
    
    // Award 500 daily points (in real app, this would be a backend API call)
    if (currentUser) {
        const challengeCard = document.getElementById('daily-challenge');
        challengeCard.innerHTML = `
            <div class="challenge-success">
                <div class="success-icon">✅</div>
                <h3 class="success-title">Daily Points Claimed!</h3>
                <p class="success-message">You earned 500 points! Come back tomorrow for more.</p>
            </div>
        `;
        
        // In a real implementation, you'd call an API endpoint here
        // For now, just update the UI optimistically
        currentUser.points += 500;
        updateUserInterface();
    }
};

// Update user interface
function updateUserInterface() {
    console.log('Updating UI for user:', currentUser);
    
    if (currentUser) {
        document.getElementById('connect-btn').style.display = 'none';
        document.getElementById('user-section').style.display = 'flex';
        
        // Update points displays safely
        const userPointsEl = document.getElementById('user-points');
        const pointsBalanceEl = document.getElementById('points-balance');
        const accuracyEl = document.getElementById('accuracy-rate');
        const streakEl = document.getElementById('current-streak');
        const rankEl = document.getElementById('global-rank');
        
        if (userPointsEl) userPointsEl.textContent = `${currentUser.points.toLocaleString()} pts`;
        if (pointsBalanceEl) pointsBalanceEl.textContent = currentUser.points.toLocaleString();
        if (accuracyEl) accuracyEl.textContent = `${currentUser.accuracy || 0}%`;
        if (streakEl) streakEl.textContent = `${currentUser.won_tournaments || 0} Wins`;
        
        // Simple rank calculation
        const mockRank = Math.max(1, 100 - Math.floor(currentUser.points / 50));
        if (rankEl) rankEl.textContent = `#${mockRank}`;
        
        // Update user avatar with first letter
        const avatar = document.querySelector('.user-avatar');
        if (avatar) {
            avatar.textContent = (currentUser.username || currentUser.email || 'U')[0].toUpperCase();
        }
    } else {
        document.getElementById('connect-btn').style.display = 'block';
        document.getElementById('user-section').style.display = 'none';
    }
}

// Tournament category filtering
function initializeTournamentTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            tabBtns.forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');
            
            const category = this.dataset.category;
            loadTournaments(category);
        });
    });
}

// Category filtering functions
window.filterByCategory = function(category) {
    // Update active button state
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        }
    });
    
    // Load tournaments for category
    loadTournaments(category);
};

window.showTournamentType = function(type) {
    
    // Show relevant tournaments
    const hotGrid = document.getElementById('hot-tournaments-grid');
    const risingGrid = document.getElementById('rising-tournaments-grid');
    
    if (type === 'hot' && hotGrid) {
        hotGrid.style.display = 'block';
        hotGrid.scrollIntoView({ behavior: 'smooth' });
        // Hide rising grid
        if (risingGrid) risingGrid.style.display = 'none';
    } else if (type === 'rising' && risingGrid) {
        risingGrid.style.display = 'block';
        risingGrid.scrollIntoView({ behavior: 'smooth' });
        // Hide hot grid
        if (hotGrid) hotGrid.style.display = 'none';
    }
};

// User dropdown functionality
window.toggleUserDropdown = function() {
    if (!currentUser) return;
    
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
        dropdown.style.display = 'block';
        dropdown.innerHTML = `
            <div class="dropdown-content">
                <div class="dropdown-item">
                    <strong>Username:</strong> ${currentUser.username || 'N/A'}
                </div>
                <div class="dropdown-item">
                    <strong>Email:</strong> ${currentUser.email || 'N/A'}
                </div>
                <div class="dropdown-item">
                    <strong>Wallet:</strong> ${currentUser.wallet_address ? 
                        currentUser.wallet_address.slice(0, 6) + '...' + currentUser.wallet_address.slice(-4) : 
                        'Not connected'}
                </div>
                <div class="dropdown-item">
                    <strong>Tournaments:</strong> ${currentUser.total_tournaments}
                </div>
                <div class="dropdown-item">
                    <strong>Win Rate:</strong> ${currentUser.accuracy}%
                </div>
                <hr>
                <div class="dropdown-item" style="cursor: pointer;" onclick="disconnectWallet()">
                    Logout
                </div>
            </div>
        `;
    } else {
        dropdown.style.display = 'none';
    }
};

// Disconnect/logout
window.disconnectWallet = function() {
    currentUser = null;
    authToken = null;
    localStorage.removeItem('auth_token');
    
    document.getElementById('connect-btn').style.display = 'block';
    document.getElementById('user-section').style.display = 'none';
    document.getElementById('user-dropdown').style.display = 'none';
    
    console.log('User logged out');
};

// Update daily timer
function updateDailyTimer() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const timeLeft = tomorrow - now;
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    const timerElement = document.getElementById('daily-timer');
    if (timerElement) {
        timerElement.textContent = `${hours}h ${minutes}m left`;
    }
}

// Scroll to tournaments section
window.scrollToTournaments = function() {
    document.querySelector('.tournaments-section').scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
    });
};

// Placeholder functions for future features
window.openLeaderboard = function() {
    alert('Leaderboard feature coming soon in the next update!');
};

window.showPointsHistory = function() {
    alert('Points history feature coming soon!');
};

// Additional placeholder functions for HTML compatibility
window.logout = function() {
    disconnectWallet();
};

window.connectWithMetaMask = function() {
    connectWallet();
};

window.connectWithWalletConnect = function() {
    showEmailLoginModal();
};

window.connectWithEmail = function() {
    showEmailLoginModal();
};

window.showLoginModal = function() {
    showEmailLoginModal();
};

window.hideLoginModal = function() {
    closeModal();
};

window.openFullLeaderboard = function() {
    alert('Full leaderboard coming soon!');
};

// Console log for debugging
console.log('App.js loaded with backend integration');
console.log('API Base URL:', API_BASE_URL);