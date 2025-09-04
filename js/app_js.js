// Main application logic with Firestore integration
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

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

// Initialize the application
function initializeApp() {
  setupEventListeners();
  
  // Check authentication state
  onAuthStateChange((user) => {
    if (user) {
      showView('dashboard');
      loadUserData(user.uid);
    } else {
      showView('signIn');
    }
    hideLoading();
  });
}

// Setup event listeners
function setupEventListeners() {
  // Sign in form
  const signInForm = document.getElementById('signInForm');
  if (signInForm) {
    signInForm.addEventListener('submit', handleSignIn);
  }
  
  // Google sign in
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', handleGoogleSignIn);
  }
  
  // Sign up link
  const signUpLink = document.getElementById('signUpLink');
  if (signUpLink) {
    signUpLink.addEventListener('click', handleSignUpClick);
  }
}

// Authentication handlers
async function handleSignIn(event) {
  event.preventDefault();
  
  const email = document.getElementById('emailInput').value;
  const password = document.getElementById('passwordInput').value;
  const signInBtn = document.getElementById('signInBtn');
  
  signInBtn.textContent = 'Signing in...';
  signInBtn.disabled = true;
  
  const result = await signInWithEmail(email, password);
  
  if (result.success) {
    showNotification('Welcome back!', 'You have been signed in successfully');
  } else {
    showNotification('Sign In Failed', result.error);
    signInBtn.textContent = 'Sign In';
    signInBtn.disabled = false;
  }
}

async function handleGoogleSignIn() {
  const result = await signInWithGoogle();
  
  if (result.success) {
    showNotification('Welcome!', 'You have been signed in with Google');
  } else {
    showNotification('Sign In Failed', result.error);
  }
}

function handleSignUpClick(event) {
  event.preventDefault();
  showNotification('Coming Soon', 'Sign up functionality will be available soon!');
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
  if (!user) return null;
  
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

async function deleteJob(jobId) {
  try {
    await deleteDoc(doc(db, 'jobs', jobId));
    showNotification('Job Deleted', 'Job has been deleted successfully');
    
  } catch (error) {
    console.error('Error deleting job:', error);
    showNotification('Error', 'Failed to delete job');
  }
}

// View Management
function showView(view) {
  document.getElementById('signInView').classList.add('hidden');
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('jobDetailView').classList.add('hidden');
  
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

// Tab Management (keeping your existing function)
function switchTab(tab) {
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

// Job Management
function renderJobs() {
  const jobsList = document.getElementById('jobsList');
  if (!jobsList || !jobs.length) return;
  
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
  const job = jobs.find(j => j.id === jobId);
  if (job) {
    currentJobId = jobId;
    
    // Update job detail view
    const clientNameEl = document.getElementById('jobClientName');
    const addressEl = document.getElementById('jobAddress');
    
    if (clientNameEl) clientNameEl.textContent = job.client || 'Unnamed Client';
    if (addressEl) addressEl.textContent = job.address || 'No address specified';
    
    showView('jobDetail');
  }
}

async function createNewJob() {
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
    }, 3000);
  }
}

// Recording Functions (keeping your existing logic)
function toggleRecording() {
  const btn = document.getElementById('recordBtn');
  const icon = document.getElementById('recordIcon');
  const text = document.getElementById('recordText');
  const wave = document.getElementById('audioWave');
  const timer = document.getElementById('recordingTimer');
  const timeDisplay = document.getElementById('recordingTime');
  
  if (!btn) return;
  
  isRecording = !isRecording;
  
  if (isRecording) {
    btn.classList.add('pulse-record');
    if (icon) {
      icon.classList.remove('fa-microphone');
      icon.classList.add('fa-stop');
    }
    if (text) text.textContent = 'Stop';
    if (wave) wave.classList.remove('hidden');
    if (timer) timer.classList.remove('hidden');
    
    recordingStartTime = Date.now();
    recordingInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const seconds = (elapsed % 60).toString().padStart(2, '0');
      if (timeDisplay) timeDisplay.textContent = `${minutes}:${seconds}`;
    }, 1000);
    
    setTimeout(() => {
      if (isRecording) {
        toggleRecording();
        showNotification('Recording Complete', 'Audio saved successfully!');
      }
    }, 5000);
  } else {
    btn.classList.remove('pulse-record');
    if (icon) {
      icon.classList.remove('fa-stop');
      icon.classList.add('fa-microphone');
    }
    if (text) text.textContent = 'Start Recording';
    if (wave) wave.classList.add('hidden');
    if (timer) timer.classList.add('hidden');
    
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
  }
}

// Sign out function
async function handleSignOut() {
  const result = await signOutUser();
  if (result.success) {
    // Cleanup
    if (window.jobsUnsubscribe) {
      window.jobsUnsubscribe();
    }
    jobs = [];
    currentJobId = null;
    showNotification('Signed Out', 'You have been signed out successfully');
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