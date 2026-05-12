import { initAuth, loginWithGoogle, logout } from './auth.js';
import { initUI, renderExpenses, renderSummary } from './ui.js';
import { setLoading } from './utils.js';

const authView = document.getElementById('auth-view');
const mainView = document.getElementById('main-view');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userNameSpan = document.getElementById('user-name');

const onAuthStateChanged = (user) => {
    setLoading(false);
    if (user) {
        authView.classList.add('hidden');
        mainView.classList.remove('hidden');
        userNameSpan.textContent = `Welcome, ${user.displayName || user.email}`;
        
        // Initial load
        renderExpenses();
        renderSummary();
    } else {
        authView.classList.remove('hidden');
        mainView.classList.add('hidden');
    }
};

// Start the app
const init = () => {
    setLoading(true);
    
    // Initialize UI listeners
    initUI();
    
    // Initialize Auth listener
    initAuth(onAuthStateChanged);
    
    // Auth button listeners
    loginBtn.addEventListener('click', loginWithGoogle);
    logoutBtn.addEventListener('click', logout);
};

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', init);
