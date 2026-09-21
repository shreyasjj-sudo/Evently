/**
 * Evently - Cloud-Based College Event Management System
 * Frontend Architecture: Auth State & Single Page App (SPA) Router
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tamrtgcjgwxssfasnbcp.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IgfDKfCcWaNzOol5qZQvlw_WDMiD2nE';
const API_URL = import.meta.env.VITE_API_URL || 'https://evently-backend-367370062663.asia-south1.run.app';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '514687193034-jvkntjom2hg69b658kdkfumofocfaerp.apps.googleusercontent.com';

// Ensure dataset is initialized empty in production (no static mock fallback)
window.CAMPUS_EVENTS_DATASET = window.CAMPUS_EVENTS_DATASET || [];

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
  initThemeSwitch();
  initMobileMenu();
  initLoginForm();
  initProfileCompletionForm();
  initCalendarInteractivePreview();
  initOwlMicroAnimations();
  initScrollHeader();
  initCalendarDashboard();
  initMonthEventsView();
  
  // Initialize Router & Auth Guards
  Router.init();

  // Initialize Password Reset and Google 2-Way Verification Modals
  initForgotPasswordModal();
  initGoogleVerifyModal();

  // Initialize Google Auth (Supabase OAuth & Google Identity Services)
  initGoogleAuth();
});

/* ==========================================================================
   0. AUTHENTICATION SERVICE & STATE (Frontend mock + Supabase OAuth modular state)
   ========================================================================== */

const AUTH_KEY = 'evently_auth_user';

