// TradieIQ - Real database integration app
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
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { 
  signInWithEmail, 
  signUpWithEmail, 
  signOutUser,
  onAuthStateChange,
  getCurrentUser
} from './auth.js';

// Application State
let currentView = 'loading';
let currentTab = 'transcript';
let jobs = [];
let currentJobId = null;
let currentUser = null;
let jobsUnsubscribe = null;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('TradieIQ app initializing...');
  initializeApp();
});

// Initialize the application
function initializeApp() {
  setupEventListeners();
  
  // Check authentication state
  onAuthStateChange((user) => {
    console.log('Auth state changed:', user ? user.email : 'No user');
    currentUser = user;
    
    if (user) {
      // User is authenticated
      updateUserDisplay(user);
      showView('dashboard');
      loadUserData(user.uid);
    } else {
      // User is not authenticated
      clearUserData();
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
  
  // Sign up link
  const signUpLink = document.getElementById('signUpLink');
  if (signUpLink) {
    signUpLink.addEventListener('click', handleSignUpClick);
  }
}

// Authentication handlers
async function handleSignIn(event) {
  event.preventDefault();
  console.log('Attempting sign in...');
  
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
    const result = await signInWithEmail(email, password);
    console.log('Sign in result:', result.success);
    
    if (result.success) {
      showNotification('Welcome back!', `Signed in as ${email}`);
      // onAuthStateChange will handle the redirect
    } else {
      // Show specific error messages
      let errorMessage = 'Sign in failed';
      
      if (result.error.includes('user-not-found')) {
        errorMessage = 'No account found with this email address. Try signing up instead.';
      } else if (result.error.includes('wrong-password')) {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (result.error.includes('invalid-email')) {
        errorMessage = 'Invalid email address format.';
      } else if (result.error.includes('invalid-credential')) {
        errorMessage = 'Invalid email or password. Please check your credentials.';
      } else if (result.error.includes('too-many-requests')) {
        errorMessage = 'Too many failed attempts. Please wait before trying again.';
      } else {
        errorMessage = `Error: ${result.error}`;
      }
      
      showNotification('Sign In Failed', errorMessage);
      console.error('Authentication failed:', result.error);
    }
  } catch (error) {
    console.error('Sign in error:', error);
    showNotification('Error', 'An unexpected error occurred. Please try again.');
  } finally {
    // Reset button state
    signInBtn.textContent = 'Sign In';
    signInBtn.disabled = false;
  }
}

// Handle sign up
function handleSignUpClick(event) {
  event.preventDefault();
  
  const email = prompt('Enter your email address:');
  if (!email) return;
  
  const password = prompt('Create a password (minimum 6 characters):');
  if (!password) return;
  
  if (password.length < 6) {
    showNotification('Error', 'Password must be at least 6 characters long');
    return;
  }
  
  handleSignUp(email, password);
}

async function handleSignUp(email, password) {
  try {
    console.log('Creating new account for:', email);
    const result = await signUpWithEmail(email, password);
    
    if (result.success) {
      showNotification('Account Created!', `Welcome to TradieIQ, ${email}!`);
      // onAuthStateChange will handle the redirect
    } else {
      let errorMessage = 'Account creation failed';
      
      if (result.error.includes('email-already-in-use')) {
        errorMessage = 'An account with this email already exists. Try signing in instead.';
      } else if (result.error.includes('weak-password')) {
        errorMessage = 'Password is too weak. Please use at least 6 characters.';
      } else if (result.error.includes('invalid-email')) {
        errorMessage = 'Invalid email address format.';
      } else {
        errorMessage = `Error: ${result.error}`;
      }
      
      showNotification('Sign Up Failed', errorMessage);
      console.error('Sign up failed:', result.error);
    }
  } catch (error) {
    console.error('Sign up error:', error);
    showNotification('Error', 'An unexpected error occurred during sign up.');
  }
}

// Update user display
function updateUserDisplay(user) {
  // Update user name display
  const userDisplayName = document.getElementById('userDisplayName');
  const userEmail = document.getElementById('userEmail');
  const welcomeUserName = document.getElementById('welcomeUserName');
  const userInitials = document.getElementById('userInitials');
  
  const displayName = user.displayName || user.email.split('@')[0];
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();
  
  if (userDisplayName) userDisplayName.textContent = displayName;
  if (userEmail) userEmail.textContent = user.email;
  if (welcomeUserName) welcomeUserName.textContent = displayName;
  if (userInitials) userInitials.textContent = initials;
}

// Clear user data
function clearUserData() {
  jobs = [];
  currentJobId = null;
  if (jobsUnsubscribe) {
    jobsUnsubscribe();
    jobsUnsubscribe = null;
  }
  updateDashboardStats();
}

// Load user data from Firestore
async function loadUserData(userId) {
  try {
    console.log('Loading data for user:', userId);
    
    // Set up real-time listener for user's jobs
    const jobsQuery = query(
      collection(db, 'jobs'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );
    
    jobsUnsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      console.log('Jobs updated, count:', snapshot.docs.length);
      jobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      renderJobs();
      updateDashboardStats();
    }, (error) => {
      console.error('Error loading jobs:', error);
      showNotification('Database Error', 'Failed to load your jobs');
    });
    
  } catch (error) {
    console.error('Error setting up data listener:', error);
    showNotification('Error', 'Failed to connect to database');
  }
}

// Update dashboard statistics
function updateDashboardStats() {
  const activeJobs = jobs.filter(job => job.status === 'in_progress' || job.status === 'new');
  const quotedJobs = jobs.filter(job => job.status === 'quoted');
  const completedJobs = jobs.filter(job => job.status === 'completed');
  
  // Calculate total value
  const totalValue = jobs.reduce((sum, job) => {
    const value = parseFloat(job.value?.replace(/[$,]/g, '') || 0);
    return sum + value;
  }, 0);
  
  // Today's jobs
  const today = new Date();
  const todayJobs = jobs.filter(job => {
    const jobDate = job.updatedAt?.toDate ? job.updatedAt.toDate() : new Date(job.updatedAt);
    return jobDate.toDateString() === today.toDateString();
  });
  
  // Update stats in sidebar
  updateElement('statsActiveJobs', activeJobs.length);
  updateElement('statsQuotes', quotedJobs.length);
  updateElement('statsToday', todayJobs.length);
  
  // Update main dashboard cards
  updateElement('totalValue', `$${totalValue.toLocaleString()}`);
  updateElement('activeJobsCount', activeJobs.length);
  updateElement('quotedJobsCount', quotedJobs.length);
  updateElement('completedJobsCount', completedJobs.length);
  
  // Update descriptions
  updateElement('activeJobsDetail', activeJobs.length === 1 ? '1 active job' : `${activeJobs.length} active jobs`);
  updateElement('quotedJobsDetail', quotedJobs.length === 1 ? 'Worth $' + getQuotedJobsValue() : `${quotedJobs.length} quotes pending`);
  
  // Update welcome message
  updateElement('welcomeStats', 
    `You have ${activeJobs.length} active ${activeJobs.length === 1 ? 'job' : 'jobs'} and ${quotedJobs.length} pending ${quotedJobs.length === 1 ? 'quote' : 'quotes'}`
  );
  
  // Show/hide empty state
  const emptyState = document.getElementById('emptyState');
  const recentJobs = document.getElementById('recentJobs');
  
  if (jobs.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (recentJobs) recentJobs.classList.add('hidden');
  } else {
    if (emptyState) emptyState.classList.add('hidden');
    if (recentJobs) recentJobs.classList.remove('hidden');
    renderRecentJobs();
  }
}

function getQuotedJobsValue() {
  const quotedJobs = jobs.filter(job => job.status === 'quoted');
  const totalValue = quotedJobs.reduce((sum, job) => {
    const value = parseFloat(job.value?.replace(/[$,]/g, '') || 0);
    return sum + value;
  }, 0);
  return totalValue.toLocaleString();
}

function updateElement(id, content) {
  const element = document.getElementById(id);
  if (element) element.textContent = content;
}

// Render jobs list in sidebar
function renderJobs() {
  const jobsList = document.getElementById('jobsList');
  if (!jobsList) return;
  
  if (jobs.length === 0) {
    jobsList.innerHTML = '<div class="p-4 text-center text-sm text-gray-500">No jobs yet.<br>Create your first job!</div>';
    return;
  }
  
  const statusColors = {
    new: 'bg-blue-100 text-blue-700',
    quoted: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-700'
  };
  
  jobsList.innerHTML = jobs.slice(0, 10).map(job => `
    <div onclick="selectJob('${job.id}')" 
        class="p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition ${job.id === currentJobId ? 'bg-blue-50 border border-blue-200' : ''}">
        <div class="flex justify-between items-start">
            <div class="flex-1">
                <div class="font-medium text-sm text-gray-900">${escapeHtml(job.client || 'Unnamed Client')}</div>
                <div class="text-xs text-gray-500">${escapeHtml(job.address || 'No address')}</div>
            </div>
            <div class="text-xs font-bold text-green-600">${escapeHtml(job.value || '$0')}</div>
        </div>
        <div class="flex items-center gap-2 mt-2">
            <span class="px-2 py-0.5 text-xs rounded ${statusColors[job.status] || statusColors.new}">
                ${escapeHtml((job.status || 'new').replace('_', ' '))}
            </span>
            <span class="text-xs text-gray-400">${formatDate(job.updatedAt)}</span>
        </div>
    </div>
  `).join('');
}

// Render recent jobs in main dashboard
function renderRecentJobs() {
  const recentJobsList = document.getElementById('recentJobsList');
  if (!recentJobsList) return;
  
  const recentJobs = jobs.slice(0, 5);
  
  recentJobsList.innerHTML = recentJobs.map(job => `
    <div onclick="selectJob('${job.id}')" class="p-4 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer transition">
      <div class="flex justify-between items-start">
        <div>
          <h3 class="font-medium text-gray-900">${escapeHtml(job.client || 'Unnamed Client')}</h3>
          <p class="text-sm text-gray-600">${escapeHtml(job.address || 'No address')}</p>
          <div class="flex items-center gap-2 mt-2">
            <span class="px-2 py-1 text-xs rounded ${getStatusColor(job.status)}">
              ${escapeHtml((job.status || 'new').replace('_', ' '))}
            </span>
            <span class="text-xs text-gray-500">${formatDate(job.updatedAt)}</span>
          </div>
        </div>
        <div class="text-right">
          <div class="font-semibold text-green-600">${escapeHtml(job.value || '$0')}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function getStatusColor(status) {
  const colors = {
    new: 'bg-blue-100 text-blue-700',
    quoted: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-700'
  };
  return colors[status] || colors.new;
}

// Create new job
async function createNewJob() {
  if (!getCurrentUser()) {
    showNotification('Access Denied', 'Please sign in to create jobs');
    return;
  }
  
  const clientName = prompt('Client Name:');
  if (!clientName?.trim()) return;
  
  const address = prompt('Job Address:');
  if (!address?.trim()) return;
  
  const estimatedValue = prompt('Estimated Value (e.g., $1,500):') || '$0';
  
  try {
    const jobData = {
      client: clientName.trim(),
      address: address.trim(),
      value: estimatedValue,
      status: 'new',
      transcript: '',
      summary: '',
      tasks: [],
      materials: [],
      userId: getCurrentUser().uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    console.log('Creating job:', jobData);
    const docRef = await addDoc(collection(db, 'jobs'), jobData);
    
    showNotification('Job Created', `New job for ${clientName} has been created successfully`);
    selectJob(docRef.id);
    
  } catch (error) {
    console.error('Error creating job:', error);
    showNotification('Error', 'Failed to create job. Please try again.');
  }
}

// Select job (placeholder - will implement job detail view later)
function selectJob(jobId) {
  if (!getCurrentUser()) {
    showNotification('Access Denied', 'Please sign in to view jobs');
    return;
  }
  
  const job = jobs.find(j => j.id === jobId);
  if (job) {
    currentJobId = jobId;
    showNotification('Job Selected', `Selected job: ${job.client}`);
    // TODO: Implement job detail view
  }
}

// Search jobs
function searchJobs(query) {
  if (!query.trim()) {
    renderJobs();
    return;
  }
  
  const filteredJobs = jobs.filter(job => 
    job.client?.toLowerCase().includes(query.toLowerCase()) ||
    job.address?.toLowerCase().includes(query.toLowerCase())
  );
  
  const jobsList = document.getElementById('jobsList');
  if (filteredJobs.length === 0) {
    jobsList.innerHTML = '<div class="p-4 text-center text-sm text-gray-500">No matching jobs found</div>';
  } else {
    // Temporarily replace jobs for rendering
    const originalJobs = [...jobs];
    jobs = filteredJobs;
    renderJobs();
    jobs = originalJobs;
  }
}

// View management
function showView(view) {
  // Hide all views
  document.getElementById('signInView')?.classList.add('hidden');
  document.getElementById('dashboardView')?.classList.add('hidden');
  document.getElementById('jobDetailView')?.classList.add('hidden');
  
  // Protect dashboard views
  if ((view === 'dashboard' || view === 'jobDetail') && !getCurrentUser()) {
    console.log('Access denied to protected view:', view);
    showView('signIn');
    showNotification('Access Denied', 'Please sign in to access TradieIQ');
    return;
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

// Sign out
async function handleSignOut() {
  if (!getCurrentUser()) return;
  
  try {
    const result = await signOutUser();
    if (result.success) {
      console.log('User signed out successfully');
      clearUserData();
      showNotification('Signed Out', 'You have been signed out successfully');
    } else {
      showNotification('Error', 'Failed to sign out');
    }
  } catch (error) {
    console.error('Sign out error:', error);
    showNotification('Error', 'An unexpected error occurred while signing out');
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

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text?.replace(/[&<>"']/g, m => map[m]) || '';
}

// Notification system
function showNotification(title, message) {
  console.log('Notification:', title, message);
  
  const notification = document.getElementById('notification');
  const titleEl = document.getElementById('notificationTitle');
  const messageEl = document.getElementById('notificationMessage');
  
  if (notification && titleEl && messageEl) {
    titleEl.textContent = title;
    messageEl.textContent = message;
    notification.style.display = 'block';
    
    setTimeout(() => {
      notification.style.display = 'none';
    }, 4000);
  }
}

// Export functions for global access
window.showView = showView;
window.selectJob = selectJob;
window.createNewJob = createNewJob;
window.searchJobs = searchJobs;
window.handleSignOut = handleSignOut;
window.showNotification = showNotification;

console.log('TradieIQ app loaded successfully');