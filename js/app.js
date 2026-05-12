import { initAuth, loginWithGoogle, logout } from './auth.js';
import { initUI, renderExpenses, renderSummary, renderAnalytics } from './ui.js';
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
        
        // Check if household key is already set
        const savedKey = localStorage.getItem('household_token');
        if (savedKey) {
            mainView.classList.remove('hidden');
            userNameSpan.textContent = `Welcome, ${user.displayName || user.email}`;
            renderExpenses();
            renderSummary();
            renderAnalytics();
        } else {
            document.getElementById('household-view').classList.remove('hidden');
        }
    } else {
        authView.classList.remove('hidden');
        mainView.classList.add('hidden');
        document.getElementById('household-view').classList.add('hidden');
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
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker registration failed', err));
        });
    }
});