export const AuthService = {
  isAuthenticated() {
    return localStorage.getItem(AUTH_KEY) !== null;
  },

  getUser() {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  async getSession() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data?.session || null;
    } catch (e) {
      console.warn('Error fetching Supabase session:', e);
      return null;
    }
  },

  async syncWithBackend(session) {
    if (!session || !session.access_token) return null;
    const token = session.access_token;
    const supaUser = session.user;
    const meta = supaUser.user_metadata || {};
    
    let backendUser = null;
    try {
      const res = await fetch(`${API_URL}/auth/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        backendUser = await res.json();
      } else {
        console.warn('Backend sync returned status:', res.status);
      }
    } catch (err) {
      console.warn('Backend sync request failed:', err);
    }

    const isProfileDone = backendUser?.profile ? !!backendUser.profile.profile_completed : false;
    const username = backendUser?.username || meta.username || meta.full_name || supaUser.email.split('@')[0];
    const name = meta.full_name || meta.name || backendUser?.username || supaUser.email.split('@')[0];

    const user = {
      id: backendUser?.id || supaUser.id,
      email: supaUser.email,
      username: username,
      name: name,
      avatar: meta.avatar_url || meta.picture || null,
      role: backendUser?.role || 'student',
      college: backendUser?.profile?.college || 'Bangalore Institute of Technology (BIT)',
      profileCompleted: isProfileDone,
      profile: backendUser?.profile || null,
      registeredEvents: [],
      token: token,
      provider: supaUser.app_metadata?.provider || 'supabase'
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return user;
  },

  async signup(email, password, username) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
          full_name: username
        }
      }
    });
    if (error) throw error;

    if (data.session) {
      return await this.syncWithBackend(data.session);
    }
    return { user: data.user, requiresEmailConfirmation: true };
  },

  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return await this.syncWithBackend(data.session);
  },

  async sendVerificationLink(email) {
    const redirectUrl = window.location.origin + '/login';
    // 1. Try resending signup verification link
    const resendResult = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    if (!resendResult.error) {
      return { success: true, method: 'resend' };
    }

    // 2. If resend fails (e.g. user already confirmed or needs otp), try signInWithOtp
    const otpResult = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: redirectUrl,
        shouldCreateUser: true
      }
    });
    if (otpResult.error) {
      throw (resendResult.error || otpResult.error);
    }
    return { success: true, method: 'otp' };
  },

  async loginWithOAuthUser(oauthDetails, isNewUser = false) {
    const session = await this.getSession();
    if (session) {
      return await this.syncWithBackend(session);
    }
    const { email, name, avatar, token, backendUser } = oauthDetails;
    const user = {
      id: backendUser?.id || `usr-${Date.now()}`,
      email: email,
      username: backendUser?.username || (name ? name.toLowerCase().replace(/\s+/g, '_') : email.split('@')[0]),
      name: name || email.split('@')[0],
      avatar: avatar || null,
      role: 'student',
      college: backendUser?.profile?.college || 'Bangalore Institute of Technology (BIT)',
      profileCompleted: !isNewUser && !!backendUser?.profile?.profile_completed,
      profile: isNewUser ? null : backendUser?.profile,
      registeredEvents: [],
      token: token,
      provider: 'google'
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return user;
  },

  async loginWithGoogle() {
    const googleBtn = document.getElementById('google-sso-btn');
    const originalContent = googleBtn ? googleBtn.innerHTML : '';
    if (googleBtn) {
      googleBtn.disabled = true;
      googleBtn.style.opacity = '0.8';
      googleBtn.innerHTML = `
        <span class="btn-spinner" style="display:inline-block;width:18px;height:18px;border:2px solid #ea580c;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;"></span>
        <span>Connecting to Google...</span>
      `;
    }

    try {
      const redirectTarget = window.location.origin + window.location.pathname;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTarget,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline'
          }
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error('Google Sign In Error:', err);
      Router.showToastNotification('Google Sign-In Failed', err.message || 'Could not connect to Google.');
      if (googleBtn) {
        googleBtn.disabled = false;
        googleBtn.style.opacity = '1';
        googleBtn.innerHTML = originalContent;
      }
    }
  },

  async completeProfile(profileData) {
    const user = this.getUser();
    if (user) {
      user.profileCompleted = true;
      user.profile = profileData;
      user.college = profileData.college || user.college;
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));

      if (user.token && user.token !== 'evt-jwt-token-demo-123') {
        try {
          await fetch(`${API_URL}/users/me/profile`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({
              degree: profileData.degree,
              college: profileData.college,
              branch: profileData.branch,
              graduation_year: profileData.graduation_year,
              country: profileData.country,
              interests: profileData.interests || []
            })
          });
        } catch (e) {
          console.warn('Backend profile update offline:', e);
        }
      }
    }
    return user;
  },

  getRegistrations() {
    const user = this.getUser();
    return user && user.registeredEvents ? user.registeredEvents : [];
  },

  isUserRegistered(eventId) {
    const registrations = this.getRegistrations();
    return registrations.includes(eventId);
  },

  registerEvent(eventId) {
    const user = this.getUser();
    if (!user) return false;
    if (!user.registeredEvents) user.registeredEvents = [];
    if (!user.registeredEvents.includes(eventId)) {
      user.registeredEvents.push(eventId);
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    }
    return true;
  },

  cancelRegistration(eventId) {
    const user = this.getUser();
    if (!user || !user.registeredEvents) return false;
    user.registeredEvents = user.registeredEvents.filter(id => id !== eventId);
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return true;
  },

  async logout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase logout note:', e);
    }
    localStorage.removeItem(AUTH_KEY);
    Router.navigate('/login');
  }
};


/* ==========================================================================
   1. ROUTER & AUTHENTICATION ROUTE GUARDS
   ========================================================================== */

export const Router = {
  routes: {
    '/': 'view-landing',
    '/login': 'view-login',
    '/forgot-password': 'view-login',
    '/complete-profile': 'view-complete-profile',
    '/calendar': 'view-calendar',
    '/events': 'view-events',
    '/event': 'view-event-detail',
    '/about': 'view-about'
  },

  protectedRoutes: ['/calendar', '/events', '/complete-profile'],

  init() {
    window.addEventListener('popstate', () => this.handleRoute());

    // Listen for SPA navigation links
    document.addEventListener('click', (e) => {
      // Logout triggers
      if (e.target.closest('.logout-btn-trigger')) {
        e.preventDefault();
        AuthService.logout();
        return;
      }

      const link = e.target.closest('.route-link, a[href^="/"]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      if (href.startsWith('/')) {
        e.preventDefault();
        this.navigate(href);
      }
    });

    this.handleRoute();
  },

  navigate(path) {
    window.history.pushState({}, '', path);
    this.handleRoute();
  },

  handleRoute() {
    let path = window.location.pathname || '/';
    const isAuth = AuthService.isAuthenticated();
    const user = AuthService.getUser();
    const isProfileDone = user ? !!user.profileCompleted : false;

    // Rule 0: Root path '/' must ALWAYS strictly render the landing page
    if (path === '/') {
      document.body.classList.remove('in-login-view');
      document.querySelectorAll('.page-view').forEach((view) => {
        view.classList.remove('active');
      });
      const landingView = document.getElementById('view-landing');
      if (landingView) landingView.classList.add('active');
      this.updateNavbar(isAuth, '/');
      window.scrollTo(0, 0);
      return;
    }

    // Rule 0.5: Route to /event (Dedicated Event & Contest Details View)
    if (path === '/event') {
      document.body.classList.remove('in-login-view');
      document.querySelectorAll('.page-view').forEach((view) => {
        view.classList.remove('active');
      });
      const detailView = document.getElementById('view-event-detail');
      if (detailView) detailView.classList.add('active');
      this.updateNavbar(isAuth, '/event');
      const searchParams = new URLSearchParams(window.location.search);
      const eventId = searchParams.get('id');
      if (typeof renderEventDetailPage === 'function') {
        renderEventDetailPage(eventId);
      }
      window.scrollTo(0, 0);
      return;
    }

    if (path === '/forgot-password') {
      path = '/login';
      setTimeout(() => openForgotPasswordModal(), 50);
    }

    // Rule 1: Unauthenticated user visiting protected route -> redirect to /login
    if (this.protectedRoutes.includes(path) && !isAuth) {
      this.showToastNotification('Authentication Required', 'Redirecting to /login to access Evently...');
      return this.navigate('/login');
    }

    // Rule 2: Authenticated user with incomplete profile trying to access protected calendar/events -> redirect to /complete-profile
    if (isAuth && !isProfileDone && (path === '/calendar' || path === '/events')) {
      this.showToastNotification('Profile Setup Required', 'Please complete your student profile to access your calendar...');
      return this.navigate('/complete-profile');
    }

    // Rule 3: Authenticated user with complete profile visiting /login or /complete-profile -> redirect to /calendar
    if (isAuth && isProfileDone && (path === '/login' || path === '/complete-profile')) {
      return this.navigate('/calendar');
    }

    // Rule 4: Default route fallback
    if (!this.routes[path]) {
      path = '/';
    }

    // Toggle body class for split-screen login/profile views
    if (path === '/login' || path === '/complete-profile') {
      document.body.classList.add('in-login-view');
    } else {
      document.body.classList.remove('in-login-view');
    }

    // Switch active view container
    document.querySelectorAll('.page-view').forEach((view) => {
      view.classList.remove('active');
    });

    const targetViewId = this.routes[path];
    const targetView = document.getElementById(targetViewId);
    if (targetView) {
      targetView.classList.add('active');
    }

    // Update navbar state (authenticated vs unauthenticated)
    this.updateNavbar(isAuth, path);

    if ((path === '/calendar' || path === '/events') && typeof window.refreshCalendar === 'function') {
      window.refreshCalendar();
    }

    if (path === '/events' && typeof renderMonthEventsView === 'function') {
      renderMonthEventsView();
    }

    window.scrollTo(0, 0);
  },

  updateNavbar(isAuth, currentPath) {
    const authSlot = document.getElementById('nav-auth-slot');
    const mobileAuthSlot = document.getElementById('mobile-auth-slot');
    const user = AuthService.getUser();

    if (isAuth && user) {
      const displayName = user.name || user.username || 'Student';
      const avatarHtml = user.avatar
        ? `<img src="${user.avatar}" alt="${displayName}" class="nav-avatar-img" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1.5px solid #ea580c;vertical-align:middle;display:inline-block;" />`
        : `<span style="font-size: 1.1rem; line-height: 1;">🎓</span>`;

      if (authSlot) {
        authSlot.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${avatarHtml}
            <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-dark);">${displayName.split(' ')[0]}</span>
            <button type="button" class="btn btn-sm btn-outline logout-btn-trigger">Logout</button>
          </div>
        `;
      }
      if (mobileAuthSlot) {
        mobileAuthSlot.innerHTML = `<button type="button" class="mobile-nav-btn logout-btn-trigger" style="background:#dc2626;">Sign out (${displayName.split(' ')[0]})</button>`;
      }
    } else {
      if (authSlot) {
        authSlot.innerHTML = `<a href="/login" class="nav-btn route-link">Login</a>`;
      }
      if (mobileAuthSlot) {
        mobileAuthSlot.innerHTML = `<a href="/login" class="mobile-nav-btn route-link">Login to Evently</a>`;
      }
    }
  },

  showToastNotification(title, desc) {
    const modal = document.getElementById('redirect-modal');
    const titleEl = document.getElementById('redirect-title');
    const descEl = document.getElementById('redirect-desc');

    if (modal && titleEl && descEl) {
      titleEl.textContent = title;
      descEl.textContent = desc;
      modal.classList.add('is-active');
      setTimeout(() => {
        modal.classList.remove('is-active');
      }, 1800);
    }
  }
};

/* Registered mock user database for checking existing members */
const MOCK_USERS_DB = [
  'student@college.edu',
  'alex.rivera@university.edu',
  'john.doe@college.edu'
];

function initLoginForm() {
  const loginForm = document.getElementById('login-form');
  const googleBtn = document.getElementById('google-sso-btn');
  const googleBtnText = document.getElementById('google-btn-text');
  const togglePwdBtn = document.getElementById('toggle-password-btn');
  const pwdInput = document.getElementById('login-password');
  const confirmPwdInput = document.getElementById('signup-confirm-password');
  const emailInput = document.getElementById('login-email');
  const usernameInput = document.getElementById('signup-username');
  const formModeTitle = document.getElementById('form-mode-title');
  const formModeSubtitle = document.getElementById('form-mode-subtitle');
  const toggleModeBtn = document.getElementById('toggle-auth-mode-btn');
  const submitBtn = document.getElementById('btn-login-submit');
  const forgotPwdLink = document.getElementById('forgot-password-link');
  const signupFields = document.querySelectorAll('.signup-field');
  const userExistsAlert = document.getElementById('user-exists-alert');
  const alertDescText = document.getElementById('alert-desc-text');
  const alertSwitchBtn = document.getElementById('alert-switch-signin-btn');
  const sendVerificationBtn = document.getElementById('btn-send-verification-link');

  let currentMode = 'signin'; // 'signin' or 'signup'

  function setMode(mode) {
    currentMode = mode;
    userExistsAlert?.classList.add('hidden');

    if (mode === 'signup') {
      if (formModeTitle) formModeTitle.textContent = 'Create your account';
      if (formModeSubtitle) {
        formModeSubtitle.innerHTML = 'Already a member? <button type="button" class="login-link-btn" id="toggle-auth-mode-btn">Sign in here</button>';
      }
      signupFields.forEach(el => el.classList.remove('hidden'));
      forgotPwdLink?.classList.add('hidden');
      sendVerificationBtn?.classList.add('hidden');
      if (submitBtn) submitBtn.textContent = 'Create Account';
      if (googleBtnText) googleBtnText.textContent = 'Sign up with Google';
    } else {
      if (formModeTitle) formModeTitle.textContent = 'Sign in';
      if (formModeSubtitle) {
        formModeSubtitle.innerHTML = "Don't have an account yet? <button type=\"button\" class=\"login-link-btn\" id=\"toggle-auth-mode-btn\">Sign up here</button>";
      }
      signupFields.forEach(el => el.classList.add('hidden'));
      forgotPwdLink?.classList.remove('hidden');
      sendVerificationBtn?.classList.remove('hidden');
      if (submitBtn) submitBtn.textContent = 'Sign in';
      if (googleBtnText) googleBtnText.textContent = 'Sign in with Google';
    }

    const newToggleBtn = document.getElementById('toggle-auth-mode-btn');
    newToggleBtn?.addEventListener('click', () => {
      setMode(currentMode === 'signin' ? 'signup' : 'signin');
    });
  }

  toggleModeBtn?.addEventListener('click', () => {
    setMode(currentMode === 'signin' ? 'signup' : 'signin');
  });

  alertSwitchBtn?.addEventListener('click', () => {
    setMode('signin');
    pwdInput?.focus();
  });

  // Dedicated "Send Verification Link" button
  if (sendVerificationBtn) {
    sendVerificationBtn.addEventListener('click', async () => {
      const email = emailInput?.value?.trim() || '';
      if (!email) {
        Router.showToastNotification('Email Required', 'Please enter your email address to receive the verification link.');
        emailInput?.focus();
        return;
      }

      const origHtml = sendVerificationBtn.innerHTML;
      sendVerificationBtn.disabled = true;
      sendVerificationBtn.innerHTML = `
        <span class="btn-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #ea580c;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;"></span>
        <span>Sending link...</span>
      `;

      try {
        await AuthService.sendVerificationLink(email);
        Router.showToastNotification('Verification Link Sent! ✉️', `A verification link has been sent to ${email}. Please check your email inbox to sign in.`);
      } catch (err) {
        console.error('Error sending verification link:', err);
        Router.showToastNotification('Failed to Send Link', err.message || 'Could not send verification link. Please check the email address.');
      } finally {
        sendVerificationBtn.disabled = false;
        sendVerificationBtn.innerHTML = origHtml;
      }
    });
  }

  // Password visibility toggle
  if (togglePwdBtn && pwdInput) {
    togglePwdBtn.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      const eyeOpen = togglePwdBtn.querySelector('.eye-open');
      const eyeClosed = togglePwdBtn.querySelector('.eye-closed');
      eyeOpen?.classList.toggle('hidden', isPwd);
      eyeClosed?.classList.toggle('hidden', !isPwd);
    });
  }

  // Form Submit handler
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput?.value?.trim() || '';
      const password = pwdInput?.value || '';
      const username = usernameInput?.value?.trim() || (email.includes('@') ? email.split('@')[0] : 'student_user');
      const confirmPassword = confirmPwdInput?.value || '';

      if (!email) {
        Router.showToastNotification('Missing Information', 'Please enter your email address.');
        emailInput?.focus();
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <span class="btn-spinner" style="display:inline-block;width:16px;height:16px;border:2px solid #ffffff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;"></span>
          <span>${currentMode === 'signup' ? 'Creating account...' : (!password ? 'Sending link...' : 'Signing in...')}</span>
        `;
      }

      try {
        if (currentMode === 'signup') {
          if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters long.');
          }
          if (confirmPassword && password !== confirmPassword) {
            throw new Error('Password and Confirm Password do not match.');
          }

          const res = await AuthService.signup(email, password, username);
          if (res?.requiresEmailConfirmation) {
            Router.showToastNotification('Account Created!', 'Please check your email inbox to confirm your account, or sign in.');
            setMode('signin');
          } else {
            Router.showToastNotification('Account Created!', 'Welcome to Evently. Please complete your student profile.');
            Router.navigate('/complete-profile');
          }
        } else {
          // Sign in mode:
          // If no password was entered, send verification / sign-in link directly!
          if (!password) {
            await AuthService.sendVerificationLink(email);
            Router.showToastNotification('Verification Link Sent! ✉️', `A verification link has been sent to ${email}. Check your email inbox to sign in.`);
            return;
          }

          // Password was provided: Attempt password authentication
          try {
            const user = await AuthService.login(email, password);
            if (user?.profileCompleted) {
              Router.showToastNotification('Welcome Back!', `Signed in as ${user.username || user.name}.`);
              Router.navigate('/calendar');
            } else {
              Router.showToastNotification('Sign in Successful', 'Please complete your student profile.');
              Router.navigate('/complete-profile');
            }
          } catch (loginErr) {
            const errMsg = loginErr.message || '';
            // If email is not confirmed, automatically dispatch a fresh verification link!
            if (errMsg.toLowerCase().includes('email not confirmed') || loginErr.code === 'email_not_confirmed') {
              try {
                await AuthService.sendVerificationLink(email);
                Router.showToastNotification('Verification Link Sent! ✉️', `Your email is not confirmed yet. A fresh verification link has been sent to ${email}. Check your inbox!`);
              } catch (resendErr) {
                Router.showToastNotification('Sign In Failed', errMsg);
              }
            } else {
              throw loginErr;
            }
          }
        }
      } catch (err) {
        console.error('Authentication error:', err);
        Router.showToastNotification(currentMode === 'signup' ? 'Signup Failed' : 'Sign In Failed', err.message || 'An error occurred during authentication.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = currentMode === 'signup' ? 'Create Account' : 'Sign in';
        }
      }
    });
  }

  // Forgot password link click
  forgotPwdLink?.addEventListener('click', (e) => {
    e.preventDefault();
    openForgotPasswordModal(emailInput?.value || '');
  });

  // Google SSO button handler
  if (googleBtn) {
    googleBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await AuthService.loginWithGoogle();
    });
  }
}

