import { CONFIG } from './config.js';
import { showToast } from './utils.js';

// Initialize Firebase (Compat version)
firebase.initializeApp(CONFIG.FIREBASE);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

export const initAuth = (onAuthStateChanged) => {
    auth.onAuthStateChanged((user) => {
        onAuthStateChanged(user);
    });
};

export const loginWithGoogle = async () => {
    try {
        await auth.signInWithPopup(provider);
        showToast('Logged in successfully!');
    } catch (error) {
        console.error('Login error:', error);
        showToast('Login failed. Please try again.', true);
    }
};

export const logout = async () => {
    try {
        await auth.signOut();
        showToast('Logged out successfully!');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Logout failed.', true);
    }
};

export const getCurrentUser = () => auth.currentUser;
