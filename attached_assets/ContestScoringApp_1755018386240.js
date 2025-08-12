/* global __app_id, __firebase_config, __initial_auth_token */
import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, signInAnonymously, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, onSnapshot, setDoc, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import ReactPlayer from 'react-player';

// Declare global Canvas variables for ESLint and proper access.
// Prioritize window.__app_id, fallback to process.env.REACT_APP_APP_ID, then 'default-app-id'.
const CANVAS_APP_ID = (typeof window !== 'undefined' && window.__app_id) ? window.__app_id : process.env.REACT_APP_APP_ID || 'default-app-id';
const CANVAS_FIREBASE_CONFIG = (typeof window !== 'undefined' && window.__firebase_config) ? JSON.parse(window.__firebase_config) : null;
const CANVAS_INITIAL_AUTH_TOKEN = (typeof window !== 'undefined' && window.__initial_auth_token) ? window.__initial_auth_token : null;

// Cloudinary Configuration
const CLOUDINARY_CLOUD_NAME = "dnv6bbdwm";
const CLOUDINARY_UPLOAD_PRESET = "วันภาษาไทย";

// Define the main administrator email
const ADMIN_EMAIL = "prathipweiyngya@gmail.com";

// Context for Firebase instances and Modal functions
const FirebaseContext = createContext(null);

// MessageModal Component for displaying alerts (Error/Success/Confirm)
const MessageModal = ({ message, type, onClose, onConfirm, showConfirmButton }) => {
  if (!message) return null;

  const bgColor = type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-green-500' : 'bg-blue-500');
  const textColor = 'text-white';

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full transform transition-all duration-300 scale-100 opacity-100">
        <div className={`p-4 rounded-md ${bgColor} ${textColor} mb-4 text-center`}>
          <p className="font-bold text-lg">{type === 'error' ? 'ข้อผิดพลาด!' : (type === 'success' ? 'สำเร็จ!' : 'แจ้งเตือน!')}</p>
          <p>{message}</p>
        </div>
        <div className="flex justify-center gap-4">
          {showConfirmButton && (
            <button
              onClick={onConfirm}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
            >
              ยืนยัน
            </button>
          )}
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
          >
            {showConfirmButton ? 'ยกเลิก' : 'ปิด'}
          </button>
        </div>
      </div>
    </div>
  );
};

// useFirebase Hook for managing Firebase (Auth, Firestore, Storage)
const useFirebase = () => {
  const [app, setApp] = useState(null);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [storage, setStorage] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loggedInUser, setLoggedInUser] = useState(null); // State for the logged-in user's profile
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [videoPlayingState, setVideoPlayingState] = useState(false); // New state for video playing
  const [showSummaryScreen, setShowSummaryScreen] = useState(false); // State for summary screen visibility

  // showMessage function (placeholder, will be overridden by App component's context)
  const showMessage = useCallback((msg, type = 'info', onConfirm = null, showConfirmButton = false) => {
    console.log(`Message: ${msg} (Type: ${type})`);
  }, []);

  // Function to toggle video playing state in Firestore
  const toggleVideoPlaying = useCallback(async () => {
    if (!db) return;
    try {
      const appStateDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`);
      await updateDoc(appStateDocRef, { videoPlaying: !videoPlayingState });
      // The actual state update will come from the onSnapshot listener
    } catch (err) {
      console.error("Error toggling video playing state:", err);
      showMessage('ข้อผิดพลาด', `ไม่สามารถเปลี่ยนสถานะวิดีโอได้: ${err.message}`, 'error');
    }
  }, [db, videoPlayingState, showMessage]);


  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        // Use CANVAS_FIREBASE_CONFIG if available, otherwise fallback to process.env
        const currentFirebaseConfig = CANVAS_FIREBASE_CONFIG || {
          apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
          authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
          storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.REACT_APP_FIREBASE_APP_ID
        };

        if (!currentFirebaseConfig.apiKey || !currentFirebaseConfig.projectId) {
          throw new Error("Firebase configuration is missing or incomplete. Please check your .env file or Canvas settings.");
        }

        const firebaseApp = initializeApp(currentFirebaseConfig);
        const authInstance = getAuth(firebaseApp);
        const dbInstance = getFirestore(firebaseApp);
        const storageInstance = getStorage(firebaseApp);

        setApp(firebaseApp);
        setAuth(authInstance);
        setDb(dbInstance);
        setStorage(storageInstance);

        // Listener for Firebase Auth state changes
        const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
          if (currentUser) {
            setUserId(currentUser.uid);
            let userData = { uid: currentUser.uid, email: currentUser.email, role: 'audience' }; // Default role

            try {
              const idTokenResult = await currentUser.getIdTokenResult();
              const customClaimRole = idTokenResult.claims.role;

              console.log("UID:", currentUser.uid);
              console.log("ROLE (from Custom Claim):", customClaimRole);

              if (customClaimRole) {
                userData.role = customClaimRole;
                // Try to fetch name from judges collection if role is judge or admin
                if (customClaimRole === 'judge' || customClaimRole === 'admin') {
                  const judgeDocRef = doc(dbInstance, `artifacts/${CANVAS_APP_ID}/public/data/judges`, currentUser.uid);
                  const judgeDocSnap = await getDoc(judgeDocRef);
                  if (judgeDocSnap.exists()) {
                    userData.name = judgeDocSnap.data().name;
                  } else {
                    userData.name = currentUser.displayName || currentUser.email; // Fallback name
                  }
                } else {
                  userData.name = currentUser.displayName || currentUser.email; // Fallback name for other roles
                }
                // No need to show message here, as it will be shown when role is determined below
              } else {
                // Fallback to existing logic if no custom claim role is found
                // This block is primarily for initial setup or if custom claims are not used.
                // The primary security rule check is on the Firestore document's 'role' field.
                const judgeDocRef = doc(dbInstance, `artifacts/${CANVAS_APP_ID}/public/data/judges`, currentUser.uid);
                const judgeDocSnap = await getDoc(judgeDocRef);
                if (judgeDocSnap.exists()) {
                  userData = { ...userData, ...judgeDocSnap.data() };
                  console.log('User is Judge/Admin from Firestore (fallback):', userData.email, userData.role);
                } else {
                  // If no custom claim and no Firestore profile, check if it's the hardcoded ADMIN_EMAIL
                  if (currentUser.email === ADMIN_EMAIL) {
                    userData.role = 'admin';
                    userData.name = 'ผู้ดูแลระบบ';
                    console.log('User is Admin (hardcoded email fallback):', currentUser.email);
                    // IMPORTANT: For this hardcoded admin to work with write rules,
                    // a document with role: 'admin' must exist in Firestore for their UID.
                  } else {
                    console.log('User profile not found in Firestore, setting as audience (fallback).');
                  }
                }
              }
            } catch (claimError) {
              console.error("Error fetching custom claims:", claimError);
              // Fallback to existing logic if fetching claims fails
              const judgeDocRef = doc(dbInstance, `artifacts/${CANVAS_APP_ID}/public/data/judges`, currentUser.uid);
              const judgeDocSnap = await getDoc(judgeDocRef);
              if (judgeDocSnap.exists()) {
                userData = { ...userData, ...judgeDocSnap.data() };
                console.log('User is Judge/Admin from Firestore (fallback due to claim error):', userData.email, userData.role);
              } else {
                if (currentUser.email === ADMIN_EMAIL) {
                  userData.role = 'admin';
                  userData.name = 'ผู้ดูแลระบบ';
                  console.log('User is Admin (hardcoded email fallback due to claim error):', currentUser.email);
                } else {
                  console.log('User profile not found in Firestore, setting as audience (fallback due to claim error).');
                }
              }
            }
            setLoggedInUser(userData);
            // Show role message AFTER loggedInUser is set
            if (userData.role === 'admin' || userData.role === 'judge') {
                showMessage(`✅ ROLE ที่ได้รับ: ${userData.role}`, 'success');
            } else {
                showMessage("🚫 บัญชีนี้ยังไม่ได้กำหนด role (admin/judge) ใน Firestore หรือ Custom Claims", 'error');
            }

          } else {
            setUserId(null);
            setLoggedInUser(null);
            showMessage("ยังไม่ได้ login", 'info');
            console.log('User is logged out or anonymous.');
          }
          setLoading(false);
        });

        // Handle initial login (Custom Token or Anonymous)
        if (CANVAS_INITIAL_AUTH_TOKEN) {
          try {
            await signInWithCustomToken(authInstance, CANVAS_INITIAL_AUTH_TOKEN);
            console.log('Signed in with custom token.');
          } catch (tokenError) {
            console.warn('Failed to sign in with custom token, signing in anonymously:', tokenError);
            await signInAnonymously(authInstance);
          }
        } else {
          await signInAnonymously(authInstance);
          console.log('Signed in anonymously.');
        }

        // Listen for videoPlaying and showSummaryScreen state changes from Firestore
        const appStateDocRef = doc(dbInstance, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`);
        const unsubscribeAppState = onSnapshot(appStateDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setVideoPlayingState(data.videoPlaying || false);
            setShowSummaryScreen(data.showSummaryScreen || false); // Update showSummaryScreen from Firestore
          }
        });

        return () => {
          unsubscribe(); // Cleanup auth listener
          unsubscribeAppState(); // Cleanup appState listener
        };
      } catch (err) {
        console.error("Firebase Initialization Error:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    initializeFirebase();
  }, []); // Empty dependency array means this effect runs once on mount

  return { app, db, auth, storage, userId, loggedInUser, setLoggedInUser, loading, error, showMessage, toggleVideoPlaying, videoPlayingState, showSummaryScreen, setShowSummaryScreen };
};