/* ==========================================================================
   1.4 MODAL UTILITIES & OTP INPUT HELPERS
   ========================================================================== */

function showModalAlert(alertEl, message, type = 'error') {
  if (!alertEl) return;
  alertEl.className = `auth-alert ${type === 'success' ? 'alert-success' : 'alert-warning'}`;
  alertEl.textContent = message;
  alertEl.classList.remove('hidden');
}

function hideModalAlert(alertEl) {
  if (!alertEl) return;
  alertEl.className = 'auth-alert hidden';
  alertEl.textContent = '';
}

function setButtonLoading(btnEl, isLoading) {
  if (!btnEl) return;
  btnEl.disabled = isLoading;
  const spinner = btnEl.querySelector('.btn-spinner');
  if (spinner) spinner.classList.toggle('hidden', !isLoading);
}

function setupOtpInputs(containerId, onSubmit) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll('.otp-digit'));

  inputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[0] : '';
      if (val && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
      if (idx === inputs.length - 1 && inputs.every(i => i.value)) {
        if (typeof onSubmit === 'function') onSubmit();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        inputs[idx - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (!pasteData) return;
      pasteData.split('').slice(0, inputs.length).forEach((char, i) => {
        inputs[i].value = char;
      });
      const nextIdx = Math.min(pasteData.length, inputs.length - 1);
      inputs[nextIdx].focus();
      if (inputs.every(i => i.value) && typeof onSubmit === 'function') {
        onSubmit();
      }
    });
  });
}

/* ==========================================================================
   1.5 FORGOT PASSWORD WITH EMAIL OTP MODAL
   ========================================================================== */

let currentForgotEmail = '';
let currentForgotOtp = '';

export function openForgotPasswordModal(prefillEmail = '') {
  const modal = document.getElementById('forgot-password-modal');
  const emailInput = document.getElementById('forgot-email');
  const alertBox = document.getElementById('forgot-alert');
  
  hideModalAlert(alertBox);
  setForgotStep(1);

  if (emailInput && prefillEmail) {
    emailInput.value = prefillEmail.trim();
  }

  if (modal) {
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      if (emailInput && !emailInput.value) emailInput.focus();
    }, 100);
  }
}

function closeForgotPasswordModal() {
  const modal = document.getElementById('forgot-password-modal');
  if (modal) modal.setAttribute('aria-hidden', 'true');
}

function setForgotStep(step) {
  const title = document.getElementById('forgot-step-title');
  const desc = document.getElementById('forgot-step-desc');
  const step1 = document.getElementById('forgot-step-1');
  const step2 = document.getElementById('forgot-step-2');
  const step3 = document.getElementById('forgot-step-3');

  step1?.classList.toggle('hidden', step !== 1);
  step2?.classList.toggle('hidden', step !== 2);
  step3?.classList.toggle('hidden', step !== 3);

  if (step === 1) {
    if (title) title.textContent = 'Reset Your Password';
    if (desc) desc.textContent = 'Enter your registered email address to receive a 6-digit verification code.';
  } else if (step === 2) {
    if (title) title.textContent = 'Enter Verification Code';
    if (desc) desc.textContent = `A 6-digit code was sent to ${currentForgotEmail}. Enter the code below.`;
    const digits = document.querySelectorAll('#forgot-otp-container .otp-digit');
    digits.forEach(d => d.value = '');
    if (digits[0]) setTimeout(() => digits[0].focus(), 100);
  } else if (step === 3) {
    if (title) title.textContent = 'Create New Password';
    if (desc) desc.textContent = 'Choose a secure new password for your Evently campus account.';
    const newPass = document.getElementById('forgot-new-password');
    const confirmPass = document.getElementById('forgot-confirm-password');
    if (newPass) newPass.value = '';
    if (confirmPass) confirmPass.value = '';
    if (newPass) setTimeout(() => newPass.focus(), 100);
  }
}

function initForgotPasswordModal() {
  const closeBtn = document.getElementById('modal-close-forgot');
  const backdrop = document.getElementById('backdrop-forgot');
  const alertBox = document.getElementById('forgot-alert');

  closeBtn?.addEventListener('click', closeForgotPasswordModal);
  backdrop?.addEventListener('click', closeForgotPasswordModal);

  // OTP inputs handler
  setupOtpInputs('forgot-otp-container', () => {
    document.getElementById('btn-forgot-verify-otp')?.click();
  });

  // Step 1: Send OTP / Password Recovery Email via Supabase Auth
  const btnSend = document.getElementById('btn-forgot-send-otp');
  btnSend?.addEventListener('click', async () => {
    const email = document.getElementById('forgot-email')?.value.trim();
    if (!email || !email.includes('@')) {
      showModalAlert(alertBox, 'Please enter a valid email address.', 'error');
      return;
    }
    
    currentForgotEmail = email;
    setButtonLoading(btnSend, true);
    hideModalAlert(alertBox);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;

      setForgotStep(2);
      showModalAlert(alertBox, 'Verification code dispatched to your email!', 'success');
    } catch (err) {
      showModalAlert(alertBox, err.message || 'Could not send verification code.', 'error');
    } finally {
      setButtonLoading(btnSend, false);
    }
  });

  // Resend OTP in Step 2
  const btnResend = document.getElementById('btn-forgot-resend-otp');
  btnResend?.addEventListener('click', async () => {
    if (!currentForgotEmail) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(currentForgotEmail);
      if (error) throw error;
      showModalAlert(alertBox, 'A new verification code has been dispatched to your email.', 'success');
    } catch (e) {
      showModalAlert(alertBox, e.message || 'Failed to resend code.', 'error');
    }
  });

  // Step 2: Verify OTP via Supabase Auth
  const btnVerify = document.getElementById('btn-forgot-verify-otp');
  btnVerify?.addEventListener('click', async () => {
    const digits = Array.from(document.querySelectorAll('#forgot-otp-container .otp-digit')).map(i => i.value).join('');
    if (digits.length < 6) {
      showModalAlert(alertBox, 'Please enter all 6 digits of the OTP code.', 'error');
      return;
    }

    currentForgotOtp = digits;
    setButtonLoading(btnVerify, true);
    hideModalAlert(alertBox);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: currentForgotEmail,
        token: digits,
        type: 'recovery'
      });
      if (error) throw error;

      setForgotStep(3);
    } catch (err) {
      showModalAlert(alertBox, err.message || 'Invalid or expired OTP code.', 'error');
    } finally {
      setButtonLoading(btnVerify, false);
    }
  });

  // Step 3: Save New Password via Supabase Auth
  const btnSave = document.getElementById('btn-forgot-save-password');
  btnSave?.addEventListener('click', async () => {
    const newPassword = document.getElementById('forgot-new-password')?.value;
    const confirmPassword = document.getElementById('forgot-confirm-password')?.value;

    if (!newPassword || newPassword.length < 6) {
      showModalAlert(alertBox, 'Password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showModalAlert(alertBox, 'Passwords do not match.', 'error');
      return;
    }

    setButtonLoading(btnSave, true);
    hideModalAlert(alertBox);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;

      closeForgotPasswordModal();
      Router.showToastNotification('Password Updated Successfully!', 'You can now sign in with your new password.');

      // Prefill login form
      const loginEmail = document.getElementById('login-email');
      const loginPass = document.getElementById('login-password');
      if (loginEmail) loginEmail.value = currentForgotEmail;
      if (loginPass) loginPass.value = newPassword;
      Router.navigate('/login');
    } catch (err) {
      showModalAlert(alertBox, err.message || 'Could not reset password.', 'error');
    } finally {
      setButtonLoading(btnSave, false);
    }
  });
}

/* ==========================================================================
   1.6 GOOGLE TWO-WAY VERIFICATION MODAL & LOGIC
   ========================================================================== */

// Google 2-Way verification fallback modal has been decommissioned.
// Google authentication is strictly handled via Supabase Auth + Google OAuth.
export function showGoogleVerifyModal() {}
export function closeGoogleVerifyModal() {}
export function initGoogleVerifyModal() {}

/* ==========================================================================
   1.7 GOOGLE & SUPABASE OAUTH INTEGRATION
   ========================================================================== */

let isProcessingOAuth = false;

function prefillProfileForm(user) {
  if (!user) return;
  const collegeInput = document.getElementById('profile-college');
  if (collegeInput && user.college && !collegeInput.value) {
    collegeInput.value = user.college;
  }
}

async function handleOAuthSession(session) {
  if (!session || !session.user || isProcessingOAuth) return;
  isProcessingOAuth = true;

  try {
    // Clean browser address bar of OAuth hash fragments and PKCE codes
    if (window.location.hash || window.location.search.includes('code=')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const user = await AuthService.syncWithBackend(session);
    prefillProfileForm(user);

    if (!user || !user.profileCompleted) {
      Router.showToastNotification('Welcome to Evently!', `Welcome, ${user?.name || 'Student'}! Please complete your student profile.`);
      Router.navigate('/complete-profile');
    } else {
      Router.showToastNotification('Welcome Back!', `Signed in as ${user.name || user.username}.`);
      Router.navigate('/calendar');
    }
  } catch (err) {
    console.error('Error handling OAuth session:', err);
  } finally {
    isProcessingOAuth = false;
  }
}

function initGoogleIdentityServices() {
  if (!GOOGLE_CLIENT_ID || typeof window === 'undefined' || !window.google || !window.google.accounts) return;

  try {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        if (response && response.credential) {
          try {
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential
            });
            if (!error && data?.session) {
              await handleOAuthSession(data.session);
              return;
            }
          } catch (e) {
            console.debug('Supabase signInWithIdToken note:', e);
          }
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true
    });

    const path = window.location.pathname;
    if (!AuthService.isAuthenticated() && path === '/login') {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          console.debug('GIS prompt not displayed:', notification.getNotDisplayedReason());
        }
      });
    }
  } catch (err) {
    console.debug('GIS initialization note:', err);
  }
}

