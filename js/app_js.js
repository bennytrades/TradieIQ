// Main application logic with proper Firebase authentication
import { db } from './firebase-config.js';
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { 
  signInWithEmail, 
  signUpWithEmail, 
  signInWithGoogle, 
  signOutUser,
  onAuthStateChange,
  getCurrentUser
} from './auth.js';

// Application State
let currentView = 'loading';
let currentTab = 'transcript';
let isRecording = false;
let recordingStartTime = null;
let recordingInterval = null;
let jobs = [];
let currentJobId = null;
let currentUser = null;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

// Initialize the application
function initializeApp() {
  setupEventListeners();
  
  // Check authentication state - this is the key fix
  onAuthStateChange((user) => {
    currentUser = user;
    
    if (user) {
      // User is authenticated
      console.log('User authenticated:', user.email);
      updateUserDisplay(user);
      showView('dashboard');
      loadUserData(user.uid);
    } else {
      // User is not authenticated
      console.log('User not authenticated');
      showView('signIn');
      // Clear any cached data
      jobs = [];
      currentJobId = null;
    }
    hideLoading();
  });
}

// Setup event listeners
function setupEventListeners() {
  // Sign in form - FIXED to actually authenticate
  const signInForm = document.getElementById('signInForm');
  if (signInForm) {
    signInForm.addEventListener('submit', handleSignIn);
  }
  
  // Google sign in - disabled for now
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  if (googleSignInBtn) {
    googleSignInBtn.style.display = 'none'; // Hide Google signin
  }
  
  // Sign up link
  const signUpLink = document.getElementById('signUpLink');
  if (signUpLink) {
    signUpLink.addEventListener('click', handleSignUpClick);
  }
}

// FIXED Authentication handlers - now actually authenticates
async function handleSignIn(event) {
  event.preventDefault();
  
  const email = document.getElementById('emailInput').value;
  const password = document.getElementById('passwordInput').value;
  const signInBtn = document.getElementById('signInBtn');
  
  // Validate inputs
  if (!email || !password) {
    showNotification('Error', 'Please enter both email and password');
    return;
  }

  // Show loading state
  signInBtn.textContent = 'Signing in...';
  signInBtn.disabled = true;
  
  try {
    // Actually attempt Firebase authentication
    const result = await signInWithEmail(email, password);
    
    if (result.success) {
      showNotification('Welcome back!', `Signed in as ${email}`);
      // Don't manually show dashboard - let onAuthStateChange handle it
    } else {
      // Show specific error messages
      let errorMessage = 'Sign in failed';
      
      if (result.error.includes('user-not-found')) {
        errorMessage = 'No account found with this email address';
      } else if (result.error.includes('wrong-password')) {
        errorMessage = 'Incorrect password';
      } else if (result.error.includes('invalid-email')) {
        errorMessage = 'Invalid email address';
      } else if (result.error.includes('too-many-requests')) {
        errorMessage = 'Too many failed attempts. Try again later';
      } else {
        errorMessage = result.error;
      }
      
      showNotification('Sign In Failed', errorMessage);
    }
  } catch (error) {
    console.error('Sign in error:', error);
    showNotification('Error', 'An unexpected error occurred');
  } finally {
    // Reset button state
    signInBtn.textContent = 'Sign In';
    signInBtn.disabled = false;
  }
}

// Handle sign up link click
function handleSignUpClick(event) {
  event.preventDefault();
  
  const email = prompt('Enter your email address:');
  if (!email) return;
  
  const password = prompt('Create a password (minimum 6 characters):');
  if (!password) return;
  
  if (password.length < 6) {
    showNotification('Error', 'Password must be at least 6 characters');
    return;
  }
  
  handleSignUp(email, password);
}