// Main Application Component
function App() {
  const { db, auth, storage, userId, loggedInUser, setLoggedInUser, loading, error, showMessage, toggleVideoPlaying, videoPlayingState, showSummaryScreen, setShowSummaryScreen } = useFirebase(); // Destructure showMessage, toggleVideoPlaying, videoPlayingState, showSummaryScreen, setShowSummaryScreen here
  const [view, setView] = useState('login'); // 'login', 'judge', 'admin', 'audience', 'summary'
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [messageOnConfirm, setMessageOnConfirm] = useState(null);
  const [showMessageConfirmButton, setShowMessageConfirmButton] = useState(false);
  const videoRef = useRef(null); // Declare videoRef here at the App level

  // showMessage function now accepts an optional onConfirm callback and showConfirmButton flag
  const localShowMessage = useCallback((msg, type = 'info', onConfirm = null, showConfirmButton = false) => {
    setMessage(msg);
    setMessageType(type);
    setMessageOnConfirm(() => onConfirm); // Store the callback
    setShowMessageConfirmButton(showConfirmButton);
  }, []);

  const localCloseMessageModal = useCallback(() => {
    setMessage('');
    setMessageType('info');
    setMessageOnConfirm(null);
    setShowMessageConfirmButton(false);
  }, []);

  const handleModalConfirm = useCallback(async () => {
    if (messageOnConfirm) {
      await messageOnConfirm();
    }
    localCloseMessageModal();
  }, [messageOnConfirm, localCloseMessageModal]);

  // Effect to change view based on loggedInUser role
  useEffect(() => {
    if (loggedInUser) {
      if (loggedInUser.role === 'admin') {
        setView('admin');
      } else if (loggedInUser.role === 'judge') {
        setView('judge');
      } else {
        // If no clear role or is an audience member
        setView('login'); // Redirect to login or 'audience' if you want them to see audience screen immediately
      }
    } else if (!loading) { // When no user is logged in and loading is complete
      setView('login');
    }
  }, [loggedInUser, loading]);


  // Display Loading or general Error state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
        <div className="text-xl font-semibold text-gray-700">กำลังโหลดแอปพลิเคชัน...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-700 p-4 font-inter">
        <p>เกิดข้อผิดพลาดในการโหลด Firebase: {error}</p>
        <p className="text-sm mt-2">โปรดตรวจสอบการตั้งค่า Firebase และกฎความปลอดภัย</p>
      </div>
    );
  }

  // Context value to be passed to child components
  const firebaseContextValue = { db, auth, storage, userId, showMessage: localShowMessage, closeMessageModal: localCloseMessageModal, loggedInUser, setLoggedInUser, setView, toggleVideoPlaying, videoPlayingState, showSummaryScreen, setShowSummaryScreen, videoRef }; // Pass localShowMessage and localCloseMessageModal, toggleVideoPlaying, videoPlayingState, showSummaryScreen, setShowSummaryScreen, videoRef

  return (
    <FirebaseContext.Provider value={firebaseContextValue}>
      <div className="min-h-screen flex flex-col font-inter bg-gray-100">
        {view === 'login' && <LoginPanel />}
        {view === 'judge' && loggedInUser?.role === 'judge' && <JudgePanel />}
        {view === 'admin' && loggedInUser?.role === 'admin' && <AdminPanel />}
        {view === 'audience' && <AudienceDisplay />}
        {view === 'summary' && <SummaryScreen />}
      </div>
      <MessageModal
        message={message}
        type={messageType}
        onClose={localCloseMessageModal}
        onConfirm={handleModalConfirm}
        showConfirmButton={showMessageConfirmButton}
      />
    </FirebaseContext.Provider>
  );
}

// Login Panel Component
const LoginPanel = () => {
  const { db, auth, showMessage, setLoggedInUser, setView } = useContext(FirebaseContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!auth || !db) {
      showMessage('ระบบยังไม่พร้อมใช้งาน', 'error');
      return;
    }
    setIsLoggingIn(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userUid = userCredential.user.uid;

      // Fetch user profile from Firestore to check role
      const judgeDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/judges`, userUid);
      const judgeDocSnap = await getDoc(judgeDocRef);

      if (judgeDocSnap.exists()) {
        const userData = { uid: userUid, email: userCredential.user.email, ...judgeDocSnap.data() };
        setLoggedInUser(userData); // Set logged-in user data in App component
        showMessage(`เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${userData.name || userData.email}`, 'success');

        // Check role and change view
        if (userData.role === 'admin') {
          setView('admin');
        } else if (userData.role === 'judge') {
          setView('judge');
        } else {
          // If role is not recognized
          showMessage('บทบาทผู้ใช้ไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ', 'error');
          await signOut(auth); // Force logout
          setLoggedInUser(null);
          setView('login');
        }
      } else {
        // User logged in via Firebase Auth but no profile found in Firestore
        showMessage('ไม่พบข้อมูลโปรไฟล์สำหรับบัญชีนี้ กรุณาติดต่อผู้ดูแลระบบ', 'error');
        await signOut(auth); // Force logout
        setLoggedInUser(null);
        setView('login');
      }
    } catch (error) {
      console.error("Login error:", error);
      let errorMessage = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
      if (error.code === 'auth/invalid-email' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'บัญชีนี้ถูกระงับการใช้งาน';
      }
      showMessage(`เข้าสู่ระบบไม่สำเร็จ: ${errorMessage}`, 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!auth || !db) {
      showMessage('ระบบยังไม่พร้อมใช้งาน', 'error');
      return;
    }
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // After Google Sign-In, check custom claims for role
      const idTokenResult = await user.getIdTokenResult();
      const customClaimRole = idTokenResult.claims.role;

      if (customClaimRole) {
        const userData = { uid: user.uid, email: user.email, name: user.displayName || user.email, role: customClaimRole };
        setLoggedInUser(userData);
        showMessage(`เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${userData.name} (Role: ${customClaimRole})`, 'success');
        if (customClaimRole === 'admin') {
          setView('admin');
        } else if (customClaimRole === 'judge') {
          setView('judge');
        } else {
          showMessage('บทบาทผู้ใช้ไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ', 'error');
          await signOut(auth);
          setLoggedInUser(null);
          setView('login');
        }
      } else {
        // Fallback to ADMIN_EMAIL check if no custom claim role
        if (user.email === ADMIN_EMAIL) {
          const adminData = { uid: user.uid, email: user.email, name: user.displayName || 'Admin', role: 'admin' };
          setLoggedInUser(adminData);
          showMessage(`เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ผู้ดูแลระบบ (${user.email})`, 'success');
          setView('admin');
        } else {
          // If not predefined Admin email, check Firestore for Judge role
          const judgeDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/judges`, user.uid);
          const judgeDocSnap = await getDoc(judgeDocRef);

          if (judgeDocSnap.exists()) {
            const userData = { uid: user.uid, email: user.email, ...judgeDocSnap.data() };
            setLoggedInUser(userData);
            showMessage(`เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${userData.name || userData.email}`, 'success');
            if (userData.role === 'judge') {
              setView('judge');
            } else if (userData.role === 'admin') {
              setView('admin');
            } else {
              showMessage('บทบาทผู้ใช้ไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ', 'error');
              await signOut(auth);
              setLoggedInUser(null);
              setView('login');
            }
          } else {
            showMessage('ไม่พบข้อมูลโปรไฟล์สำหรับบัญชีนี้ กรุณาติดต่อผู้ดูแลระบบ', 'error');
            await signOut(auth);
            setLoggedInUser(null);
            setView('login');
          }
        }
      }
    } catch (error) {
      console.error("Google Sign-In error:", error);
      let errorMessage = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google';
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'ผู้ใช้ปิดหน้าต่าง Pop-up การล็อกอิน';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'คำขอล็อกอิน Pop-up ถูกยกเลิก';
      }
      showMessage(`เข้าสู่ระบบไม่สำเร็จ: ${errorMessage}`, 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };


  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-blue-50 to-white">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border-4 border-blue-600">
        <h2 className="text-3xl font-bold text-center mb-6 text-blue-800">เข้าสู่ระบบ</h2>

        {/* Section for Judge / Admin (Email/Password) */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg shadow-md border border-blue-200">
          <h3 className="text-2xl font-bold text-blue-700 mb-4 text-center">เข้าสู่ระบบกรรมการ / ผู้ดูแลระบบ (อีเมล/รหัสผ่าน)</h3>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-gray-700 text-lg font-medium mb-2" htmlFor="email">
                อีเมล
              </label>
              <input
                type="email"
                id="email"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition duration-200 text-lg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoggingIn}
              />
            </div>
            <div>
              <label className="block text-gray-700 text-lg font-medium mb-2" htmlFor="password">
                รหัสผ่าน
              </label>
              <input
                type="password"
                id="password"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition duration-200 text-lg"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoggingIn}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-lg text-xl disabled:opacity-50"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>

        {/* Section for Admin Login with Google */}
        <div className="mt-8 p-6 bg-purple-100 rounded-xl shadow-lg border-4 border-purple-600">
          <h3 className="text-2xl font-extrabold text-purple-800 mb-4 text-center">
            🔒 เข้าสู่ระบบผู้ดูแลระบบ (ด้วย Google)
          </h3>
          <p className="text-sm text-purple-700 text-center mb-4 font-semibold">
            เฉพาะอีเมล {ADMIN_EMAIL} เท่านั้นที่จะเข้าถึงแผง Admin ได้
          </p>
          <button
            onClick={handleGoogleSignIn}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-lg text-xl flex items-center justify-center space-x-2 disabled:opacity-50"
            disabled={isLoggingIn}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.345-7.439-7.44 0-4.096 3.344-7.44 7.439-7.44 2.31 0 3.833.993 4.643 1.794l3.246-3.246C18.785 2.482 15.67 0 12.24 0 5.463 0 0 5.463 0 12.24s5.463 12.24 12.24 12.24c6.806 0 11.388-4.733 11.388-11.722 0-.78-.068-1.535-.195-2.263H12.24z" fillRule="evenodd"/>
            </svg>
            <span>{isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google'}</span>
          </button>
        </div>


        {/* Buttons for Audience */}
        <div className="mt-6 text-center border-t pt-6 border-gray-200">
          <button
            onClick={() => setView('audience')}
            className="text-blue-700 hover:underline text-lg mr-4"
          >
            ดูหน้าจอแสดงผล
          </button>
          <button
            onClick={() => setView('summary')}
            className="text-blue-700 hover:underline text-lg"
          >
            ดูหน้าสรุปผล
          </button>
        </div>
      </div>
    </div>
  );
};