async function initGoogleAuth() {
  try {
    const hasOAuthParams = window.location.hash.includes('access_token=') || window.location.search.includes('code=');
    if (hasOAuthParams) {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session && session.user) {
        await handleOAuthSession(session);
      }
    }
  } catch (err) {
    console.warn('Error fetching Supabase session:', err);
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    const hasOAuthParams = window.location.hash.includes('access_token=') || window.location.search.includes('code=');
    if (event === 'SIGNED_IN' && session && (hasOAuthParams || window.location.pathname === '/login')) {
      await handleOAuthSession(session);
    } else if (event === 'SIGNED_OUT') {
      localStorage.removeItem(AUTH_KEY);
      Router.handleRoute();
    }
  });

  setTimeout(initGoogleIdentityServices, 600);
}


/* ==========================================================================
   2. PROFILE COMPLETION FORM HANDLER (/complete-profile)
   ========================================================================== */

function initProfileCompletionForm() {
  const profileForm = document.getElementById('profile-completion-form');
  const degreeSelect = document.getElementById('profile-degree');
  const collegeInput = document.getElementById('profile-college');
  const branchSelect = document.getElementById('profile-branch');
  const gradYearSelect = document.getElementById('profile-grad-year');
  const countrySelect = document.getElementById('profile-country');
  const chipGrid = document.getElementById('interests-chip-grid');
  const countBadge = document.getElementById('interests-count-badge');
  const interestsError = document.getElementById('interests-error');

  if (!profileForm || !chipGrid) return;

  // College quick tags click listeners
  const quickTagBtns = document.querySelectorAll('.college-quick-btn');
  quickTagBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const collegeVal = btn.getAttribute('data-college');
      if (collegeInput && collegeVal) {
        collegeInput.value = collegeVal;
        collegeInput.focus();
      }
    });
  });

  const selectedInterests = new Set();

  chipGrid.querySelectorAll('.interest-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const val = chip.getAttribute('data-value');
      if (selectedInterests.has(val)) {
        selectedInterests.delete(val);
        chip.classList.remove('selected');
      } else {
        selectedInterests.add(val);
        chip.classList.add('selected');
      }

      if (countBadge) {
        countBadge.textContent = `${selectedInterests.size} selected`;
      }

      if (selectedInterests.size > 0 && interestsError) {
        interestsError.classList.add('hidden');
      }
    });
  });

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const degree = degreeSelect?.value;
    const college = collegeInput?.value?.trim();
    const branch = branchSelect?.value;
    const gradYear = gradYearSelect?.value;
    const country = countrySelect?.value;

    if (!degree || !college || !branch || !gradYear || !country) {
      Router.showToastNotification('Missing Fields', 'Please fill out all required profile fields (*).');
      return;
    }

    if (selectedInterests.size === 0) {
      if (interestsError) interestsError.classList.remove('hidden');
      Router.showToastNotification('Interests Required', 'Please select at least one event category you are interested in.');
      return;
    }

    const user = AuthService.getUser();
    const profileData = {
      username: user?.username || 'student_user',
      email: user?.email || 'student@college.edu',
      degree: degree,
      college: college,
      branch: branch,
      graduation_year: parseInt(gradYear, 10),
      country: country,
      interests: Array.from(selectedInterests),
      profile_completed: true,
      updated_at: new Date().toISOString()
    };

    await AuthService.completeProfile(profileData);
    Router.showToastNotification('Profile Completed!', 'Welcome to Evently! Redirecting to your calendar...');
    Router.navigate('/calendar');
  });
}

/* ==========================================================================
   3. MAIN EVENT CALENDAR DASHBOARD LOGIC (/calendar)
   ========================================================================== */

