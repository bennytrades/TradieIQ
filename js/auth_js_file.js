// Authentication functions
import { auth } from './firebase-config.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

// Google provider
const googleProvider = new GoogleAuthProvider();

// Sign in with email and password
export async function signInWithEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('Sign in error:', error);
    return { success: false, error: error.message };
  }
}

// Sign up with email and password
export async function signUpWithEmail(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('Sign up error:', error);
    return { success: false, error: error.message };
  }
}

// Sign in with Google
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { success: true, user: result.user };
  } catch (error) {
    console.error('Google sign in error:', error);
    return { success: false, error: error.message };
  }
}

// Sign out
export async function signOutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    return { success: false, error: error.message };
  }
}

// Auth state observer
export function onAuthStateChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// Get current user
export function getCurrentUser() {
  return auth.currentUser;
}