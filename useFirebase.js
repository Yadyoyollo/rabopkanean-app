
/* global __app_id, __firebase_config, __initial_auth_token */
import { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, query, onSnapshot, updateDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Declare global Canvas variables for proper access.
const CANVAS_APP_ID = (typeof window !== 'undefined' && window.__app_id) ? window.__app_id : 'default-app-id';
const CANVAS_FIREBASE_CONFIG = (typeof window !== 'undefined' && window.__firebase_config) ? JSON.parse(window.__firebase_config) : null;
const CANVAS_INITIAL_AUTH_TOKEN = (typeof window !== 'undefined' && window.__initial_auth_token) ? window.__initial_auth_token : null;

// Define the main administrator email (used as a fallback)
const ADMIN_EMAIL = "prathipweiyngya@gmail.com";

// A custom hook to interact with Firebase and manage app state
const useFirebase = () => {
  const [app, setApp] = useState(null);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [storage, setStorage] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [videoPlayingState, setVideoPlayingState] = useState(false);
  const [showSummaryScreen, setShowSummaryScreen] = useState(false);

  // A placeholder for the showMessage function from the App component
  const showMessage = useCallback((msg, type = 'info', onConfirm = null, showConfirmButton = false) => {
    console.log(`Message: ${msg} (Type: ${type})`);
  }, []);

  // Function to toggle video playing state in Firestore
  const toggleVideoPlaying = useCallback(async () => {
    if (!db) return;
    try {
      const appStateDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`);
      await updateDoc(appStateDocRef, { videoPlaying: !videoPlayingState });
    } catch (err) {
      console.error("Error toggling video playing state:", err);
      // The parent App component will handle showing the message from the effect.
    }
  }, [db, videoPlayingState]);

  // Enhanced function to check user role with better error handling
  const checkUserRole = async (currentUser, dbInstance) => {
    let userData = { uid: currentUser.uid, email: currentUser.email, role: 'audience' };

    try {
      // First check custom claims
      const idTokenResult = await currentUser.getIdTokenResult();
      const customClaimRole = idTokenResult.claims.role;

      console.log("UID:", currentUser.uid);
      console.log("Email:", currentUser.email);
      console.log("Custom Claim Role:", customClaimRole);

      if (customClaimRole && ['admin', 'judge'].includes(customClaimRole)) {
        userData.role = customClaimRole;
        console.log("Role from custom claims:", customClaimRole);
      }

      // Then check Firestore document
      try {
        const judgeDocRef = doc(dbInstance, `artifacts/${CANVAS_APP_ID}/public/data/judges`, currentUser.uid);
        const judgeDocSnap = await getDoc(judgeDocRef);
        
        if (judgeDocSnap.exists()) {
          const judgeData = judgeDocSnap.data();
          userData = { ...userData, ...judgeData };
          console.log("User data from Firestore:", judgeData);
          
          // Firestore role takes precedence over custom claims for security
          if (judgeData.role && ['admin', 'judge'].includes(judgeData.role)) {
            userData.role = judgeData.role;
          }
        } else {
          console.log("No Firestore document found for user:", currentUser.uid);
        }
      } catch (firestoreError) {
        console.error("Error accessing Firestore judge document:", firestoreError);
        // Continue with custom claims or admin email fallback
      }

      // Final fallback: check if it's the hardcoded admin email
      if (userData.role === 'audience' && currentUser.email === ADMIN_EMAIL) {
        userData.role = 'admin';
        userData.name = 'ผู้ดูแลระบบ';
        console.log('User identified as admin via hardcoded email:', currentUser.email);
      }

      return userData;

    } catch (error) {
      console.error("Error checking user role:", error);
      // Fallback to admin email check
      if (currentUser.email === ADMIN_EMAIL) {
        return {
          uid: currentUser.uid,
          email: currentUser.email,
          role: 'admin',
          name: 'ผู้ดูแลระบบ'
        };
      }
      return userData; // Return audience role as fallback
    }
  };

  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        const currentFirebaseConfig = CANVAS_FIREBASE_CONFIG || {};

        if (!currentFirebaseConfig.apiKey || !currentFirebaseConfig.projectId) {
          throw new Error("Firebase configuration is missing or incomplete.");
        }

        const firebaseApp = initializeApp(currentFirebaseConfig);
        const authInstance = getAuth(firebaseApp);
        const dbInstance = getFirestore(firebaseApp);
        const storageInstance = getStorage(firebaseApp);

        setApp(firebaseApp);
        setAuth(authInstance);
        setDb(dbInstance);
        setStorage(storageInstance);

        const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
          if (currentUser) {
            setUserId(currentUser.uid);
            
            // Use enhanced role checking function
            const userData = await checkUserRole(currentUser, dbInstance);
            setLoggedInUser(userData);
            
            console.log("Final user role:", userData.role);
            
          } else {
            setUserId(null);
            setLoggedInUser(null);
            console.log('User is logged out or anonymous.');
          }
          setLoading(false);
        });

        // Handle initial authentication
        if (CANVAS_INITIAL_AUTH_TOKEN) {
          try {
            await signInWithCustomToken(authInstance, CANVAS_INITIAL_AUTH_TOKEN);
          } catch (tokenError) {
            console.warn('Failed to sign in with custom token, signing in anonymously:', tokenError);
            await signInAnonymously(authInstance);
          }
        } else {
          await signInAnonymously(authInstance);
        }

        // Listen for app state changes
        const appStateDocRef = doc(dbInstance, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`);
        const unsubscribeAppState = onSnapshot(appStateDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setVideoPlayingState(data.videoPlaying || false);
            setShowSummaryScreen(data.showSummaryScreen || false);
          }
        }, (error) => {
          console.error("Error listening to app state:", error);
        });

        return () => {
          unsubscribe();
          unsubscribeAppState();
        };
      } catch (err) {
        console.error("Firebase Initialization Error:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    initializeFirebase();
  }, []);

  // Return the necessary state and functions
  return {
    app, db, auth, storage, userId, loggedInUser, setLoggedInUser,
    loading, error, showMessage, toggleVideoPlaying, videoPlayingState,
    showSummaryScreen, setShowSummaryScreen
  };
};

export default useFirebase;