export function mapBackendEvent(e) {
  const categoryIcons = {
    'Coding Competitions': '🏆',
    'Technical & Hackathons': '🚀',
    'Technical Workshops': '💻',
    'Cultural & Arts': '🎭',
    'Sports & Fitness': '⚽',
    'Guest Lectures & Seminars': '🎓',
    'Career & Placement': '💼',
    'Academic & Workshops': '📚'
  };
  const categoryPills = {
    'Coding Competitions': 'pill-coding',
    'Technical & Hackathons': 'pill-technical',
    'Technical Workshops': 'pill-workshop',
    'Cultural & Arts': 'pill-cultural',
    'Sports & Fitness': 'pill-sports',
    'Guest Lectures & Seminars': 'pill-guest',
    'Career & Placement': 'pill-placement',
    'Academic & Workshops': 'pill-academic'
  };

  const rawDateStr = typeof e.date === 'string' ? e.date.split('T')[0] : '2026-09-19';
  const d = new Date(rawDateStr + 'T12:00:00');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const displayDate = `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  return {
    id: e.id,
    title: e.title,
    category: e.category,
    pillClass: categoryPills[e.category] || 'pill-technical',
    icon: categoryIcons[e.category] || '📌',
    dateStr: rawDateStr,
    displayDate: displayDate,
    time: (e.start_time && e.end_time) ? `${e.start_time} - ${e.end_time}` : (e.start_time || '10:00 AM'),
    venue: e.venue,
    organizer: e.organizer,
    capacity: e.capacity || 500,
    registeredCount: e.registered_count ?? e.registeredCount ?? 0,
    registrationDeadline: e.registration_deadline || e.registrationDeadline,
    description: e.description || '',
    status: e.status || 'REGISTRATION_OPEN',
    statusText: e.status_text || 'Registration open',
    statusBadgeClass: e.status_badge_class || 'badge-open',
    canRegister: e.can_register !== undefined ? e.can_register : true
  };
}

function getMasterEventsList() {
  return window.CAMPUS_EVENTS_DATASET || [];
}

function initCalendarDashboard() {
  const daysGrid = document.getElementById('cal-main-days-grid');
  const monthTitle = document.getElementById('cal-current-month-title');
  const prevMonthBtn = document.getElementById('cal-prev-month');
  const nextMonthBtn = document.getElementById('cal-next-month');
  const todayBtn = document.getElementById('cal-today-btn');
  const categoryFilter = document.getElementById('cal-category-filter');
  const searchInput = document.getElementById('dash-search-input');
  
  // Modals & Drawer Elements
  const detailsModal = document.getElementById('event-details-modal');
  const modalCloseBtn = document.getElementById('modal-close-event-details');
  const modalCloseBtn2 = document.getElementById('modal-btn-close');
  const modalRegisterBtn = document.getElementById('modal-btn-register');
  const backdropDetails = document.getElementById('backdrop-event-details');
  
  const confirmModal = document.getElementById('registration-confirm-modal');
  const confirmCancelBtn = document.getElementById('confirm-btn-cancel');
  const confirmSubmitBtn = document.getElementById('confirm-btn-submit');
  const backdropConfirm = document.getElementById('backdrop-confirm');
  
  const registrationsModal = document.getElementById('my-registrations-modal');
  const regCloseBtn = document.getElementById('modal-close-registrations');
  const openRegsBtn = document.getElementById('btn-open-my-registrations');
  const backdropRegs = document.getElementById('backdrop-registrations');
  const regListContainer = document.getElementById('registrations-list-container');
  
  const drawer = document.getElementById('date-events-drawer');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');

  if (!daysGrid) return;

  // Calendar State (Default today: Sep 19, 2026)
  let currentYear = 2026;
  let currentMonth = 8; // 0-indexed (8 = September)
  let selectedDateStr = '2026-09-19';
  let activeEventForRegistration = null;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  async function syncBackendEvents() {
    try {
      const res = await fetch(`${API_URL}/events`);
      if (res.ok) {
        const eventsData = await res.json();
        if (Array.isArray(eventsData)) {
          window.CAMPUS_EVENTS_DATASET = eventsData.map(mapBackendEvent);
          renderGrid();
        }
      }
    } catch (e) {
      console.warn('Backend events fetch error:', e);
    }
  }

  async function syncUserRegistrations() {
    const user = AuthService.getUser();
    if (user && user.token) {
      try {
        const res = await fetch(`${API_URL}/registrations/me`, {
          headers: { 'Authorization': `Bearer ${user.token}` }
        });
        if (res.ok) {
          const regs = await res.json();
          user.registeredEvents = regs.map(r => r.event_id);
          localStorage.setItem(AUTH_KEY, JSON.stringify(user));
          renderGrid();
        }
      } catch (e) {
        console.warn('Backend registrations fetch offline:', e);
      }
    }
  }

  window.refreshCalendar = async () => {
    await syncBackendEvents();
    await syncUserRegistrations();
  };

  syncBackendEvents();
  syncUserRegistrations();

  function renderEventListPanel(events) {
    const listFeed = document.getElementById('event-list-feed');
    if (!listFeed) return;

    listFeed.innerHTML = '';

    if (events.length === 0) {
      listFeed.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); font-size: 0.875rem;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
          <p style="font-weight: 700; color: var(--text-dark);">No events found</p>
          <p style="font-size: 0.775rem;">Try adjusting your search query or category filter.</p>
        </div>
      `;
      return;
    }

    // Group events by dateStr
    const grouped = {};
    events.forEach(evt => {
      if (!grouped[evt.dateStr]) {
        grouped[evt.dateStr] = [];
      }
      grouped[evt.dateStr].push(evt);
    });

    const sortedDates = Object.keys(grouped).sort();

    sortedDates.forEach(dateStr => {
      const groupContainer = document.createElement('div');
      groupContainer.className = 'event-date-group';

      const dateParts = dateStr.split('-');
      const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthShort = monthNamesShort[parseInt(dateParts[1], 10) - 1] || 'Sep';
      const formattedHeaderDate = `${dateParts[2]} ${monthShort} ${dateParts[0]}`;

      const headerEl = document.createElement('div');
      headerEl.className = 'event-date-group-title';
      headerEl.textContent = formattedHeaderDate;
      groupContainer.appendChild(headerEl);

      grouped[dateStr].forEach(evt => {
        const isReg = AuthService.isUserRegistered(evt.id);
        const statusInfo = window.getEventStatus ? window.getEventStatus(evt) : { isPast: false, canRegister: true, statusText: 'Open' };
        
        let statusBadgeMarkup = '';
        if (isReg) {
          statusBadgeMarkup = '<span class="registered-count-tag is-registered">✓ Registered</span>';
        } else if (statusInfo.isPast) {
          statusBadgeMarkup = '<span class="registered-count-tag" style="color:var(--text-muted);">Event completed</span>';
        } else if (statusInfo.isDeadlinePassed) {
          statusBadgeMarkup = '<span class="registered-count-tag" style="color:#dc2626;">Deadline over</span>';
        } else {
          statusBadgeMarkup = `<span class="registered-count-tag">👥 ${evt.registeredCount} registered</span>`;
        }

        const card = document.createElement('div');
        card.className = 'event-list-card-item';
        card.innerHTML = `
          <div class="event-list-card-time">⏰ ${evt.time}</div>
          <div class="event-list-card-title">${evt.icon} ${evt.title}</div>
          <div class="event-list-card-footer">
            ${statusBadgeMarkup}
            <span style="font-weight: 700; color: #ea580c; font-size: 0.75rem;">Details →</span>
          </div>
        `;

        card.addEventListener('click', () => {
          Router.navigate(`/event?id=${evt.id}`);
        });

        groupContainer.appendChild(card);
      });

      listFeed.appendChild(groupContainer);
    });
  }

  function renderGrid() {
    daysGrid.innerHTML = '';
    const selectedCategory = categoryFilter?.value || 'all';
    const searchQuery = (searchInput?.value || '').trim().toLowerCase();
    const masterEvents = getMasterEventsList();

    // Set month title text
    if (monthTitle) {
      monthTitle.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    }

    // Filter events for the entire month for middle panel feed
    let allFilteredEvents = masterEvents.slice();
    if (selectedCategory !== 'all') {
      allFilteredEvents = allFilteredEvents.filter(evt => evt.category === selectedCategory);
    }
    if (searchQuery) {
      allFilteredEvents = allFilteredEvents.filter(evt =>
        evt.title.toLowerCase().includes(searchQuery) ||
        evt.category.toLowerCase().includes(searchQuery) ||
        evt.venue.toLowerCase().includes(searchQuery) ||
        (evt.organizer && evt.organizer.toLowerCase().includes(searchQuery))
      );
    }

    renderEventListPanel(allFilteredEvents);

    // Days calculation
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

    // 1. Render Previous Month Days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const cell = document.createElement('div');
      cell.className = 'cal-date-cell other-month';
      cell.innerHTML = `<div class="date-cell-header"><span class="date-num">${dayNum}</span></div>`;
      daysGrid.appendChild(cell);
    }

    // 2. Render Current Month Days (Simulated today: Sep 19, 2026)
    const isCurrentRealMonth = (currentYear === 2026 && currentMonth === 8);
    const realTodayDate = 19;

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dayTwoDigit = String(d).padStart(2, '0');
      const monthTwoDigit = String(currentMonth + 1).padStart(2, '0');
      const dateStr = `${currentYear}-${monthTwoDigit}-${dayTwoDigit}`;

      const cell = document.createElement('div');
      cell.className = 'cal-date-cell';

      if (isCurrentRealMonth && d === realTodayDate) {
        cell.classList.add('date-cell-today');
      }
      if (dateStr === selectedDateStr) {
        cell.classList.add('date-cell-selected');
      }

      const cellHeader = document.createElement('div');
      cellHeader.className = 'date-cell-header';
      cellHeader.innerHTML = `<span class="date-num">${d}</span>`;
      cell.appendChild(cellHeader);

      // Filter events for date
      let dayEvents = masterEvents.filter(evt => evt.dateStr === dateStr);

      if (selectedCategory !== 'all') {
        dayEvents = dayEvents.filter(evt => evt.category === selectedCategory);
      }
      if (searchQuery) {
        dayEvents = dayEvents.filter(evt =>
          evt.title.toLowerCase().includes(searchQuery) ||
          evt.category.toLowerCase().includes(searchQuery) ||
          evt.venue.toLowerCase().includes(searchQuery) ||
          (evt.organizer && evt.organizer.toLowerCase().includes(searchQuery))
        );
      }

      // Render Pills
      if (dayEvents.length > 0) {
        const pillsList = document.createElement('div');
        pillsList.className = 'event-pills-list';

        const maxVisiblePills = 2;
        const visibleEvents = dayEvents.slice(0, maxVisiblePills);
        const overflowCount = dayEvents.length - maxVisiblePills;

        visibleEvents.forEach(evt => {
          const isReg = AuthService.isUserRegistered(evt.id);
          const pill = document.createElement('div');
          pill.className = `event-pill ${evt.pillClass || 'pill-tech'}`;
          pill.innerHTML = `
            <span>${evt.icon || '📌'}</span>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${evt.title}</span>
            ${isReg ? '<span class="pill-registered-badge">✓</span>' : ''}
          `;
          pill.addEventListener('click', (e) => {
            e.stopPropagation();
            Router.navigate(`/event?id=${evt.id}`);
          });
          pillsList.appendChild(pill);
        });

        if (overflowCount > 0) {
          const moreBtn = document.createElement('div');
          moreBtn.className = 'pill-more-btn';
          moreBtn.textContent = `+ ${overflowCount} more`;
          moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDateDrawer(dateStr, dayEvents);
          });
          pillsList.appendChild(moreBtn);
        }

        cell.appendChild(pillsList);
      }

      // Click date cell to select date
      cell.addEventListener('click', () => {
        selectedDateStr = dateStr;
        renderGrid();
        openDateDrawer(dateStr, dayEvents);
      });

      daysGrid.appendChild(cell);
    }

    // 3. Render Next Month Days (to reach 35 or 42 grid cells)
    const currentTotalCells = startingDayOfWeek + totalDaysInMonth;
    const remainingCells = (currentTotalCells > 35 ? 42 : 35) - currentTotalCells;

    for (let j = 1; j <= remainingCells; j++) {
      const cell = document.createElement('div');
      cell.className = 'cal-date-cell other-month';
      cell.innerHTML = `<div class="date-cell-header"><span class="date-num">${j}</span></div>`;
      daysGrid.appendChild(cell);
    }
  }

  // Event Details Modal Popup
  async function openEventDetails(evt) {
    activeEventForRegistration = evt;

    try {
      const res = await fetch(`${API_URL}/events/${evt.id}`);
      if (res.ok) {
        const live = await res.json();
        activeEventForRegistration = mapBackendEvent(live);
        evt = activeEventForRegistration;
      }
    } catch (e) {
      console.debug('Using cached event details:', e);
    }

    const catEl = document.getElementById('modal-event-cat');
    const titleEl = document.getElementById('modal-event-title');
    const orgEl = document.getElementById('modal-event-org');
    const dateEl = document.getElementById('modal-event-date');
    const timeEl = document.getElementById('modal-event-time');
    const venueEl = document.getElementById('modal-event-venue');
    const seatsEl = document.getElementById('modal-event-seats');
    const progressEl = document.getElementById('modal-seat-progress');
    const descEl = document.getElementById('modal-event-desc');

    if (catEl) catEl.textContent = evt.category.toUpperCase();
    if (titleEl) titleEl.textContent = evt.title;
    if (orgEl) orgEl.textContent = `🏢 Organized by ${evt.organizer || 'College Board'}`;
    if (dateEl) dateEl.textContent = evt.displayDate;
    if (timeEl) timeEl.textContent = evt.time;
    if (venueEl) venueEl.textContent = evt.venue;
    if (descEl) descEl.textContent = evt.description;

    const totalSeats = evt.capacity || evt.totalSeats || 100;
    const regCount = evt.registeredCount || 0;
    const availSeats = Math.max(0, totalSeats - regCount);

    if (seatsEl) seatsEl.textContent = `${availSeats} / ${totalSeats} Seats Available`;
    if (progressEl) {
      const percentage = Math.round((availSeats / totalSeats) * 100);
      progressEl.style.width = `${percentage}%`;
    }

    updateModalRegisterButtonState(evt.id);

    if (detailsModal) detailsModal.setAttribute('aria-hidden', 'false');
  }

  function updateModalRegisterButtonState(eventId) {
    if (!modalRegisterBtn) return;
    const masterEvents = getMasterEventsList();
    const evt = masterEvents.find(e => e.id === eventId) || activeEventForRegistration;
    const isReg = AuthService.isUserRegistered(eventId);
    const statusInfo = evt && evt.status
      ? {
          isPast: evt.status === 'COMPLETED',
          isDeadlinePassed: evt.status === 'REGISTRATION_CLOSED',
          canRegister: evt.canRegister !== undefined ? evt.canRegister : evt.can_register,
          statusText: evt.statusText || evt.status_text || 'Open'
        }
      : (window.getEventStatus && evt ? window.getEventStatus(evt) : { isPast: false, canRegister: true });

    if (isReg) {
      modalRegisterBtn.textContent = '✓ Registered (Click to Cancel)';
      modalRegisterBtn.className = 'btn btn-secondary btn-lg';
      modalRegisterBtn.disabled = false;
    } else if (statusInfo.isPast) {
      modalRegisterBtn.textContent = 'Event Completed';
      modalRegisterBtn.className = 'btn btn-secondary btn-lg';
      modalRegisterBtn.disabled = true;
    } else if (statusInfo.isDeadlinePassed) {
      modalRegisterBtn.textContent = 'Registration Deadline Over';
      modalRegisterBtn.className = 'btn btn-secondary btn-lg';
      modalRegisterBtn.disabled = true;
    } else {
      modalRegisterBtn.textContent = 'Register for Event →';
      modalRegisterBtn.className = 'btn btn-primary btn-lg';
      modalRegisterBtn.disabled = false;
    }
  }

  function closeDetailsModal() {
    if (detailsModal) detailsModal.setAttribute('aria-hidden', 'true');
  }

  // Registration Confirmation Modal
  if (modalRegisterBtn) {
    modalRegisterBtn.addEventListener('click', async () => {
      if (!activeEventForRegistration) return;
      const statusInfo = activeEventForRegistration.status
        ? {
            isPast: activeEventForRegistration.status === 'COMPLETED',
            isDeadlinePassed: activeEventForRegistration.status === 'REGISTRATION_CLOSED',
            canRegister: activeEventForRegistration.canRegister !== undefined ? activeEventForRegistration.canRegister : activeEventForRegistration.can_register
          }
        : (window.getEventStatus ? window.getEventStatus(activeEventForRegistration) : { canRegister: true });
      const isReg = AuthService.isUserRegistered(activeEventForRegistration.id);

      if (isReg) {
        // Cancel Registration via backend API
        const user = AuthService.getUser();
        if (user && user.token) {
          try {
            await fetch(`${API_URL}/registrations/${activeEventForRegistration.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${user.token}` }
            });
          } catch (e) {
            console.warn('Backend cancel registration error:', e);
          }
        }
        AuthService.cancelRegistration(activeEventForRegistration.id);
        Router.showToastNotification('Registration Cancelled', `You have cancelled your spot for ${activeEventForRegistration.title}.`);
        updateModalRegisterButtonState(activeEventForRegistration.id);
        Router.updateNavbar(true, '/calendar');
        renderGrid();
      } else if (statusInfo.canRegister) {
        closeDetailsModal();
        Router.navigate(`/event?id=${activeEventForRegistration.id}`);
      }
    });
  }

  if (confirmSubmitBtn) {
    confirmSubmitBtn.addEventListener('click', async () => {
      if (activeEventForRegistration) {
        const user = AuthService.getUser();
        if (user && user.token) {
          try {
            const res = await fetch(`${API_URL}/registrations`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
              },
              body: JSON.stringify({ event_id: activeEventForRegistration.id })
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              if (confirmModal) confirmModal.setAttribute('aria-hidden', 'true');
              Router.showToastNotification('Registration Failed', err.detail || 'Could not register for event.');
              return;
            }
          } catch (e) {
            console.warn('Backend registration error:', e);
          }
        }
        AuthService.registerEvent(activeEventForRegistration.id);
        if (confirmModal) confirmModal.setAttribute('aria-hidden', 'true');
        Router.showToastNotification('Registration Successful! 🎉', `You are registered for ${activeEventForRegistration.title}. Check My Registrations for pass details.`);
        Router.updateNavbar(true, '/calendar');
        renderGrid();
      }
    });
  }

  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener('click', () => {
      if (confirmModal) confirmModal.setAttribute('aria-hidden', 'true');
    });
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeDetailsModal);
  if (modalCloseBtn2) modalCloseBtn2.addEventListener('click', closeDetailsModal);
  if (backdropDetails) backdropDetails.addEventListener('click', closeDetailsModal);
  if (backdropConfirm) backdropConfirm.addEventListener('click', () => confirmModal?.setAttribute('aria-hidden', 'true'));

  // My Registrations Modal
  if (openRegsBtn) {
    openRegsBtn.addEventListener('click', () => {
      renderMyRegistrationsList();
      if (registrationsModal) registrationsModal.setAttribute('aria-hidden', 'false');
    });
  }

  if (regCloseBtn) regCloseBtn.addEventListener('click', () => registrationsModal?.setAttribute('aria-hidden', 'true'));
  if (backdropRegs) backdropRegs.addEventListener('click', () => registrationsModal?.setAttribute('aria-hidden', 'true'));

  async function renderMyRegistrationsList() {
    if (!regListContainer) return;
    const user = AuthService.getUser();
    let registeredEvts = [];
    if (user && user.token) {
      try {
        const res = await fetch(`${API_URL}/registrations/me`, {
          headers: { 'Authorization': `Bearer ${user.token}` }
        });
        if (res.ok) {
          const raw = await res.json();
          registeredEvts = raw.map(r => r.event ? mapBackendEvent(r.event) : null).filter(Boolean);
          user.registeredEvents = raw.map(r => r.event_id);
          localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        }
      } catch (e) {
        console.warn('Could not fetch registrations from backend:', e);
      }
    }
    if (registeredEvts.length === 0) {
      const registeredIds = AuthService.getRegistrations();
      const masterEvents = getMasterEventsList();
      registeredEvts = masterEvents.filter(evt => registeredIds.includes(evt.id));
    }

    if (registeredEvts.length === 0) {
      regListContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎫</div>
          <p>No active event registrations found.</p>
          <p style="font-size: 0.8rem;">Select any upcoming event on the calendar and click Register to reserve your pass!</p>
        </div>
      `;
      return;
    }

    regListContainer.innerHTML = registeredEvts.map(evt => `
      <div class="ticket-card">
        <div class="ticket-info">
          <span class="event-cat-badge">${evt.category.toUpperCase()}</span>
          <h4>${evt.title}</h4>
          <p>📅 ${evt.displayDate} | ⏰ ${evt.time}</p>
          <p>📍 ${evt.venue}</p>
        </div>
        <div class="ticket-qr">
          <svg width="60" height="60" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="#ffffff" />
            <path d="M10 10h30v30h-30zM60 10h30v30h-30zM10 60h30v30h-30zM20 20h10v10h-10zM70 20h10v10h-10zM20 70h10v10h-10zM50 50h10v10h-10zM70 70h20v20h-20z" fill="#0f172a" />
          </svg>
          <span style="font-size:0.6rem; font-weight:800; color:#ea580c; margin-top:2px;">PASS CONFIRMED</span>
        </div>
      </div>
    `).join('');
  }

  // Date Drawer Panel
  function openDateDrawer(dateStr, dayEvents) {
    const titleEl = document.getElementById('drawer-date-title');
    const countEl = document.getElementById('drawer-date-count');
    const listEl = document.getElementById('drawer-events-list');

    const formattedDate = new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    if (titleEl) titleEl.textContent = formattedDate;
    if (countEl) countEl.textContent = `${dayEvents.length} Event${dayEvents.length === 1 ? '' : 's'} Scheduled`;

    if (listEl) {
      if (dayEvents.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">📅</div>
            <p>No scheduled events for this date.</p>
          </div>
        `;
      } else {
        listEl.innerHTML = dayEvents.map(evt => {
          const isReg = AuthService.isUserRegistered(evt.id);
          const statusInfo = window.getEventStatus ? window.getEventStatus(evt) : { isPast: false, canRegister: true };
          
          let btnText = 'Register Now';
          let btnClass = 'btn-primary';
          let btnDisabled = false;

          if (isReg) {
            btnText = '✓ Registered';
            btnClass = 'btn-secondary';
          } else if (statusInfo.isPast) {
            btnText = 'Event Completed';
            btnClass = 'btn-secondary';
            btnDisabled = true;
          } else if (statusInfo.isDeadlinePassed) {
            btnText = 'Deadline Over';
            btnClass = 'btn-secondary';
            btnDisabled = true;
          }

          return `
            <div class="drawer-event-card">
              <span class="event-cat-badge">${evt.category}</span>
              <h4>${evt.title}</h4>
              <p style="font-size: 0.8rem; color: var(--text-muted);">⏰ ${evt.time} | 📍 ${evt.venue}</p>
              <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <button type="button" class="btn btn-sm ${btnClass} btn-drawer-reg" data-id="${evt.id}" ${btnDisabled ? 'disabled' : ''}>
                  ${btnText}
                </button>
              </div>
            </div>
          `;
        }).join('');

        listEl.querySelectorAll('.btn-drawer-reg').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (drawer) drawer.setAttribute('aria-hidden', 'true');
            Router.navigate(`/event?id=${id}`);
          });
        });
      }
    }

    if (drawer) drawer.setAttribute('aria-hidden', 'false');
  }

  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', () => drawer?.setAttribute('aria-hidden', 'true'));

  // Controls Navigation
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderGrid();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderGrid();
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      currentYear = 2026;
      currentMonth = 8;
      selectedDateStr = '2026-09-24';
      renderGrid();
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', renderGrid);
  }

  if (searchInput) {
    searchInput.addEventListener('input', renderGrid);
  }

  // View Switcher Buttons (Month / Week / Day)
  const viewSwitchBtns = document.querySelectorAll('.view-switch-btn');
  viewSwitchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewSwitchBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const viewMode = btn.getAttribute('data-view');
      if (viewMode !== 'month') {
        Router.showToastNotification(`${viewMode.toUpperCase()} View Selected`, 'Switched to calendar ' + viewMode + ' mode.');
      }
    });
  });

  // Mobile sidebar toggle
  const sidebarToggleBtn = document.getElementById('dash-sidebar-toggle');
  const dashSidebar = document.getElementById('dash-sidebar');
  if (sidebarToggleBtn && dashSidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
      dashSidebar.classList.toggle('open');
    });
  }

  // Initial Grid Render
  renderGrid();
}