// Sign up handler
async function handleSignUp(email, password) {
  try {
    const result = await signUpWithEmail(email, password);
    
    if (result.success) {
      showNotification('Account Created!', `Welcome to TradieIQ, ${email}`);
      // onAuthStateChange will handle the redirect
    } else {
      let errorMessage = 'Account creation failed';
      
      if (result.error.includes('email-already-in-use')) {
        errorMessage = 'An account with this email already exists. Try signing in instead.';
      } else if (result.error.includes('weak-password')) {
        errorMessage = 'Password is too weak. Use at least 6 characters.';
      } else if (result.error.includes('invalid-email')) {
        errorMessage = 'Invalid email address';
      } else {
        errorMessage = result.error;
      }
      
      showNotification('Sign Up Failed', errorMessage);
    }
  } catch (error) {
    console.error('Sign up error:', error);
    showNotification('Error', 'An unexpected error occurred');
  }
}

// Update user display in dashboard
function updateUserDisplay(user) {
  const userDisplayName = document.getElementById('userDisplayName');
  const userEmail = document.getElementById('userEmail');
  
  if (userDisplayName && userEmail) {
    userDisplayName.textContent = user.displayName || user.email.split('@')[0];
    userEmail.textContent = user.email;
  }
}

// Firestore functions
async function loadUserData(userId) {
  try {
    // Load jobs for the user
    const jobsQuery = query(
      collection(db, 'jobs'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      jobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      renderJobs();
    });
    
    // Store unsubscribe function for cleanup
    window.jobsUnsubscribe = unsubscribe;
    
  } catch (error) {
    console.error('Error loading user data:', error);
    showNotification('Error', 'Failed to load your data');
  }
}

async function createJob(jobData) {
  const user = getCurrentUser();
  if (!user) {
    showNotification('Error', 'You must be signed in to create jobs');
    return null;
  }
  
  try {
    const docRef = await addDoc(collection(db, 'jobs'), {
      ...jobData,
      userId: user.uid,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    showNotification('Job Created', 'New job has been created successfully');
    return docRef.id;
    
  } catch (error) {
    console.error('Error creating job:', error);
    showNotification('Error', 'Failed to create job');
    return null;
  }
}

async function updateJob(jobId, updates) {
  const user = getCurrentUser();
  if (!user) {
    showNotification('Error', 'You must be signed in to update jobs');
    return;
  }
  
  try {
    const jobRef = doc(db, 'jobs', jobId);
    await updateDoc(jobRef, {
      ...updates,
      updatedAt: new Date()
    });
    
    showNotification('Job Updated', 'Changes saved successfully');
    
  } catch (error) {
    console.error('Error updating job:', error);
    showNotification('Error', 'Failed to save changes');
  }
}

// PROTECTED View Management - only show dashboard if authenticated
function showView(view) {
  // Hide all views first
  document.getElementById('signInView').classList.add('hidden');
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('jobDetailView').classList.add('hidden');
  
  // Only show dashboard views if user is authenticated
  if (view === 'dashboard' || view === 'jobDetail') {
    if (!getCurrentUser()) {
      console.log('Attempted to access protected view without authentication');
      showView('signIn');
      showNotification('Access Denied', 'Please sign in to access TradieIQ');
      return;
    }
  }
  
  const targetView = document.getElementById(view + 'View');
  if (targetView) {
    targetView.classList.remove('hidden');
    targetView.classList.add('fade-in');
  }
  
  currentView = view;
}

function hideLoading() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.style.display = 'none';
  }
}

// Tab Management
function switchTab(tab) {
  if (!getCurrentUser()) {
    showNotification('Access Denied', 'Please sign in to access this feature');
    return;
  }
  
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  
  const tabContent = document.getElementById(tab + 'Tab');
  if (tabContent) {
    tabContent.classList.remove('hidden');
    tabContent.classList.add('slide-in');
  }
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('tab-active', 'text-blue-600');
    btn.classList.add('text-gray-500');
  });
  
  const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('text-gray-500');
    activeBtn.classList.add('tab-active', 'text-blue-600');
  }
  
  currentTab = tab;
}