// Judge Panel Component (for judges to score)
const JudgePanel = () => {
  const { db, auth, showMessage, loggedInUser, setView, setLoggedInUser } = useContext(FirebaseContext);
  const [currentContestant, setCurrentContestant] = useState(null);
  const [scores, setScores] = useState({
    personality: 0,
    walking: 0,
    attire: 0,
    language: 0,
    overall: 0,
  });
  const [totalScore, setTotalScore] = useState(0);
  const [isSubmittedForCurrentContestant, setIsSubmittedForCurrentContestant] = useState(false);
  const [isJudgingOpen, setIsJudgingOpen] = useState(false);
  const [loadingContestant, setLoadingContestant] = useState(true);
  const [keepStatus, setKeepStatus] = useState('');

  useEffect(() => {
    if (!db || !loggedInUser?.uid) {
      setLoadingContestant(true);
      return;
    }

    setLoadingContestant(true);

    const appStateDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`);
    const unsubscribeAppState = onSnapshot(appStateDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIsJudgingOpen(data.isJudgingOpen || false);
        const newContestantId = data.currentContestantId;

        // Only fetch contestant and score if newContestantId is different or if it's the initial load
        if (newContestantId && (!currentContestant || newContestantId !== currentContestant.id)) {
          const contestantDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/contestants`, newContestantId);
          const contestantSnap = await getDoc(contestantDocRef);
          if (contestantSnap.exists()) {
            setCurrentContestant({ id: contestantSnap.id, ...contestantSnap.data() });
            const scoreDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/users/${loggedInUser.uid}/scores`, newContestantId);
            const scoreSnap = await getDoc(scoreDocRef);
            if (scoreSnap.exists()) {
              setScores(scoreSnap.data());
              setTotalScore(scoreSnap.data().totalScore);
              setKeepStatus(scoreSnap.data().keepStatus || '');
              setIsSubmittedForCurrentContestant(true);
            } else {
              setScores({ personality: 0, walking: 0, attire: 0, language: 0, overall: 0 });
              setTotalScore(0);
              setKeepStatus('');
              setIsSubmittedForCurrentContestant(false);
            }
          } else {
            setCurrentContestant(null);
            setIsSubmittedForCurrentContestant(false);
            setScores({ personality: 0, walking: 0, attire: 0, language: 0, overall: 0 });
            setTotalScore(0);
            setKeepStatus('');
          }
        } else if (!newContestantId) {
            setCurrentContestant(null);
            setIsSubmittedForCurrentContestant(false);
            setScores({ personality: 0, walking: 0, attire: 0, language: 0, overall: 0 });
            setTotalScore(0);
            setKeepStatus('');
        }
      } else {
        // Initialize appState if it doesn't exist
        await setDoc(appStateDocRef, { currentContestantId: null, videoUrl: '', videoPlaying: false, isJudgingOpen: false, isCountingDown: false, countdownValue: 0, nextContestantIdAfterCountdown: null, isJudgingOpenChange: false, showSummaryScreen: false, showSummaryScreenChange: false }, { merge: true });
        setCurrentContestant(null);
        setIsSubmittedForCurrentContestant(false);
        setScores({ personality: 0, walking: 0, attire: 0, language: 0, overall: 0 });
        setTotalScore(0);
        setKeepStatus('');
        setIsJudgingOpen(false);
      }
      setLoadingContestant(false);
    }, (error) => {
      console.error("Error listening to appState:", error);
      showMessage('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อข้อมูลสถานะระบบได้ กรุณาลองใหม่', 'error');
      setLoadingContestant(false);
    });

    return () => unsubscribeAppState();
  }, [db, loggedInUser, showMessage]);

  const handleScoreButtonClick = (category, value) => {
    const score = Math.max(0, Math.min(15, parseInt(value, 10) || 0));
    setScores(prev => {
      const newScores = { ...prev, [category]: score };
      const newTotal = Object.values(newScores).reduce((sum, s) => sum + s, 0);
      setTotalScore(newTotal);
      return newScores;
    });
  };

  const handleKeepStatusClick = (status) => {
    setKeepStatus(prevStatus => (prevStatus === status ? '' : status));
  };

  const handleSubmitScore = async () => {
    if (!currentContestant) {
      showMessage('ข้อผิดพลาด', 'ยังไม่มีผู้เข้าประกวดที่กำลังแสดง', 'error');
      return;
    }
    if (!isJudgingOpen) {
      showMessage('ไม่สามารถบันทึกคะแนนได้', 'Admin ยังไม่ได้เปิดการลงคะแนน', 'error');
      return;
    }
    const allScored = Object.values(scores).every(score => score > 0 && score <= 15); // Ensure scores are valid
    if (!allScored) {
        showMessage('ข้อมูลไม่ครบถ้วน', 'กรุณาให้คะแนนครบทุกหมวด (1-15 คะแนน)', 'error');
        return;
    }
    if (!keepStatus) {
        showMessage('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือก "เก็บเข้ารอบ" หรือ "ไม่เก็บ"', 'error');
        return;
    }

    showMessage(
      'คุณต้องการส่งคะแนนสำหรับผู้เข้าประกวดคนนี้หรือไม่? เมื่อส่งแล้วจะไม่สามารถแก้ไขได้',
      'info',
      async () => { // OnConfirm callback
        try {
          if (!loggedInUser || !loggedInUser.uid) {
            showMessage('ข้อผิดพลาด', 'ไม่พบข้อมูลกรรมการ กรุณาลองเข้าสู่ระบบใหม่', 'error');
            return;
          }
          const scoreDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/users/${loggedInUser.uid}/scores`, currentContestant.id);
          await setDoc(scoreDocRef, {
            judgeId: loggedInUser.uid,
            judgeName: loggedInUser.name || loggedInUser.email, // Use email if name is not available
            contestantId: currentContestant.id,
            contestantName: currentContestant.name,
            ...scores,
            totalScore: totalScore,
            keepStatus: keepStatus,
            submittedAt: new Date(),
          });
          setIsSubmittedForCurrentContestant(true);
          showMessage('ส่งคะแนนสำเร็จ', 'success');
        } catch (error) {
          console.error("Error submitting score:", error);
          showMessage('ข้อผิดพลาด', `เกิดข้อผิดพลาดในการส่งคะแนน: ${error.message}`, 'error');
        }
      },
      true // showConfirmButton
    );
  };

  if (loadingContestant) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
        <div className="text-xl font-semibold text-gray-700">กำลังโหลดข้อมูลกรรมการ...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center bg-gradient-to-br from-blue-50 to-white">
      <div className="bg-white bg-opacity-90 p-8 rounded-xl shadow-2xl w-full max-w-2xl border-4 border-blue-600 mb-6">
        <h2 className="text-3xl font-bold text-center mb-4 text-blue-800">
          หน้ากรรมการ: {loggedInUser?.name || loggedInUser?.email}
        </h2>
        <p className="text-lg text-center text-gray-600 mb-6">
          <span className="font-semibold text-blue-700">รหัสกรรมการ:</span> {loggedInUser?.uid}
        </p>

        <div className={`mb-6 p-4 rounded-xl text-center font-bold text-lg ${isJudgingOpen ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
            {isJudgingOpen ? '✅ พร้อมลงคะแนน! โปรดให้คะแนนผู้เข้าประกวด' : '🛑 รอ Admin เปิดการลงคะแนน...'}
        </div>

        {currentContestant ? (
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-blue-700 mb-2">
              ผู้เข้าประกวดปัจจุบัน: {currentContestant.number} - {currentContestant.name}
            </h3>
            <p className="text-gray-600 text-lg">แต่งเป็น: {currentContestant.character}</p>
            <img
                src={currentContestant.imageUrl}
                alt={currentContestant.name}
                className="w-[48rem] h-[32rem] object-cover rounded-md mx-auto mt-4 border-4 border-blue-500 shadow-md"
                onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/768x512/ADD8E6/1E90FF?text=ไม่มีรูปภาพ"; }}
            />
          </div>
        ) : (
          <div className="text-center mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xl text-blue-800 font-semibold">
              กำลังรอผู้เข้าประกวด... โปรดรอ Admin เปลี่ยนผู้เข้าประกวด
            </p>
          </div>
        )}

        {currentContestant && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {[
                { key: 'personality', label: '1. บุคลิกภาพ / ความมั่นใจ (15 คะแนน)' },
                { key: 'walking', label: '2. ท่าทางการเดิน บุคลิกภาพคล้ายตัวคร (15 คะแนน)' },
                { key: 'attire', label: '3. ชุดสวย,สมจริง,มีความครีเอตต์,แข็งแรงทนทาน (15 คะแนน)' },
                { key: 'language', label: '4. การแนะนำตัวหรือสื่อถึงตัวคร (15 คะแนน)' },
                { key: 'overall', label: '5. ภาพรวมทั้งหมด (15 คะแนน)' },
              ].map((category) => (
                <div key={category.key} className="bg-blue-50 p-5 rounded-xl shadow-md border border-blue-200">
                  <h3 className="text-xl font-semibold mb-3 text-blue-800">{category.label}</h3>
                  <div className="flex justify-center gap-4">
                    {[5, 10, 15].map(scoreValue => (
                      <button
                        key={`${category.key}-${scoreValue}`}
                        onClick={() => handleScoreButtonClick(category.key, scoreValue)}
                        className={`w-16 h-16 text-center text-2xl font-bold rounded-lg border-2 border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-600 transition duration-200
                          ${scores[category.key] === scoreValue ? 'bg-blue-600 text-white' : 'bg-blue-300 text-blue-900 hover:bg-blue-400'}
                          ${isSubmittedForCurrentContestant || !isJudgingOpen ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        disabled={isSubmittedForCurrentContestant || !isJudgingOpen}
                      >
                        {scoreValue}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 p-5 rounded-xl shadow-md border border-blue-200 mb-8">
                <h3 className="text-xl font-semibold mb-3 text-blue-800">การคัดเลือกเข้ารอบ</h3>
                <div className="flex justify-center gap-8" id="keepStatusButtons">
                    <button
                        onClick={() => handleKeepStatusClick('keep')}
                        className={`px-8 py-4 font-bold text-xl rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105
                            ${keepStatus === 'keep' ? 'bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}
                            ${isSubmittedForCurrentContestant || !isJudgingOpen ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        disabled={isSubmittedForCurrentContestant || !isJudgingOpen}
                    >
                        ✅ เก็บเข้ารอบ
                    </button>
                    <button
                        onClick={() => handleKeepStatusClick('dont-keep')}
                        className={`px-8 py-4 font-bold text-xl rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105
                            ${keepStatus === 'dont-keep' ? 'bg-red-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}
                            ${isSubmittedForCurrentContestant || !isJudgingOpen ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        disabled={isSubmittedForCurrentContestant || !isJudgingOpen}
                    >
                        ❌ ไม่เก็บ
                    </button>
                </div>
            </div>

            <div className="text-center mt-6 p-4 bg-blue-100 rounded-lg border border-blue-300">
              <h4 className="text-2xl font-bold text-blue-800">คะแนนรวม: {totalScore} / 75</h4>
            </div>

            <button
              onClick={handleSubmitScore}
              className={`w-full py-3 px-4 rounded-lg transition duration-300 shadow-lg text-xl font-bold ${
                isSubmittedForCurrentContestant || !isJudgingOpen
                  ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              disabled={isSubmittedForCurrentContestant || !isJudgingOpen}
            >
              {isSubmittedForCurrentContestant ? 'ส่งคะแนนแล้ว' : 'ยืนยันการส่งคะแนน'}
            </button>
            {isSubmittedForCurrentContestant && (
              <p className="text-center text-red-500 text-sm mt-2">
                คุณได้ส่งคะแนนสำหรับผู้เข้าประกวดคนนี้แล้ว ไม่สามารถแก้ไขได้
              </p>
            )}
          </div>
        )}
      </div>
      <button
        onClick={() => {
          showMessage('คุณต้องการออกจากระบบหรือไม่?', 'info', async () => {
            await signOut(auth);
            setView('login');
            setLoggedInUser(null);
          }, true);
        }}
        className="mt-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 shadow-md"
      >
        ออกจากระบบ
      </button>
    </div>
  );
};

// Admin Panel Component (for administrators)
const AdminPanel = () => {
  const { db, storage, showMessage, loggedInUser, setView, auth, setLoggedInUser, toggleVideoPlaying, videoPlayingState, showSummaryScreen, setShowSummaryScreen, videoRef } = useContext(FirebaseContext);
  const [contestants, setContestants] = useState([]);
  const [judges, setJudges] = useState([]);
  const [newContestant, setNewContestant] = useState({ name: '', number: '', character: '', imageFile: null, imageUrl: '' });
  const [newJudge, setNewJudge] = useState({ name: '', email: '', password: '', role: 'judge' });
  const [currentContestantId, setCurrentContestantId] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [isJudgingOpen, setIsJudgingOpen] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [aggregatedScores, setAggregatedScores] = useState({});

  const [isCountingDown, setIsCountingDown] = useState(false); // State to control countdown UI
  const [countdownValue, setCountdownValue] = useState(0); // Value of the countdown
  const [nextContestantData, setNextContestantData] = useState(null); // Data for the next contestant during countdown

  // Ref for the countdown interval to clear it
  const countdownIntervalRef = useRef(null);

  useEffect(() => {
    if (!db) {
      setLoadingAdmin(true);
      return;
    }

    setLoadingAdmin(true);

    const contestantsColRef = collection(db, `artifacts/${CANVAS_APP_ID}/public/data/contestants`);
    const judgesColRef = collection(db, `artifacts/${CANVAS_APP_ID}/public/data/judges`);
    const appStateDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`);

    const unsubscribeContestants = onSnapshot(contestantsColRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setContestants(list.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)));
      setLoadingAdmin(false);
    }, (error) => {
      console.error("Error fetching contestants:", error);
      showMessage('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลผู้เข้าประกวดได้', 'error');
      setLoadingAdmin(false);
    });

    const unsubscribeJudges = onSnapshot(judgesColRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJudges(list);
      setLoadingAdmin(false);
    }, (error) => {
      console.error("Error fetching judges:", error);
      showMessage('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลกรรมการได้', 'error');
      setLoadingAdmin(false);
    });

    const unsubscribeAppState = onSnapshot(appStateDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentContestantId(data.currentContestantId || null);
        setVideoUrl(data.videoUrl || '');
        setIsJudgingOpen(data.isJudgingOpen || false);
        setShowResults(data.showResults || false); // Update showResults from Firestore
        setShowSummaryScreen(data.showSummaryScreen || false); // Update showSummaryScreen from Firestore

        // Handle countdown state from Firestore
        setIsCountingDown(data.isCountingDown || false);
        setCountdownValue(data.countdownValue || 0);

        if (data.isCountingDown && data.nextContestantIdAfterCountdown) {
          const nextContestantSnap = await getDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/contestants`, data.nextContestantIdAfterCountdown));
          if (nextContestantSnap.exists()) {
            setNextContestantData({ id: nextContestantSnap.id, ...nextContestantSnap.data() });
          } else {
            setNextContestantData(null);
          }
        } else {
          setNextContestantData(null);
        }

        // If Firestore indicates countdown is active, ensure our local interval is running
        if (data.isCountingDown && !countdownIntervalRef.current) {
          // This function will set up the interval and update Firestore
          startAdminCountdown(
            data.nextContestantIdAfterCountdown,
            data.countdownValue,
            data.isJudgingOpenChange,
            data.showSummaryScreenChange,
            true // isSync: true means we are syncing with Firestore, not initiating
          );
        } else if (!data.isCountingDown && countdownIntervalRef.current) {
          // If Firestore says countdown is off, but our local interval is running, clear it
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }

        // Apply changes after countdown if they were pending
        if (!data.isCountingDown && data.isJudgingOpenChange !== undefined) {
          if (data.isJudgingOpenChange !== isJudgingOpen) {
            setIsJudgingOpen(data.isJudgingOpenChange);
          }
          if (data.showSummaryScreenChange !== showSummaryScreen) {
            setShowSummaryScreen(data.showSummaryScreenChange);
          }
          // Clear the change flags in Firestore after applying
          await updateDoc(appStateDocRef, {
            isJudgingOpenChange: false,
            showSummaryScreenChange: false,
          });
        }

      } else {
        // Initialize appState if it doesn't exist
        await setDoc(appStateDocRef, {
          currentContestantId: null,
          videoUrl: '',
          videoPlaying: false,
          isJudgingOpen: false,
          isCountingDown: false,
          countdownValue: 0,
          nextContestantIdAfterCountdown: null,
          isJudgingOpenChange: false,
          showSummaryScreen: false,
          showSummaryScreenChange: false,
          showResults: false, // Initialize showResults
        }, { merge: true });
      }
      setLoadingAdmin(false);
    }, (error) => {
      console.error("Error listening to appState (Admin):", error);
      showMessage('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อข้อมูลสถานะระบบได้', 'error');
      setLoadingAdmin(false);
    });

    return () => {
      unsubscribeContestants();
      unsubscribeJudges();
      unsubscribeAppState();
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [db, showMessage]);

  // Function to start the admin countdown
  const startAdminCountdown = async (
    targetContestantId,
    initialValue = 10,
    isJudgingOpenChange = false,
    showSummaryScreenChange = false,
    isSync = false // New parameter to indicate if this is a sync from Firestore
  ) => {
    // Only update Firestore if this is not a sync operation
    if (!isSync) {
      try {
        await updateDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`), {
          isCountingDown: true,
          countdownValue: initialValue,
          nextContestantIdAfterCountdown: targetContestantId || null,
          isJudgingOpenChange,
          showSummaryScreenChange,
        });
      } catch (error) {
        console.error("Error starting countdown:", error);
        showMessage('เกิดข้อผิดพลาดในการเริ่มนับถอยหลัง: ' + error.message, 'error');
        return;
      }
    }

    // Clear any existing interval to prevent multiple timers
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    let count = initialValue;
    setCountdownValue(count); // Set initial value for UI

    countdownIntervalRef.current = setInterval(async () => {
      try {
        count -= 1;
        setCountdownValue(count);

        if (count <= 0) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;

          // Apply the pending changes and reset countdown state in Firestore
          await updateDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`), {
            isCountingDown: false,
            countdownValue: 0,
            currentContestantId: targetContestantId,
            isJudgingOpen: isJudgingOpenChange,
            showSummaryScreen: showSummaryScreenChange,
            nextContestantIdAfterCountdown: null,
            isJudgingOpenChange: false,
            showSummaryScreenChange: false,
          });
        } else {
          await updateDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`), {
            countdownValue: count,
          });
        }
      } catch (error) {
        console.error("Error during countdown interval:", error);
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        showMessage('เกิดข้อผิดพลาดระหว่างนับถอยหลังและได้ทำการยกเลิกเพื่อป้องกันข้อผิดพลาด: ' + error.message, 'error');
        // Attempt to reset the state in Firestore
        try {
          await updateDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`), {
            isCountingDown: false,
            countdownValue: 0,
            nextContestantIdAfterCountdown: null,
            isJudgingOpenChange: false,
            showSummaryScreenChange: false,
          });
        } catch (resetError) {
          console.error("Failed to reset countdown state after interval error:", resetError);
        }
      }
    }, 1000);
  };

  // Function to cancel the admin countdown
  const cancelAdminCountdown = async () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    // Reset countdown state in Firestore
    await updateDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`), {
      isCountingDown: false,
      countdownValue: 0,
      nextContestantIdAfterCountdown: null,
      isJudgingOpenChange: false,
      showSummaryScreenChange: false,
    });
    showMessage('การนับถอยหลังถูกยกเลิก', 'การดำเนินการถูกยกเลิกแล้ว', 'info');
  };

  const uploadImageToCloudinary = async (file) => {
    if (!file) return '';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.secure_url) {
        return data.secure_url;
      } else {
        throw new Error(data.error?.message || 'Cloudinary upload failed');
      }
    } catch (error) {
      console.error("Error uploading to Cloudinary:", error);
      showMessage('ข้อผิดพลาด Cloudinary', `เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ${error.message}`, 'error');
      return '';
    }
  };

  const handleAddContestant = async (e) => {
    e.preventDefault();
    if (!newContestant.name || !newContestant.number || !newContestant.character) {
      showMessage('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อ, หมายเลข และตัวละครที่แต่งของผู้เข้าประกวด', 'error');
      return;
    }

    setLoadingAdmin(true);
    try {
      let uploadedImageUrl = '';
      if (newContestant.imageFile) {
        uploadedImageUrl = await uploadImageToCloudinary(newContestant.imageFile);
      }

      await addDoc(collection(db, `artifacts/${CANVAS_APP_ID}/public/data/contestants`), {
        name: newContestant.name,
        number: newContestant.number,
        character: newContestant.character,
        imageUrl: uploadedImageUrl,
      });
      setNewContestant({ name: '', number: '', character: '', imageFile: null, imageUrl: '' });
      showMessage('เพิ่มสำเร็จ', 'เพิ่มผู้เข้าประกวดเรียบร้อยแล้ว', 'success');
    } catch (error) {
      console.error("Error adding contestant:", error);
      showMessage('ข้อผิดพลาด', `เกิดข้อผิดพลาดในการเพิ่มผู้เข้าประกวด: ${error.message}`, 'error');
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleDeleteContestant = async (id) => {
    showMessage(
      'คุณต้องการลบผู้เข้าประกวดคนนี้และคะแนนทั้งหมดที่เกี่ยวข้องหรือไม่?',
      'info',
      async () => {
        setLoadingAdmin(true);
        try {
          await deleteDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/contestants`, id));
          const judgesSnapshot = await getDocs(collection(db, `artifacts/${CANVAS_APP_ID}/public/data/judges`));
          for (const judgeDoc of judgesSnapshot.docs) {
            const scoreColRef = collection(db, `artifacts/${CANVAS_APP_ID}/users/${judgeDoc.id}/scores`);
            const q = query(scoreColRef, where('contestantId', '==', id));
            const scoreSnap = await getDocs(q);
            scoreSnap.forEach(async (docToDelete) => {
                await deleteDoc(docToDelete.ref);
            });
          }
          showMessage('ลบสำเร็จ', 'ลบผู้เข้าประกวดและคะแนนเรียบร้อยแล้ว', 'success');
        } catch (error) {
          console.error("Error deleting contestant:", error);
          showMessage('ข้อผิดพลาด', `เกิดข้อผิดพลาดในการลบผู้เข้าประกวด: ${error.message}`, 'error');
        } finally {
          setLoadingAdmin(false);
        }
      },
      true
    );
  };

  const handleAddJudge = async (e) => {
    e.preventDefault();
    if (!newJudge.name || !newJudge.email || !newJudge.password || !newJudge.role) {
      showMessage('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อ, อีเมล, รหัสผ่าน และบทบาทของกรรมการ', 'error');
      return;
    }
    setLoadingAdmin(true);
    try {
      // 1. Create user in Firebase Authentication
      if (!auth) {
        throw new Error("Firebase Auth is not initialized.");
      }
      const userCredential = await createUserWithEmailAndPassword(auth, newJudge.email, newJudge.password);
      const userUid = userCredential.user.uid;

      // 2. Add judge profile to Firestore using UID as Document ID
      await setDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/judges`, userUid), {
        name: newJudge.name,
        email: newJudge.email,
        role: newJudge.role, // 'judge' or 'admin'
      });
      setNewJudge({ name: '', email: '', password: '', role: 'judge' }); // Reset form fields
      showMessage('เพิ่มกรรมการสำเร็จ', `เพิ่มผู้ใช้ ${newJudge.email} เรียบร้อยแล้ว`, 'success');
    } catch (error) {
      console.error("Error adding judge:", error);
      let errorMessage = `เกิดข้อผิดพลาดในการเพิ่มกรรมการ: ${error.message}`;
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'อีเมลนี้ถูกใช้งานแล้ว โปรดใช้อีเมลอื่น';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
      }
      showMessage('ข้อผิดพลาด', errorMessage, 'error');
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleDeleteJudge = async (id, emailToDelete) => {
    showMessage(
      'คุณต้องการลบกรรมการคนนี้และคะแนนทั้งหมดที่กรรมการคนนี้ให้หรือไม่?',
      'info',
      async () => {
        setLoadingAdmin(true);
        try {
          // Delete judge profile from Firestore
          await deleteDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/judges`, id));

          // Delete all scores given by this judge
          const scoresColRef = collection(db, `artifacts/${CANVAS_APP_ID}/users/${id}/scores`);
          const scoresSnapshot = await getDocs(scoresColRef);
          for (const scoreDoc of scoresSnapshot.docs) {
            await deleteDoc(scoreDoc.ref);
          }

          // TODO: Implement Firebase Cloud Function to delete user from Firebase Authentication
          // Deleting user from Auth directly from client is not recommended for security.
          // For now, you'll need to manually delete the user from Firebase Auth Console.
          showMessage('ลบกรรมการสำเร็จ', `ลบโปรไฟล์กรรมการและคะแนนเรียบร้อยแล้ว (โปรดลบผู้ใช้จาก Firebase Auth Console ด้วยมือ)`, 'success');
        } catch (error) {
          console.error("Error deleting judge:", error);
          showMessage('ข้อผิดพลาด', `เกิดข้อผิดพลาดในการลบกรรมการ: ${error.message}`, 'error');
        } finally {
          setLoadingAdmin(false);
        }
      },
      true
    );
  };

  const handleNextContestant = async () => {
    if (!contestants.length) {
      showMessage('ข้อผิดพลาด', 'ไม่มีผู้เข้าประกวดให้เปลี่ยน', 'error');
      return;
    }
    const currentIndex = contestants.findIndex(c => c.id === currentContestantId);
    const nextIndex = (currentIndex + 1) % contestants.length;
    const nextContestant = contestants[nextIndex];
    startAdminCountdown(nextContestant.id, 10, isJudgingOpen, showSummaryScreen); // Pass current judging/summary state
  };

  const handlePreviousContestant = async () => {
    if (!contestants.length) {
      showMessage('ข้อผิดพลาด', 'ไม่มีผู้เข้าประกวดให้เปลี่ยน', 'error');
      return;
    }
    const currentIndex = contestants.findIndex(c => c.id === currentContestantId);
    const prevIndex = (currentIndex - 1 + contestants.length) % contestants.length;
    const prevContestant = contestants[prevIndex];
    startAdminCountdown(prevContestant.id, 10, isJudgingOpen, showSummaryScreen); // Pass current judging/summary state
  };

  const handleSetNoContestant = async () => {
    // This action directly sets currentContestantId to null without a countdown
    await updateDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`), {
      currentContestantId: null,
      isCountingDown: false,
      countdownValue: 0,
      nextContestantIdAfterCountdown: null,
      isJudgingOpenChange: false,
      showSummaryScreenChange: false,
    });
    showMessage('ควบคุมแสดงผล', 'ตั้งค่าเป็นไม่มีผู้เข้าประกวดแล้ว', 'success');
  };

  const handleSetVideoUrl = async () => {
    if (!videoUrl) {
      showMessage('ข้อผิดพลาด', 'กรุณากรอก URL วิดีโอ', 'error');
      return;
    }
    setLoadingAdmin(true);
    try {
      await updateDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`), { videoUrl: videoUrl });
      showMessage('ตั้งค่าสำเร็จ', 'URL วิดีโอถูกตั้งค่าเรียบร้อยแล้ว', 'success');
    } catch (error) {
      console.error("Error setting video URL:", error);
      showMessage('ข้อผิดพลาด', `เกิดข้อผิดพลาดในการตั้งค่า URL วิดีโอ: ${error.message}`, 'error');
    } finally {
      setLoadingAdmin(false);
    }
  };

  const toggleJudgingState = async () => {
    setLoadingAdmin(true);
    try {
      // Toggle the state and then start countdown with the *new* desired state
      startAdminCountdown(currentContestantId, 10, !isJudgingOpen, showSummaryScreen);
    } finally {
      setLoadingAdmin(false);
    }
  };

  const toggleSummaryScreen = async () => {
    setLoadingAdmin(true);
    try {
      // Toggle the state and then start countdown with the *new* desired state
      startAdminCountdown(currentContestantId, 10, isJudgingOpen, !showSummaryScreen);
    } finally {
      setLoadingAdmin(false);
    }
  };

  const aggregateScores = async () => {
    setLoadingAdmin(true);
    try {
      const allJudgesSnapshot = await getDocs(collection(db, `artifacts/${CANVAS_APP_ID}/public/data/judges`));
      const allContestantsSnapshot = await getDocs(collection(db, `artifacts/${CANVAS_APP_ID}/public/data/contestants`));

      const contestantsMap = new Map(allContestantsSnapshot.docs.map(doc => [doc.id, doc.data()]));
      // No need for judgesMap as we iterate through judgeDoc.id directly

      const results = {};

      contestantsMap.forEach((contestant, id) => {
        results[id] = {
          ...contestant,
          personalitySum: 0, walkingSum: 0, attireSum: 0, languageSum: 0, overallSum: 0,
          totalScoreSum: 0,
          categoryScores: { personality: '0.00', walking: '0.00', attire: '0.00', language: '0.00', overall: '0.00' },
          totalScore: '0.00',
          judgeScores: {},
          submittedJudgesCount: 0,
        };
      });

      for (const judgeDoc of allJudgesSnapshot.docs) {
        const judgeId = judgeDoc.id;
        const judgeName = judgeDoc.data().name || judgeDoc.data().email;
        const scoresColRef = collection(db, `artifacts/${CANVAS_APP_ID}/users/${judgeId}/scores`);
        const judgeScoresSnapshot = await getDocs(scoresColRef);

        judgeScoresSnapshot.forEach(scoreDoc => {
          const scoreData = scoreDoc.data();
          const contestantId = scoreData.contestantId;

          if (results[contestantId]) {
            results[contestantId].personalitySum += scoreData.personality || 0;
            results[contestantId].walkingSum += scoreData.walking || 0;
            results[contestantId].attireSum += scoreData.attire || 0;
            results[contestantId].languageSum += scoreData.language || 0;
            results[contestantId].overallSum += scoreData.overall || 0;
            results[contestantId].totalScoreSum += scoreData.totalScore || 0;
            results[contestantId].submittedJudgesCount++;

            results[contestantId].judgeScores[judgeName] = {
              total: scoreData.totalScore,
              personality: scoreData.personality, walking: scoreData.walking, attire: scoreData.attire,
              language: scoreData.language, overall: scoreData.overall,
              keepStatus: scoreData.keepStatus || '',
            };
          }
        });
      }

      Object.keys(results).forEach(contestantId => {
        const contestantResult = results[contestantId];
        const count = contestantResult.submittedJudgesCount;
        if (count > 0) {
          contestantResult.totalScore = (contestantResult.totalScoreSum / count).toFixed(2);
          contestantResult.categoryScores.personality = (contestantResult.personalitySum / count).toFixed(2);
          contestantResult.categoryScores.walking = (contestantResult.walkingSum / count).toFixed(2);
          contestantResult.categoryScores.attire = (contestantResult.attireSum / count).toFixed(2);
          contestantResult.categoryScores.language = (contestantResult.languageSum / count).toFixed(2);
          contestantResult.categoryScores.overall = (contestantResult.overallSum / count).toFixed(2);
        }
      });

      setAggregatedScores(results);
      setShowResults(true);
      // Optional: Save aggregated scores to a public document for AudienceDisplay/SummaryScreen
      await setDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/aggregatedScores`, 'summary'), results);
      showMessage('รวบรวมคะแนนสำเร็จ', 'success');

    } catch (error) {
      console.error("Error aggregating scores:", error);
      showMessage('ข้อผิดพลาด', `เกิดข้อผิดพลาดในการรวบรวมคะแนน: ${error.message}`, 'error');
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleExportScoresAsCSV = () => {
    if (Object.keys(aggregatedScores).length === 0) {
      showMessage('ไม่มีข้อมูล', 'ไม่มีคะแนนที่ถูกรวบรวมเพื่อส่งออก', 'info');
      return;
    }

    const baseHeaders = [
      'หมายเลข', 'ชื่อ', 'ตัวละคร',
      'บุคลิกภาพ (เฉลี่ย)', 'ท่าทางการเดิน (เฉลี่ย)', 'การแต่งกาย (เฉลี่ย)',
      'การแนะนำตัว (เฉลี่ย)', 'ภาพรวม (เฉลี่ย)', 'คะแนนรวมเฉลี่ย',
      'จำนวนกรรมการที่ให้คะแนน'
    ];

    const uniqueJudgeNames = judges.map(judge => judge.name || judge.email).sort();
    uniqueJudgeNames.forEach(judgeName => {
      baseHeaders.push(`${judgeName} (รวม)`);
      baseHeaders.push(`${judgeName} (บุคลิกภาพ)`);
      baseHeaders.push(`${judgeName} (การเดิน)`);
      baseHeaders.push(`${judgeName} (การแต่งกาย)`);
      baseHeaders.push(`${judgeName} (การแนะนำตัว)`);
      baseHeaders.push(`${judgeName} (ภาพรวม)`);
      baseHeaders.push(`${judgeName} (สถานะ)`);
    });

    let csvContent = baseHeaders.join(',') + '\n';

    Object.values(aggregatedScores)
      .sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0))
      .forEach(contestantResult => {
        const rowData = [
          contestantResult.number,
          `"${contestantResult.name}"`,
          `"${contestantResult.character}"`,
          contestantResult.submittedJudgesCount > 0 ? (contestantResult.personalitySum / contestantResult.submittedJudgesCount).toFixed(2) : '0.00',
          contestantResult.submittedJudgesCount > 0 ? (contestantResult.walkingSum / contestantResult.submittedJudgesCount).toFixed(2) : '0.00',
          contestantResult.submittedJudgesCount > 0 ? (contestantResult.attireSum / contestantResult.submittedJudgesCount).toFixed(2) : '0.00',
          contestantResult.submittedJudgesCount > 0 ? (contestantResult.languageSum / contestantResult.submittedJudgesCount).toFixed(2) : '0.00',
          contestantResult.submittedJudgesCount > 0 ? (contestantResult.overallSum / contestantResult.submittedJudgesCount).toFixed(2) : '0.00',
          contestantResult.submittedJudgesCount > 0 ? (contestantResult.totalScoreSum / contestantResult.submittedJudgesCount).toFixed(2) : '0.00',
          contestantResult.submittedJudgesCount
        ];

        uniqueJudgeNames.forEach(judgeName => {
          const judgeScore = contestantResult.judgeScores[judgeName];
          if (judgeScore) {
            rowData.push(judgeScore.total || 0);
            rowData.push(judgeScore.personality || 0);
            rowData.push(judgeScore.walking || 0);
            rowData.push(judgeScore.attire || 0);
            rowData.push(judgeScore.language || 0);
            rowData.push(judgeScore.overall || 0);
            rowData.push(`"${judgeScore.keepStatus || ''}"`);
          } else {
            rowData.push('', '', '', '', '', '', '');
          }
        });
        csvContent += rowData.join(',') + '\n';
      });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'contest_scores.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showMessage('ส่งออกสำเร็จ', 'ไฟล์ CSV ถูกดาวน์โหลดแล้ว', 'success');
    } else {
      showMessage('ข้อผิดพลาด', 'เบราว์เซอร์ของคุณไม่รองรับการดาวน์โหลดไฟล์ CSV โดยตรง โปรดคัดลอกข้อมูลจากตาราง', 'error');
    }
  };

  if (loadingAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
        <div className="text-xl font-semibold text-gray-700">กำลังโหลดข้อมูล Admin...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center bg-gradient-to-br from-blue-50 to-white">
      <div className="bg-white bg-opacity-90 p-8 rounded-xl shadow-2xl w-full max-w-4xl border-4 border-blue-600 mb-6">
        <h2 className="text-3xl font-bold text-center mb-6 text-blue-800">Admin Control Panel</h2>
        <p className="text-lg text-center text-gray-600 mb-6">
          <span className="font-semibold text-blue-700">ผู้ดูแลระบบ:</span> {loggedInUser?.name || loggedInUser?.email}
        </p>

        {/* Display Control Section */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg shadow-md border border-blue-200">
          <h3 className="text-2xl font-bold text-blue-700 mb-4">ควบคุมการแสดงผล</h3>
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            <button
              onClick={handlePreviousContestant}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 shadow-md text-lg disabled:opacity-50"
              disabled={contestants.length === 0 || isCountingDown} // Disable if countdown is active
            >
              &lt; ผู้เข้าประกวดก่อนหน้า
            </button>
            <button
              onClick={handleSetNoContestant}
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition duration-300 shadow-md text-lg disabled:opacity-50"
              disabled={isCountingDown} // Disable if countdown is active
            >
              ไม่มีผู้เข้าประกวด
            </button>
            <button
              onClick={handleNextContestant}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 shadow-md text-lg disabled:opacity-50"
              disabled={contestants.length === 0 || isCountingDown} // Disable if countdown is active
            >
              ผู้เข้าประกวดถัดไป &gt;
            </button>
          </div>
          {currentContestantId && (
            <p className="text-center text-lg text-gray-700 mt-2">
              ผู้เข้าประกวดปัจจุบัน: {contestants.find(c => c.id === currentContestantId)?.name || 'ไม่พบ'}
            </p>
          )}

          <div className="mt-6 border-t pt-6 border-blue-200">
            <h4 className="text-xl font-bold text-blue-700 mb-3">วิดีโอพื้นหลัง</h4>
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <input
                type="text"
                placeholder="URL วิดีโอ (เช่น YouTube)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="flex-grow p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
              />
              <button
                onClick={handleSetVideoUrl}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 shadow-md text-base"
              >
                ตั้งค่า URL
              </button>
            </div>
            {videoUrl && (
              <div className="mt-4 text-center">
                {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? (
                  <ReactPlayer
                    url={videoUrl}
                    playing={videoPlayingState} // Controlled by FirebaseContext
                    loop
                    muted
                    width="100%"
                    height="100%"
                    style={{ position: 'absolute', top: 0, left: 0 }}
                    config={{
                      youtube: {
                        playerVars: {
                          autoplay: 1,
                          controls: 0,
                          showinfo: 0,
                          modestbranding: 1,
                          loop: 1,
                          playlist: videoUrl.includes('youtube.com/watch?v=') ? videoUrl.split('v=')[1].substring(0, 11) : '', // For looping YouTube videos
                        }
                      }
                    }}
                  />
                ) : (
                  <video
                    ref={videoRef} // Use videoRef from context
                    src={videoUrl}
                    loop
                    muted
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Judging Status Control */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg shadow-md border border-blue-200">
          <h3 className="text-2xl font-bold text-blue-700 mb-4">ควบคุมสถานะการลงคะแนน</h3>
          <button
            onClick={toggleJudgingState}
            className={`w-full py-3 px-6 rounded-lg transition duration-300 shadow-md text-lg font-bold
              ${isJudgingOpen ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white
            `}
            disabled={isCountingDown} // Disable if countdown is active
          >
            {isJudgingOpen ? 'ปิดการลงคะแนน' : 'เปิดการลงคะแนน'}
          </button>
        </div>

        {/* Summary Screen Control */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg shadow-md border border-blue-200">
          <h3 className="text-2xl font-bold text-blue-700 mb-4">ควบคุมหน้าสรุปผล</h3>
          <button
            onClick={toggleSummaryScreen}
            className={`w-full py-3 px-6 rounded-lg transition duration-300 shadow-md text-lg font-bold
              ${showSummaryScreen ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'} text-white
            `}
            disabled={isCountingDown} // Disable if countdown is active
          >
            {showSummaryScreen ? 'ปิดหน้าสรุปผลบนจอผู้ชม' : 'แสดงผลสรุปบนจอผู้ชม'}
          </button>
        </div>

        {/* Contestant Management Section */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg shadow-md border border-blue-200">
          <h3 className="text-2xl font-bold text-blue-700 mb-4">จัดการผู้เข้าประกวด</h3>
          <form onSubmit={handleAddContestant} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-gray-700 font-medium mb-1">ชื่อ</label>
              <input
                type="text"
                value={newContestant.name}
                onChange={(e) => setNewContestant({ ...newContestant, name: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="ชื่อผู้เข้าประกวด"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">หมายเลข</label>
              <input
                type="text"
                value={newContestant.number}
                onChange={(e) => setNewContestant({ ...newContestant, number: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น 01"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">แต่งเป็นตัวละครอะไร</label>
              <input
                type="text"
                value={newContestant.character}
                onChange={(e) => setNewContestant({ ...newContestant, character: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น เจ้าหญิง, ซุปเปอร์ฮีโร่"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">รูปภาพ</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setNewContestant({ ...newContestant, imageFile: e.target.files[0] })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300 shadow-md text-lg disabled:opacity-50"
                disabled={loadingAdmin}
              >
                เพิ่มผู้เข้าประกวด
              </button>
            </div>
          </form>

          <div className="mt-6 border-t pt-6 border-blue-200">
            <h4 className="text-xl font-bold text-blue-700 mb-3">รายชื่อผู้เข้าประกวด</h4>
            <ul className="space-y-2">
              {contestants.map((c) => (
                <li key={c.id} className="flex items-center justify-between bg-blue-100 p-3 rounded-lg shadow-sm">
                  <div className="flex items-center">
                    {c.imageUrl && (
                      <img
                        src={c.imageUrl}
                        alt={c.name}
                        className="w-12 h-12 object-cover rounded-full mr-3 border border-blue-300"
                        onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/48x48/ADD8E6/1E90FF?text=ไม่มีรูป"; }}
                      />
                    )}
                    <span className="text-gray-800 font-medium">{c.number} - {c.name} (แต่งเป็น: {c.character})</span>
                  </div>
                  <button
                    onClick={() => handleDeleteContestant(c.id)}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-sm transition duration-300"
                  >
                    ลบ
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Judge Management Section */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg shadow-md border border-blue-200">
          <h3 className="text-2xl font-bold text-blue-700 mb-4">จัดการกรรมการ</h3>
          <form onSubmit={handleAddJudge} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-gray-700 font-medium mb-1">ชื่อ</label>
              <input
                type="text"
                value={newJudge.name}
                onChange={(e) => setNewJudge({ ...newJudge, name: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="ชื่อกรรมการ"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">อีเมล</label>
              <input
                type="email"
                value={newJudge.email}
                onChange={(e) => setNewJudge({ ...newJudge, email: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="email@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">รหัสผ่าน</label>
              <input
                type="password"
                value={newJudge.password}
                onChange={(e) => setNewJudge({ ...newJudge, password: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">บทบาท</label>
              <select
                value={newJudge.role}
                onChange={(e) => setNewJudge({ ...newJudge, role: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="judge">กรรมการ</option>
                <option value="admin">แอดมิน</option>
              </select>
            </div>
            <div className="col-span-1 md:col-span-3">
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300 shadow-md text-lg disabled:opacity-50"
                disabled={loadingAdmin}
              >
                เพิ่มกรรมการ
              </button>
            </div>
          </form>

          <div className="mt-6 border-t pt-6 border-blue-200">
            <h4 className="text-xl font-bold text-blue-700 mb-3">รายชื่อกรรมการ</h4>
            <ul className="space-y-2">
              {judges.map((j) => (
                <li key={j.id} className="flex items-center justify-between bg-blue-100 p-3 rounded-lg shadow-sm">
                  <span className="text-gray-800 font-medium">{j.name} ({j.email}) - {j.role === 'admin' ? 'แอดมิน' : 'กรรมการ'}</span>
                  <button
                    onClick={() => handleDeleteJudge(j.id, j.email)}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-sm transition duration-300"
                  >
                    ลบ
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Score Export Section */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg shadow-md border border-blue-200">
          <h3 className="text-2xl font-bold text-blue-700 mb-4">สรุปและ Export คะแนน</h3>
          <button
            onClick={aggregateScores}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 shadow-md text-lg disabled:opacity-50"
            disabled={loadingAdmin}
          >
            {loadingAdmin ? 'กำลังรวบรวมคะแนน...' : 'รวบรวมคะแนนทั้งหมด'}
          </button>

          {showResults && (
            <div className="mt-6 border-t pt-6 border-blue-200">
              <h4 className="text-xl font-bold text-blue-700 mb-4">ผลคะแนนรวม</h4>
              {Object.keys(aggregatedScores).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                        <thead className="bg-blue-200 text-blue-800">
                          <tr>
                            <th className="py-2 px-4 border-b">หมายเลข</th>
                            <th className="py-2 px-4 border-b">ชื่อ</th>
                            <th className="py-2 px-4 border-b">ตัวละคร</th>
                            <th className="py-2 px-4 border-b">บุคลิกภาพ</th>
                            <th className="py-2 px-4 border-b">การเดิน</th>
                            <th className="py-2 px-4 border-b">การแต่งกาย</th>
                            <th className="py-2 px-4 border-b">การใช้ภาษา</th>
                            <th className="py-2 px-4 border-b">ภาพรวม</th>
                            <th className="py-2 px-4 border-b">คะแนนรวมเฉลี่ย</th>
                            <th className="py-2 px-4 border-b">จำนวนกรรมการที่ให้คะแนน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(aggregatedScores)
                            .sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0))
                            .map((data) => (
                              <tr key={data.id} className="hover:bg-blue-50 text-gray-700">
                                <td className="py-2 px-4 border-b text-center">{data.number}</td>
                                <td className="py-2 px-4 border-b">{data.name}</td>
                                <td className="py-2 px-4 border-b">{data.character}</td>
                                <td className="py-2 px-4 border-b text-center">{data.categoryScores.personality}</td>
                                <td className="py-2 px-4 border-b text-center">{data.categoryScores.walking}</td>
                                <td className="py-2 px-4 border-b text-center">{data.categoryScores.attire}</td>
                                <td className="py-2 px-4 border-b text-center">{data.categoryScores.language}</td>
                                <td className="py-2 px-4 border-b text-center">{data.categoryScores.overall}</td>
                                <td className="py-2 px-4 border-b text-center font-bold text-blue-800">{data.totalScore}</td>
                                <td className="py-2 px-4 border-b text-center">{data.submittedJudgesCount}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-center text-gray-600">ยังไม่มีคะแนนที่ถูกรับส่ง</p>
                  )}

                  {Object.keys(aggregatedScores).length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-xl font-bold text-blue-700 mb-4">คะแนนแยกหมวดต่อกรรมการ (ตัวอย่าง)</h4>
                      {Object.values(aggregatedScores).map((contestant, index) => (
                        <div key={`detail-${contestant.id || contestant.number || index}`} className="mb-4 p-4 bg-blue-100 rounded-lg border border-blue-300">
                          <h5 className="font-semibold text-lg text-blue-800">{contestant.number} - {contestant.name}</h5>
                          <ul className="list-disc list-inside ml-4">
                            {Object.keys(contestant.judgeScores).map(judgeName => (
                              <li key={`${contestant.id || contestant.number}-${judgeName}`} className="text-gray-700">
                                <span className="font-medium">{judgeName}:</span> คะแนนรวม {contestant.judgeScores[judgeName].total}, บุคลิกภาพ {contestant.judgeScores[judgeName].personality}, การเดิน {contestant.judgeScores[judgeName].walking}, การแต่งกาย {contestant.judgeScores[judgeName].attire}, การใช้ภาษา {contestant.judgeScores[judgeName].language}, ภาพรวม {contestant.judgeScores[judgeName].overall}, สถานะ: {contestant.judgeScores[judgeName].keepStatus || 'ไม่ได้ระบุ'}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleExportScoresAsCSV}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 shadow-md text-lg mt-6 disabled:opacity-50"
                disabled={Object.keys(aggregatedScores).length === 0}
              >
                ดาวน์โหลดคะแนนเป็นไฟล์ CSV
              </button>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={async () => {
                  showMessage('คุณต้องการออกจากระบบหรือไม่?', 'info', async () => {
                    await signOut(auth);
                    setView('login');
                    setLoggedInUser(null);
                  }, true);
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 shadow-md"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>

          {isCountingDown && ( // Use isCountingDown state for modal visibility
            <div className="fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-[1000]">
              <div className="bg-white p-10 rounded-xl shadow-2xl text-center border-4 border-blue-600">
                <p className="text-3xl font-bold text-blue-800 mb-6">กำลังเปลี่ยนผู้เข้าประกวดในอีก...</p>
                <div className="text-9xl font-extrabold text-blue-700 mb-8 animate-pulse">
                  {countdownValue}
                </div>
                {nextContestantData && ( // Ensure nextContestantData is not null before accessing its properties
                  <div className="mt-8 text-white text-3xl font-semibold text-center">
                    <p>ผู้เข้าประกวดถัดไป:</p>
                    <p>{nextContestantData.number} - {nextContestantData.name}</p>
                    <p>แต่งเป็น: {nextContestantData.character}</p>
                  </div>
                )}
                <button
                  onClick={cancelAdminCountdown}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 shadow-md text-xl"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>
      );
    };

    // Audience Display Component
    const AudienceDisplay = () => {
      const { db, setView, videoPlayingState, showSummaryScreen, videoRef } = useContext(FirebaseContext); // Removed showMessage, toggleVideoPlaying as they are not directly used here for UI control
      const [currentContestant, setCurrentContestant] = useState(null);
      const [videoUrl, setVideoUrl] = useState('');
      const [loadingAudience, setLoadingAudience] = useState(true);

      const [isCountingDown, setIsCountingDown] = useState(false);
      const [countdownValue, setCountdownValue] = useState(0);
      const [nextContestantData, setNextContestantData] = useState(null); // Data for the next contestant during countdown
      const [aggregatedScores, setAggregatedScores] = useState([]);

      useEffect(() => {
        if (!db) {
          setLoadingAudience(true);
          return;
        }

        setLoadingAudience(true);

        const appStateDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/appState/control`);
        const aggregatedScoresDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/aggregatedScores`, 'summary');

        const unsubscribeAppState = onSnapshot(appStateDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setVideoUrl(data.videoUrl || '');
            setIsCountingDown(data.isCountingDown || false);
            setCountdownValue(data.countdownValue || 0);
            // showSummaryScreen is now handled by the context, no need to set here
            // setShowSummaryScreen(data.showSummaryScreen || false);

            if (data.isCountingDown && data.nextContestantIdAfterCountdown) {
              const nextContestantSnap = await getDoc(doc(db, `artifacts/${CANVAS_APP_ID}/public/data/contestants`, data.nextContestantIdAfterCountdown));
              if (nextContestantSnap.exists()) {
                setNextContestantData({ id: nextContestantSnap.id, ...nextContestantSnap.data() });
              } else {
                setNextContestantData(null);
              }
              setCurrentContestant(null);
            } else if (showSummaryScreen) { // Use showSummaryScreen from context
              setCurrentContestant(null);
              setNextContestantData(null);
            }
            else {
              setNextContestantData(null);
              setAggregatedScores([]); // Clear aggregated scores when not on summary screen
              if (data.currentContestantId) {
                const contestantDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/contestants`, data.currentContestantId);
                const contestantSnap = await getDoc(contestantDocRef);
                if (contestantSnap.exists()) {
                  setCurrentContestant({ id: contestantSnap.id, ...contestantSnap.data() });
                } else {
                  setCurrentContestant(null);
                }
              } else {
                setCurrentContestant(null);
              }
            }
          } else {
            // Initialize appState if it doesn't exist
            await setDoc(appStateDocRef, { currentContestantId: null, videoUrl: '', videoPlaying: false, isJudgingOpen: false, isCountingDown: false, countdownValue: 0, nextContestantIdAfterCountdown: null, isJudgingOpenChange: false, showSummaryScreen: false, showSummaryScreenChange: false }, { merge: true });
            setCurrentContestant(null);
            setVideoUrl('');
            setIsCountingDown(false);
            setCountdownValue(0);
            setNextContestantData(null);
            // showSummaryScreen is now handled by the context
            // setShowSummaryScreen(false);
            setAggregatedScores([]);
          }
          setLoadingAudience(false);
        }, (error) => {
          console.error("Error listening to appState for audience:", error);
          setLoadingAudience(false);
        });

        const unsubscribeAggregatedScores = onSnapshot(aggregatedScoresDocRef, (docSnap) => {
          if (docSnap.exists() && showSummaryScreen) { // Only update if summary screen is active
            const data = docSnap.data();
            const finalResults = Object.values(data).map(contestantResult => {
              const count = contestantResult.submittedJudgesCount;
              return {
                id: contestantResult.id,
                number: contestantResult.number,
                name: contestantResult.name,
                character: contestantResult.character,
                imageUrl: contestantResult.imageUrl,
                avgTotalScore: count > 0 ? (contestantResult.totalScoreSum / count).toFixed(2) : '0.00',
                avgPersonality: count > 0 ? (contestantResult.personalitySum / count).toFixed(2) : '0.00',
                avgWalking: count > 0 ? (contestantResult.walkingSum / count).toFixed(2) : '0.00',
                avgAttire: count > 0 ? (contestantResult.attireSum / count).toFixed(2) : '0.00',
                avgLanguage: count > 0 ? (contestantResult.languageSum / count).toFixed(2) : '0.00',
                avgOverall: count > 0 ? (contestantResult.overallSum / count).toFixed(2) : '0.00',
              };
            }).sort((a, b) => parseFloat(b.avgTotalScore) - parseFloat(a.avgTotalScore));
            setAggregatedScores(finalResults);
          } else {
            setAggregatedScores([]);
          }
        }, (error) => {
          console.error("Error listening to aggregated scores for audience:", error);
        });


        return () => {
          unsubscribeAppState();
          unsubscribeAggregatedScores();
        };
      }, [db]);

      useEffect(() => {
        if (videoRef.current) {
          if (videoPlayingState) { // Use videoPlayingState from context
            videoRef.current.play().catch(e => console.error("Video play error:", e));
          } else {
            videoRef.current.pause();
          }
        }
      }, [videoPlayingState, videoUrl, videoRef]); // Depend on videoPlayingState and videoRef

      if (loadingAudience) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
            <div className="text-xl font-semibold text-gray-700">กำลังโหลดหน้าจอแสดงผล...</div>
          </div>
        );
      }

      return (
        <div className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-blue-50 to-white">
          {videoUrl && (
            <div className="absolute inset-0 z-0">
              {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? (
                <ReactPlayer
                  url={videoUrl}
                  playing={videoPlayingState} // Controlled by FirebaseContext
                  loop
                  muted
                  width="100%"
                  height="100%"
                  style={{ position: 'absolute', top: 0, left: 0 }}
                  config={{
                    youtube: {
                      playerVars: {
                        autoplay: 1,
                        controls: 0,
                        showinfo: 0,
                        modestbranding: 1,
                        loop: 1,
                        playlist: videoUrl.includes('youtube.com/watch?v=') ? videoUrl.split('v=')[1].substring(0, 11) : '', // For looping YouTube videos
                      }
                    }
                  }}
                />
              ) : (
                <video
                  ref={videoRef} // Use videoRef from context
                  src={videoUrl}
                  loop
                  muted
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          )}

          <div className="absolute inset-0 z-10 opacity-20 bg-repeat animate-thai-pattern-scroll" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M50 0L61.8 38.2L100 38.2L69.1 61.8L80.9 100L50 76.4L19.1 100L30.9 61.8L0 38.2L38.2 38.2L50 0Z\' fill=\'%23E6F5FD\'/%3E%3C/svg%3E")'}}></div>

          {isCountingDown && (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-[900]">
              <p className="text-white text-4xl font-bold mb-8 drop-shadow-lg">กำลังเปลี่ยนผู้เข้าประกวดในอีก...</p>
              <div className="text-white text-[15rem] font-extrabold animate-pulse drop-shadow-lg">
                {countdownValue}
              </div>
              {nextContestantData && ( // Ensure nextContestantData is not null before accessing its properties
                <div className="mt-8 text-white text-3xl font-semibold text-center">
                  <p>ผู้เข้าประกวดถัดไป:</p>
                  <p>{nextContestantData.number} - {nextContestantData.name}</p>
                  <p>แต่งเป็น: {nextContestantData.character}</p>
                </div>
              )}
            </div>
          )}

          <div className={`relative z-20 bg-white bg-opacity-80 p-10 rounded-3xl shadow-2xl border-8 border-blue-600 max-w-6xl w-full flex flex-col md:flex-row items-center justify-center min-h-[60vh] gap-8 transition-opacity duration-500 ${isCountingDown ? 'opacity-0' : 'opacity-100'}`}>
            {showSummaryScreen ? (
              <div className="w-full text-center">
                <h1 className="text-6xl font-extrabold text-blue-800 mb-8 drop-shadow-lg">สรุปผลการประกวด</h1>
                {aggregatedScores.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                      <thead className="bg-blue-200 text-blue-800">
                        <tr>
                          <th className="py-2 px-4 border-b">อันดับ</th>
                          <th className="py-2 px-4 border-b">หมายเลข</th>
                          <th className="py-2 px-4 border-b">ชื่อ</th>
                          <th className="py-2 px-4 border-b">คะแนนรวมเฉลี่ย</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregatedScores.slice(0, 5).map((data, index) => (
                          <tr key={data.id} className="hover:bg-blue-50 text-gray-700">
                            <td className="py-2 px-4 border-b text-center font-bold">
                              {index === 0 && '👑 อันดับ 1'}
                              {index === 1 && '🥈 อันดับ 2'}
                              {index === 2 && '🥉 อันดับ 3'}
                              {index === 3 && '🏅 ชมเชย'}
                              {index === 4 && '🏅 ชมเชย'}
                            </td>
                            <td className="py-2 px-4 border-b text-center">{data.number}</td>
                            <td className="py-2 px-4 border-b">{data.name}</td>
                            <td className="py-2 px-4 border-b text-center font-bold text-blue-800">{data.avgTotalScore}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center text-gray-600">ยังไม่มีข้อมูลสรุปผล</p>
                )}
              </div>
            ) : (
              currentContestant ? (
                <>
                  <div className="w-full md:w-2/5 flex justify-center items-center">
                      <img
                          src={currentContestant.imageUrl}
                          alt={currentContestant.name}
                          className="w-full h-auto object-cover rounded-md border-8 border-blue-500 shadow-xl"
                          onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/600x400/ADD8E6/1E90FF?text=ไม่มีรูปภาพ"; }}
                      />
                  </div>

                  <div className="w-full md:w-3/5 text-center md:text-left">
                      <h1 className="text-6xl font-extrabold text-blue-800 mb-6 drop-shadow-lg">
                          ผู้เข้าประกวดหมายเลข {currentContestant.number}
                      </h1>
                      <p className="text-5xl font-bold text-gray-800 mb-4">{currentContestant.name}</p>
                      <p className="text-4xl text-gray-600">แต่งเป็น: {currentContestant.character}</p>
                      {/* Removed avgTotalScore display here as it's not directly available on currentContestant and is for summary */}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center">
                  <h1 className="text-6xl font-extrabold text-blue-800 mb-6 drop-shadow-lg">
                    กำลังรอผู้เข้าประกวด...
                  </h1>
                  <p className="text-4xl text-gray-600">โปรดรอสักครู่</p>
                </div>
              )
            )}
          </div>

          <button
            onClick={() => setView('login')}
            className="absolute bottom-4 right-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 shadow-md z-30"
          >
            กลับหน้า Login
          </button>
        </div>
      );
    };

    // Summary Screen Component
    const SummaryScreen = () => {
      const { db, setView } = useContext(FirebaseContext);
      const [aggregatedScores, setAggregatedScores] = useState([]);
      const [loadingSummary, setLoadingSummary] = useState(true);

      useEffect(() => {
        if (!db) {
          setLoadingSummary(true);
          return;
        }

        // Use onSnapshot for real-time updates on the summary screen
        const aggregatedScoresDocRef = doc(db, `artifacts/${CANVAS_APP_ID}/public/data/aggregatedScores`, 'summary');
        const unsubscribe = onSnapshot(aggregatedScoresDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const finalResults = Object.values(data).map(contestantResult => {
              const count = contestantResult.submittedJudgesCount;
              return {
                id: contestantResult.id,
                number: contestantResult.number,
                name: contestantResult.name,
                character: contestantResult.character,
                imageUrl: contestantResult.imageUrl,
                avgTotalScore: count > 0 ? (contestantResult.totalScoreSum / count).toFixed(2) : '0.00',
                avgPersonality: count > 0 ? (contestantResult.personalitySum / count).toFixed(2) : '0.00',
                avgWalking: count > 0 ? (contestantResult.walkingSum / count).toFixed(2) : '0.00',
                avgAttire: count > 0 ? (contestantResult.attireSum / count).toFixed(2) : '0.00',
                avgLanguage: count > 0 ? (contestantResult.languageSum / count).toFixed(2) : '0.00',
                avgOverall: count > 0 ? (contestantResult.overallSum / count).toFixed(2) : '0.00',
              };
            }).sort((a, b) => parseFloat(b.avgTotalScore) - parseFloat(a.avgTotalScore));

            setAggregatedScores(finalResults);
          } else {
            setAggregatedScores([]);
          }
          setLoadingSummary(false); // Set loading to false once data is fetched (or confirmed empty)
        }, (error) => {
          console.error("Error listening to aggregated scores for summary:", error);
          setLoadingSummary(false);
        });

        return () => unsubscribe(); // Cleanup listener on unmount
      }, [db]);

      if (loadingSummary) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
            <div className="text-xl font-semibold text-gray-700">กำลังโหลดผลสรุปคะแนน...</div>
          </div>
        );
      }

      const winner = aggregatedScores.length > 0 ? aggregatedScores[0] : null;
      const otherRankings = aggregatedScores.slice(1);

      return (
        <div className="min-h-screen p-4 flex flex-col items-center bg-gradient-to-br from-blue-50 to-white">
          <div className="bg-white bg-opacity-90 p-8 rounded-xl shadow-2xl w-full max-w-4xl border-4 border-blue-600">
            <h2 className="text-3xl font-bold text-center mb-6 text-blue-800">หน้าสรุปผลการประกวด</h2>

            {winner && (
              <div className="mb-8 p-6 bg-blue-100 rounded-xl shadow-lg border border-blue-300 text-center">
                <h3 className="text-3xl font-bold text-blue-800 mb-4">ผู้ชนะเลิศ</h3>
                {winner.imageUrl && (
                  <img
                    src={winner.imageUrl}
                    alt={winner.name}
                    className="mx-auto mb-4 rounded-md shadow-md border-4 border-blue-400 w-[32rem] h-[21.33rem] object-cover"
                    onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/512x341/ADD8E6/1E90FF?text=ผู้ชนะเลิศ"; }}
                  />
                )}
                <p className="text-4xl font-bold text-blue-900 mb-2">{winner.name}</p>
                <p className="text-2xl text-blue-700">หมายเลข: {winner.number}</p>
                <p className="text-xl text-blue-600">แต่งเป็น: {winner.character}</p>
                <p className="text-3xl font-bold text-blue-900 mt-4">คะแนนรวมเฉลี่ย: {winner.avgTotalScore} / 75</p>
              </div>
            )}

            {otherRankings.length > 0 && (
              <div className="text-left mt-8">
                <h3 className="text-3xl font-bold text-blue-900 mb-4">อันดับอื่นๆ</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                    <thead className="bg-blue-200 text-blue-800">
                      <tr>
                        <th className="py-2 px-4 border-b">อันดับ</th>
                        <th className="py-2 px-4 border-b">หมายเลข</th>
                        <th className="py-2 px-4 border-b">ชื่อ</th>
                        <th className="py-2 px-4 border-b">แต่งเป็นตัวละคร</th>
                        <th className="py-2 px-4 border-b">คะแนนรวมเฉลี่ย</th>
                      </tr>
                    </thead>
                      <tbody>
                        {otherRankings.map((data, index) => (
                          <tr key={data.id} className="hover:bg-blue-50 text-gray-700">
                            <td className="py-2 px-4 border-b text-center">
                              {index === 0 && '🥈 อันดับ 2'}
                              {index === 1 && '🥉 อันดับ 3'}
                              {index === 2 && '🏅 ชมเชย'}
                              {index === 3 && '🏅 ชมเชย'}
                              {index >= 4 && `อันดับ ${index + 2}`}
                            </td>
                            <td className="py-2 px-4 border-b text-center">{data.number}</td>
                            <td className="py-2 px-4 border-b">{data.name}</td>
                            <td className="py-2 px-4 border-b">{data.character}</td>
                            <td className="py-2 px-4 border-b text-center font-bold text-blue-800">{data.avgTotalScore}</td>
                          </tr>
                        ))}
                      </tbody>
                  </table>
                </div>
              </div>
            )}

            {!winner && otherRankings.length === 0 && (
              <p className="text-center text-gray-600 text-xl">ยังไม่มีข้อมูลคะแนนสรุปผล</p>
            )}

            <div className="mt-8 text-center">
              <button
                onClick={() => setView('login')}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 shadow-md"
              >
                กลับหน้า Login
              </button>
            </div>
          </div>
        </div>
      );
    };

    // Tailwind CSS Configuration and Custom Styles
    const style = `
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;700&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=TH+Chakra+Petch:wght@400;700&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

      .font-sarabun {
        font-family: 'Sarabun', sans-serif;
      }
      .font-chakra-petch {
        font-family: 'TH Chakra Petch', sans-serif;
      }
      .font-inter {
        font-family: 'Inter', sans-serif;
      }

      .bg-thai-pattern {
        background-image: url('data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M50 0L61.8 38.2L100 38.2L69.1 61.8L80.9 100L50 76.4L19.1 100L30.9 61.8L0 38.2L38.2 38.2L50 0Z\' fill=\'%23E6F5FD\'/%3E%3C/svg%3E');
        background-size: 100px 100px;
      }

      .loader {
        border-top-color: #4682B4;
        -webkit-animation: spinner 1.5s linear infinite;
        animation: spinner 1.5s linear infinite;
      }

      @-webkit-keyframes spinner {
        0% { -webkit-transform: rotate(0deg); }
        100% { -webkit-transform: rotate(360deg); }
      }

      @keyframes spinner {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      @keyframes thai-pattern-scroll {
        0% { background-position: 0 0; }
        100% { background-position: 100px 100px; }
      }

      .animate-thai-pattern-scroll {
        animation: thai-pattern-scroll 60s linear infinite;
      }

      @keyframes pulse-border {
        0% { border-color: #A78BFA; } /* purple-400 */
        50% { border-color: #6D28D9; } /* purple-700 */
        100% { border-color: #A78BFA; }
      }

      .animate-pulse-border {
        animation: pulse-border 2s infinite alternate;
      }
    `;

    // Inject Tailwind CSS and custom styles
    const styleTag = document.createElement('style');
    styleTag.innerHTML = style;
    document.head.appendChild(styleTag);

    // Export the main App component
    export default App;