/* ==========================================================================
   3.4 MONTHLY EVENTS DIRECTORY VIEW (/events)
   ========================================================================== */

let eventsViewYear = 2026;
let eventsViewMonth = 8; // September (0-indexed)

export async function renderMonthEventsView() {
  const headingEl = document.getElementById('events-month-heading');
  const countEl = document.getElementById('events-count-subtext');
  const currentMonthBtn = document.getElementById('events-current-month-btn');
  const gridEl = document.getElementById('events-month-list-grid');
  const categoryFilter = document.getElementById('events-category-filter');
  const searchInput = document.getElementById('events-search-input');

  if (!gridEl) return;

  let masterEvents = getMasterEventsList();
  if (masterEvents.length === 0) {
    try {
      const res = await fetch(`${API_URL}/events`);
      if (res.ok) {
        const data = await res.json();
        window.CAMPUS_EVENTS_DATASET = data.map(mapBackendEvent);
        masterEvents = window.CAMPUS_EVENTS_DATASET;
      }
    } catch (e) {
      console.warn('Could not fetch events for month view:', e);
    }
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const monthLabel = `${monthNames[eventsViewMonth]} ${eventsViewYear}`;
  if (headingEl) headingEl.textContent = `Events for ${monthLabel}`;
  if (currentMonthBtn) currentMonthBtn.textContent = monthLabel;

  // Filter events by selected month & year
  let monthEvents = masterEvents.filter(evt => {
    if (!evt.dateStr) return false;
    const parts = evt.dateStr.split('-');
    if (parts.length < 2) return false;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // 0-indexed
    return y === eventsViewYear && m === eventsViewMonth;
  });

  // Apply category filter
  const selectedCat = categoryFilter?.value || 'all';
  if (selectedCat !== 'all') {
    monthEvents = monthEvents.filter(e => e.category === selectedCat);
  }

  // Apply search input
  const query = (searchInput?.value || '').trim().toLowerCase();
  if (query) {
    monthEvents = monthEvents.filter(e =>
      e.title.toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query) ||
      e.venue.toLowerCase().includes(query) ||
      (e.organizer && e.organizer.toLowerCase().includes(query))
    );
  }

  // Sort by date ascending
  monthEvents.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  if (countEl) {
    countEl.textContent = `${monthEvents.length} event${monthEvents.length === 1 ? '' : 's'} scheduled in ${monthLabel}.`;
  }

  if (monthEvents.length === 0) {
    gridEl.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1rem; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📅</div>
        <h3 style="color: var(--text-dark); margin: 0 0 0.5rem 0;">No events scheduled for ${monthLabel}</h3>
        <p style="font-size: 0.9rem; margin: 0;">Try navigating to September 2026 or adjusting your category/search filters.</p>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = monthEvents.map(evt => {
    const isReg = AuthService.isUserRegistered(evt.id);
    const totalSeats = evt.capacity || 100;
    const regCount = evt.registeredCount || 0;
    const availSeats = Math.max(0, totalSeats - regCount);
    const percent = Math.min(100, Math.max(10, Math.round(((totalSeats - availSeats) / totalSeats) * 100)));

    const dateParts = evt.dateStr.split('-');
    const shortMonth = monthNames[parseInt(dateParts[1], 10) - 1]?.slice(0, 3) || 'Sep';
    const dayBadge = `${shortMonth} ${dateParts[2]}`;

    return `
      <div class="event-month-card" data-id="${evt.id}" style="cursor: pointer;">
        <div>
          <div class="event-month-card-header">
            <span class="event-month-date-badge">📅 ${dayBadge}</span>
            <span class="event-cat-badge">${evt.category.toUpperCase()}</span>
          </div>

          <h3 class="event-month-title">${evt.icon || '📌'} ${evt.title}</h3>

          <div class="event-month-meta">
            <div class="event-month-meta-item">
              <span>⏰</span> <span>${evt.time}</span>
            </div>
            <div class="event-month-meta-item">
              <span>📍</span> <span>${evt.venue}</span>
            </div>
            <div class="event-month-meta-item">
              <span>🏢</span> <span>${evt.organizer || 'College Board'}</span>
            </div>
          </div>
        </div>

        <div>
          <div class="event-month-capacity">
            <div class="event-month-seats-text">
              <span>Seats Available</span>
              <span>${availSeats} / ${totalSeats}</span>
            </div>
            <div class="seat-progress-bar">
              <div class="seat-progress-fill" style="width: ${percent}%;"></div>
            </div>
          </div>

          <div class="event-month-card-footer">
            ${isReg ? `
              <button type="button" class="btn btn-secondary btn-sm w-full" style="font-weight: 700;">
                ✓ Registered
              </button>
            ` : `
              <button type="button" class="btn btn-primary btn-sm w-full btn-card-register" data-id="${evt.id}">
                View Details & Register →
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach card click handlers
  gridEl.querySelectorAll('.event-month-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      Router.navigate(`/event?id=${id}`);
    });
  });
}

