
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// This script should be run once to set up the initial admin user
// You'll need to provide your Firebase Admin SDK service account key

const ADMIN_EMAIL = "prathipweiyngya@gmail.com";
const APP_ID = "nrkaneanproject"; // Replace with your actual app ID

async function setupInitialAdmin() {
  try {
    // Initialize Firebase Admin (you'll need to provide serviceAccountKey.json)
    const serviceAccount = require('./serviceAccountKey.json');
    
    const app = initializeApp({
      credential: cert(serviceAccount)
    });

    const auth = getAuth(app);
    const db = getFirestore(app);

    // Find user by email
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(ADMIN_EMAIL);
      console.log('Found existing user:', userRecord.uid);
    } catch (error) {
      console.log('User not found, please create the user first through the web interface');
      return;
    }

    // Set custom claims
    await auth.setCustomUserClaims(userRecord.uid, { role: 'admin' });
    console.log('Custom claims set for admin user');

    // Create admin document in Firestore
    const adminDocRef = db.doc(`artifacts/${APP_ID}/public/data/judges/${userRecord.uid}`);
    await adminDocRef.set({
      name: 'ผู้ดูแลระบบ',
      email: ADMIN_EMAIL,
      role: 'admin'
    });
    
    console.log('Admin document created in Firestore');
    console.log('Setup complete!');

  } catch (error) {
    console.error('Setup failed:', error);
  }
}

// Uncomment the line below to run the setup (make sure you have serviceAccountKey.json)
// setupInitialAdmin();

module.exports = { setupInitialAdmin };