// Job Management - protected functions
function renderJobs() {
  const jobsList = document.getElementById('jobsList');
  if (!jobsList || !jobs.length) {
    if (jobsList) {
      jobsList.innerHTML = '<div class="p-4 text-center text-sm text-gray-500">No jobs yet. Create your first job!</div>';
    }
    return;
  }
  
  const statusColors = {
    new: 'bg-blue-100 text-blue-700',
    quoted: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-700'
  };
  
  jobsList.innerHTML = jobs.map(job => `
    <div onclick="selectJob('${job.id}')" 
        class="p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition ${job.id === currentJobId ? 'bg-blue-50 border border-blue-200' : ''}">
        <div class="flex justify-between items-start">
            <div class="flex-1">
                <div class="font-medium text-sm text-gray-900">${job.client || 'Unnamed Client'}</div>
                <div class="text-xs text-gray-500">${job.address || 'No address'}</div>
            </div>
            <div class="text-xs font-bold text-green-600">${job.value || '$0'}</div>
        </div>
        <div class="flex items-center gap-2 mt-2">
            <span class="px-2 py-0.5 text-xs rounded ${statusColors[job.status] || statusColors.new}">
                ${(job.status || 'new').replace('_', ' ')}
            </span>
            <span class="text-xs text-gray-400">${formatDate(job.updatedAt)}</span>
        </div>
    </div>
  `).join('');
}

function selectJob(jobId) {
  if (!getCurrentUser()) {
    showNotification('Access Denied', 'Please sign in to view jobs');
    return;
  }
  
  const job = jobs.find(j => j.id === jobId);
  if (job) {
    currentJobId = jobId;
    
    const clientNameEl = document.getElementById('jobClientName');
    const addressEl = document.getElementById('jobAddress');
    
    if (clientNameEl) clientNameEl.textContent = job.client || 'Unnamed Client';
    if (addressEl) addressEl.textContent = job.address || 'No address specified';
    
    showView('jobDetail');
  }
}

async function createNewJob() {
  if (!getCurrentUser()) {
    showNotification('Access Denied', 'Please sign in to create jobs');
    return;
  }
  
  const clientName = prompt('Client Name:');
  if (clientName) {
    const address = prompt('Job Address:');
    if (address) {
      const jobId = await createJob({
        client: clientName,
        address: address,
        status: 'new',
        value: '$0',
        transcript: '',
        summary: '',
        tasks: [],
        materials: []
      });
      
      if (jobId) {
        selectJob(jobId);
      }
    }
  }
}

// Utility functions
function formatDate(date) {
  if (!date) return 'Unknown';
  
  const d = date.toDate ? date.toDate() : new Date(date);
  const now = new Date();
  const diff = now - d;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// Notification System
function showNotification(title, message) {
  const notification = document.getElementById('notification');
  const titleEl = document.getElementById('notificationTitle');
  const messageEl = document.getElementById('notificationMessage');
  
  if (notification && titleEl && messageEl) {
    titleEl.textContent = title;
    messageEl.textContent = message;
    notification.style.display = 'block';
    
    setTimeout(() => {
      notification.style.display = 'none';
    }, 4000); // Show longer for error messages
  }
}

// Recording Functions (protected)
function toggleRecording() {
  if (!getCurrentUser()) {
    showNotification('Access Denied', 'Please sign in to use recording features');
    return;
  }
  
  // ... existing recording logic ...
}

// Sign out function - FIXED to actually sign out
async function handleSignOut() {
  if (!getCurrentUser()) {
    return;
  }
  
  try {
    const result = await signOutUser();
    if (result.success) {
      // Cleanup
      if (window.jobsUnsubscribe) {
        window.jobsUnsubscribe();
      }
      jobs = [];
      currentJobId = null;
      currentUser = null;
      showNotification('Signed Out', 'You have been signed out successfully');
      // onAuthStateChange will handle redirect to sign in
    } else {
      showNotification('Error', 'Failed to sign out');
    }
  } catch (error) {
    console.error('Sign out error:', error);
    showNotification('Error', 'An unexpected error occurred while signing out');
  }
}

// Export functions for global access
window.showView = showView;
window.switchTab = switchTab;
window.selectJob = selectJob;
window.createNewJob = createNewJob;
window.toggleRecording = toggleRecording;
window.updateJob = updateJob;
window.handleSignOut = handleSignOut;
window.showNotification = showNotification;