export function initMonthEventsView() {
  const prevBtn = document.getElementById('events-prev-month-btn');
  const nextBtn = document.getElementById('events-next-month-btn');
  const currentBtn = document.getElementById('events-current-month-btn');
  const catFilter = document.getElementById('events-category-filter');
  const searchInput = document.getElementById('events-search-input');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      eventsViewMonth--;
      if (eventsViewMonth < 0) {
        eventsViewMonth = 11;
        eventsViewYear--;
      }
      renderMonthEventsView();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      eventsViewMonth++;
      if (eventsViewMonth > 11) {
        eventsViewMonth = 0;
        eventsViewYear++;
      }
      renderMonthEventsView();
    });
  }

  if (currentBtn) {
    currentBtn.addEventListener('click', () => {
      eventsViewYear = 2026;
      eventsViewMonth = 8; // September
      renderMonthEventsView();
    });
  }

  if (catFilter) catFilter.addEventListener('change', renderMonthEventsView);
  if (searchInput) searchInput.addEventListener('input', renderMonthEventsView);
}

/* ==========================================================================
   3.5 DEDICATED EVENT & CONTEST DETAILS VIEW HANDLER (/event?id=...)
   ========================================================================== */

let currentDetailEvent = null;

export async function renderEventDetailPage(eventId) {
  let evt = null;
  const masterEvents = getMasterEventsList();
  
  if (eventId) {
    evt = masterEvents.find(e => e.id === eventId);
    try {
      const res = await fetch(`${API_URL}/events/${eventId}`);
      if (res.ok) {
        const live = await res.json();
        evt = mapBackendEvent(live);
      }
    } catch (e) {
      console.debug('Using local event dataset for event details view:', e);
    }
  }

  // If no event found in database
  if (!evt) {
    const idTagEl = document.getElementById('detail-event-id-tag');
    const titleEl = document.getElementById('detail-event-title');
    const descEl = document.getElementById('detail-event-description');
    const actionCard = document.getElementById('detail-action-card');
    if (idTagEl) idTagEl.textContent = eventId || 'Not Found';
    if (titleEl) titleEl.textContent = 'Event Not Found';
    if (descEl) descEl.textContent = 'The requested event could not be found in the database or the service is temporarily unavailable.';
    if (actionCard) actionCard.classList.add('hidden');
    return;
  }

  currentDetailEvent = evt;

  // Header Elements
  const idTagEl = document.getElementById('detail-event-id-tag');
  const catEl = document.getElementById('detail-event-category');
  const statusPillEl = document.getElementById('detail-event-status-pill');
  const titleEl = document.getElementById('detail-event-title');
  const canPartEl = document.getElementById('detail-can-participate');
  const ratedRangeEl = document.getElementById('detail-rated-range');
  const penaltyEl = document.getElementById('detail-penalty');

  if (idTagEl) idTagEl.textContent = evt.id;
  if (catEl) catEl.textContent = (evt.category || 'CODING COMPETITION').toUpperCase();
  if (titleEl) titleEl.textContent = evt.title;
  if (canPartEl) canPartEl.textContent = evt.canParticipate || 'All';
  if (ratedRangeEl) ratedRangeEl.textContent = evt.ratedRange || (evt.category?.includes('Coding') ? '1600 - 2999' : 'Open to All');
  if (penaltyEl) penaltyEl.textContent = evt.penalty || (evt.category?.includes('Coding') ? '5 minutes' : 'Standard Rules');

  // Status Pill
  const isRegistered = AuthService.isUserRegistered(evt.id);
  if (statusPillEl) {
    if (isRegistered) {
      statusPillEl.textContent = '● You Are Registered';
      statusPillEl.style.color = '#15803d';
      statusPillEl.style.background = '#dcfce7';
      statusPillEl.style.borderColor = '#86efac';
    } else {
      statusPillEl.textContent = '● Registration Open';
      statusPillEl.style.color = '#10b981';
      statusPillEl.style.background = '#ecfdf5';
      statusPillEl.style.borderColor = '#a7f3d0';
    }
  }

  // Contest Information Elements
  const durationEl = document.getElementById('detail-duration');
  const writerLinkEl = document.getElementById('detail-writer-link');
  const ratedRangeRowEl = document.getElementById('detail-rated-range-row');
  const venueEl = document.getElementById('detail-venue');
  const descEl = document.getElementById('detail-description');

  const writerName = evt.writer || evt.organizer || 'PCTprobability';
  const writerUrl = evt.writerLink || (writerName === 'PCTprobability' ? 'https://atcoder.jp/users/PCTprobability' : 'https://atcoder.jp/users/' + encodeURIComponent(writerName));

  if (durationEl) durationEl.textContent = evt.duration || '150 minutes';
  if (writerLinkEl) {
    writerLinkEl.textContent = writerName;
    writerLinkEl.href = writerUrl;
  }
  if (ratedRangeRowEl) ratedRangeRowEl.textContent = evt.ratedRange || (evt.category?.includes('Coding') ? '1600 - 2999' : 'Open to All Divisions');
  if (venueEl) venueEl.textContent = evt.venue || 'Online / Virtual Arena';
  if (descEl) descEl.textContent = evt.description || 'Official competitive programming contest.';

  // Point Values Table
  const tbodyEl = document.getElementById('detail-points-tbody');
  if (tbodyEl) {
    if (evt.category?.includes('Coding') || evt.category?.includes('Technical') || evt.title.includes('AtCoder')) {
      tbodyEl.innerHTML = `
        <tr><td>A</td><td>800</td><td>Greedy &amp; Implementation</td></tr>
        <tr><td>B</td><td>800</td><td>Math &amp; Number Theory</td></tr>
        <tr><td>C</td><td>900</td><td>Constructive Algorithms</td></tr>
        <tr><td>D</td><td>1000</td><td>Dynamic Programming &amp; Graphs</td></tr>
        <tr><td>E</td><td>1200</td><td>Data Structures &amp; Flow</td></tr>
      `;
    } else if (evt.category?.includes('Workshop')) {
      tbodyEl.innerHTML = `
        <tr><td>Module 1</td><td>200</td><td>Architecture &amp; Core Setup</td></tr>
        <tr><td>Module 2</td><td>400</td><td>Hands-On Lab &amp; Execution</td></tr>
        <tr><td>Module 3</td><td>400</td><td>Capstone Project &amp; Q&amp;A</td></tr>
      `;
    } else {
      tbodyEl.innerHTML = `
        <tr><td>Round 1</td><td>500</td><td>Preliminary Qualification</td></tr>
        <tr><td>Round 2</td><td>800</td><td>Semifinal Evaluation</td></tr>
        <tr><td>Finals</td><td>1200</td><td>Grand Championship Stage</td></tr>
      `;
    }
  }

  // Contest Rules
  const rulesBodyEl = document.getElementById('detail-rules-body');
  if (rulesBodyEl) {
    rulesBodyEl.innerHTML = `
      <p>This contest is <strong>full-feedback</strong> (solutions are judged during the contest).</p>
      <p>When you solve a problem, you get a score assigned to it. Competitors are ranked first by total scores, then by penalties.</p>
      <p>The penalties are computed as <code>(the time you spend to get your current score) + (5 minutes) * (the number of incorrect attempts)</code>.</p>
      <p>Plagiarism, multiple accounts, or communication with other contestants during the contest round is strictly prohibited.</p>
    `;
  }

  // Useful Links
  const linksEl = document.getElementById('detail-useful-links');
  if (linksEl) {
    linksEl.innerHTML = `
      <a href="https://atcoder.jp/" target="_blank" rel="noopener" class="useful-link-item">
        <span class="link-icon">🌐</span>
        <div class="link-text">
          <span class="link-title">AtCoder top page</span>
          <span class="link-url">https://atcoder.jp/</span>
        </div>
        <span class="link-arrow">↗</span>
      </a>
      <a href="https://atcoder.jp/post/2" target="_blank" rel="noopener" class="useful-link-item">
        <span class="link-icon">📖</span>
        <div class="link-text">
          <span class="link-title">How to participate</span>
          <span class="link-url">https://atcoder.jp/post/2</span>
        </div>
        <span class="link-arrow">↗</span>
      </a>
      <a href="https://atcoder.jp/contests/practice" target="_blank" rel="noopener" class="useful-link-item">
        <span class="link-icon">💻</span>
        <div class="link-text">
          <span class="link-title">Practice contest</span>
          <span class="link-url">https://atcoder.jp/contests/practice</span>
        </div>
        <span class="link-arrow">↗</span>
      </a>
    `;
  }

  // Action Card
  updateDetailActionCard(evt);
}

function updateDetailActionCard(evt) {
  const dateEl = document.getElementById('detail-action-date');
  const timeEl = document.getElementById('detail-action-time');
  const seatsEl = document.getElementById('detail-seats-count');
  const progressEl = document.getElementById('detail-seat-progress-fill');
  const regBtn = document.getElementById('detail-btn-register');
  const passPreview = document.getElementById('detail-pass-preview');
  const cancelBtn = document.getElementById('detail-btn-cancel-reg');
  const noticeEl = document.getElementById('detail-register-notice');
  const statusPillEl = document.getElementById('detail-event-status-pill');

  if (dateEl) dateEl.textContent = evt.displayDate || 'Saturday, Sep 19, 2026';
  if (timeEl) timeEl.textContent = evt.time ? `⏰ ${evt.time}` : '⏰ 10:00 AM - 12:30 PM';

  const total = evt.capacity || 500;
  const regCount = evt.registeredCount || 0;
  const avail = Math.max(0, total - regCount);
  const percent = Math.min(100, Math.max(10, Math.round(((total - avail) / total) * 100)));

  if (seatsEl) seatsEl.textContent = `${avail} / ${total} Available`;
  if (progressEl) progressEl.style.width = `${percent}%`;

  const isRegistered = AuthService.isUserRegistered(evt.id);

  if (statusPillEl) {
    if (isRegistered) {
      statusPillEl.textContent = '● You Are Registered';
      statusPillEl.style.color = '#15803d';
      statusPillEl.style.background = '#dcfce7';
      statusPillEl.style.borderColor = '#86efac';
    } else {
      statusPillEl.textContent = '● Registration Open';
      statusPillEl.style.color = '#10b981';
      statusPillEl.style.background = '#ecfdf5';
      statusPillEl.style.borderColor = '#a7f3d0';
    }
  }

  if (isRegistered) {
    if (regBtn) {
      regBtn.textContent = '✓ Registered for Event';
      regBtn.className = 'btn btn-secondary btn-lg w-full';
      regBtn.disabled = true;
    }
    if (noticeEl) noticeEl.textContent = 'Your entry pass is active and confirmed below.';
    if (passPreview) passPreview.classList.remove('hidden');
  } else {
    if (regBtn) {
      regBtn.textContent = 'Register for Event →';
      regBtn.className = 'btn btn-primary btn-lg w-full';
      regBtn.disabled = false;
    }
    if (noticeEl) noticeEl.textContent = 'Instant digital pass generated upon registration.';
    if (passPreview) passPreview.classList.add('hidden');
  }

  // Re-bind register click
  if (regBtn) {
    regBtn.onclick = async () => {
      if (!AuthService.isAuthenticated()) {
        Router.showToastNotification('Sign In Required', 'Please sign in to complete your registration.');
        return Router.navigate('/login');
      }
      
      const user = AuthService.getUser();
      if (user && user.token) {
        try {
          const res = await fetch(`${API_URL}/registrations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ event_id: evt.id })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            Router.showToastNotification('Registration Issue', err.detail || 'Could not register.');
          }
        } catch (e) {
          console.warn('Backend registration note:', e);
        }
      }

      AuthService.registerEvent(evt.id);
      evt.registeredCount = (evt.registeredCount || 0) + 1;
      Router.showToastNotification('Registration Confirmed! 🎉', `You are registered for ${evt.title}. Entry pass generated!`);
      updateDetailActionCard(evt);
    };
  }

  // Re-bind cancel click
  if (cancelBtn) {
    cancelBtn.onclick = async () => {
      const user = AuthService.getUser();
      if (user && user.token) {
        try {
          await fetch(`${API_URL}/registrations/${evt.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
        } catch (e) {
          console.warn('Backend cancel registration note:', e);
        }
      }

      AuthService.cancelRegistration(evt.id);
      evt.registeredCount = Math.max(0, (evt.registeredCount || 1) - 1);
      Router.showToastNotification('Registration Cancelled', `Your spot for ${evt.title} has been cancelled.`);
      updateDetailActionCard(evt);
    };
  }
}

function initThemeSwitch() {
  const themeToggleBtns = document.querySelectorAll('.theme-toggle-btn');
  const storedTheme = localStorage.getItem('evently-theme');
  
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');

  setTheme(initialTheme);

  themeToggleBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const newTheme = isDark ? 'light' : 'dark';
      
      setTheme(newTheme);
      
      btn.style.transform = 'rotate(180deg) scale(0.85)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 300);
    });
  });

  function setTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('evently-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('evently-theme', 'light');
    }
  }
}

/* ==========================================================================
   4. MOBILE MENU TOGGLE
   ========================================================================== */

function initMobileMenu() {
  const toggleBtn = document.getElementById('mobile-toggle-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  if (!toggleBtn || !mobileMenu) return;

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = mobileMenu.classList.contains('is-open');
    if (isOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (!mobileMenu.contains(e.target) && !toggleBtn.contains(e.target)) {
      closeMobileMenu();
    }
  });

  function openMobileMenu() {
    toggleBtn.classList.add('is-active');
    mobileMenu.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
  }

  function closeMobileMenu() {
    toggleBtn.classList.remove('is-active');
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
  }
}

/* ==========================================================================
   5. CALENDAR PREVIEW DEMO
   ========================================================================== */

const CAMPUS_EVENTS_DATA = {
  'cultural-fest': {
    badge: 'FEATURED CULTURAL FEST',
    dateStr: 'Saturday, September 19, 2026',
    title: 'Sunburn Campus Cultural Beats & Music Night',
    venue: '📍 Open Amphitheatre',
    time: '⏰ 5:00 PM - 10:00 PM',
  },
  'hackathon': {
    badge: 'ANNUAL TECH HACKATHON',
    dateStr: 'Thursday, September 24, 2026',
    title: 'CodeStorm 2026: 24-Hour AI & Web Hackathon',
    venue: '📍 Main Engineering Auditorium',
    time: '⏰ 09:00 AM Onwards',
  },
  'coding-sprint': {
    badge: 'CLUB EVENT',
    dateStr: 'Saturday, September 12, 2026',
    title: 'Competitive Coding Sprint & Pizza Night',
    venue: '📍 CS Lab 304',
    time: '⏰ 06:00 PM - 09:00 PM',
  },
  'robotics': {
    badge: 'INNOVATION LEAGUE',
    dateStr: 'Monday, September 28, 2026',
    title: 'Inter-College Robotics League & Drone Racing',
    venue: '📍 Innovation Hub Arena',
    time: '⏰ 10:00 AM - 04:00 PM',
  },
};

function initCalendarInteractivePreview() {
  const calDays = document.querySelectorAll('.cal-day:not(.other-month)');
  const miniTooltip = document.getElementById('cal-mini-tooltip');

  if (!miniTooltip) return;

  const badgeEl = miniTooltip.querySelector('.mini-badge-type');
  const dateEl = miniTooltip.querySelector('.mini-date-str');
  const titleEl = miniTooltip.querySelector('.mini-event-title');
  const venueEl = miniTooltip.querySelector('.mini-event-meta span:first-child');
  const timeEl = miniTooltip.querySelector('.mini-event-meta span:last-child');

  calDays.forEach((dayEl) => {
    dayEl.addEventListener('click', () => {
      calDays.forEach((d) => d.classList.remove('active-preview'));
      dayEl.classList.add('active-preview');

      const dayNum = dayEl.querySelector('.day-num')?.textContent || dayEl.textContent.trim();
      const eventId = dayEl.getAttribute('data-event-id');

      if (eventId && CAMPUS_EVENTS_DATA[eventId]) {
        const data = CAMPUS_EVENTS_DATA[eventId];
        badgeEl.textContent = data.badge;
        dateEl.textContent = data.dateStr;
        titleEl.textContent = data.title;
        venueEl.textContent = data.venue;
        timeEl.textContent = data.time;
      } else {
        badgeEl.textContent = 'CAMPUS SCHEDULE';
        dateEl.textContent = `September ${dayNum}, 2026`;
        titleEl.textContent = `Regular Academic & Open Club Hours`;
        venueEl.textContent = '📍 Campus Student Center';
        timeEl.textContent = '⏰ Open Access';
      }

      miniTooltip.style.transform = 'scale(0.98)';
      setTimeout(() => {
        miniTooltip.style.transform = 'scale(1)';
      }, 150);
    });
  });
}

/* ==========================================================================
   6. OWL MASCOT MICRO ANIMATIONS
   ========================================================================== */

function initOwlMicroAnimations() {
  const owlWrapper = document.getElementById('owl-character');
  if (!owlWrapper) return;

  const speechBubble = owlWrapper.querySelector('.owl-speech-bubble span');
  const sparkles = owlWrapper.querySelectorAll('.owl-sparkle');

  const owlMessages = [
    'Pick a date to explore! 🗓️',
    'Sep 24 Hackathon is coming! 🔥',
    'All events in 1 calendar 🎓',
    'Click Get Started to login! ✨'
  ];

  let msgIndex = 0;

  setInterval(() => {
    msgIndex = (msgIndex + 1) % owlMessages.length;
    if (speechBubble) {
      speechBubble.style.opacity = '0';
      setTimeout(() => {
        speechBubble.textContent = owlMessages[msgIndex];
        speechBubble.style.opacity = '1';
      }, 300);
    }
  }, 4500);

  setInterval(() => {
    sparkles.forEach((sparkle) => {
      sparkle.style.transform = 'scaleY(0.1)';
      setTimeout(() => {
        sparkle.style.transform = 'scaleY(1)';
      }, 200);
    });
  }, 3500);
}

/* ==========================================================================
   7. STICKY HEADER SCROLL SHADOW
   ========================================================================== */

function initScrollHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.style.boxShadow = '0 10px 30px rgba(15, 23, 42, 0.08)';
    } else {
      header.style.boxShadow = 'none';
    }
  });
}
