

require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, collection, addDoc } = require('firebase/firestore');

// Firebase configuration จาก .env file
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function setupFirestoreStructure() {
  try {
    // ตรวจสอบว่า config ถูกตั้งค่าแล้วหรือยัง
    if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
      console.error('❌ ไม่พบ Firebase configuration ในไฟล์ .env');
      console.log('📝 ตรวจสอบว่าไฟล์ .env มีอยู่และมีค่า REACT_APP_FIREBASE_* ครบถ้วน');
      return;
    }

    console.log('เริ่มต้นสร้างโครงสร้าง Firestore...');
    console.log('Project ID:', firebaseConfig.projectId);

    // สร้างโครงสร้างหลัก: artifacts/default-app-id/
    const appId = process.env.REACT_APP_APP_ID || 'default-app-id';

    // 1. สร้าง appState/control document
    await setDoc(doc(db, `artifacts/${appId}/public/data/appState/control`), {
      currentContestantId: null,
      videoUrl: 'https://youtu.be/SLKtH8c7p4t?list=RDSLKtH8c7p4t',
      videoPlaying: false,
      isJudgingOpen: false,
      isCountingDown: false,
      countdownValue: 50,
      nextContestantIdAfterCountdown: null,
      isJudgingOpenChange: false,
      showSummaryScreen: false,
      showSummaryScreenChange: false
    });
    console.log('✅ สร้าง appState/control เรียบร้อยแล้ว');

    // 2. สร้าง contestants collection พร้อมตัวอย่างข้อมูล
    const contestantData = {
      character: 'blue archive',
      imageUrl: 'https://res.cloudinary.com/dnv6bbdwm/image/upload/v1754473092/ajkbpeczvclkqgxsvt.png',
      name: 'test',
      number: '002'
    };
    
    const contestantRef = await addDoc(collection(db, `artifacts/${appId}/public/data/contestants`), contestantData);
    console.log('✅ สร้าง contestants collection เรียบร้อยแล้ว');

    // 3. สร้าง judges collection พร้อมตัวอย่างข้อมูล
    const judgeData = {
      email: 'prathipweiyngya@gmail.com',
      name: 'yadyo admin',
      role: 'admin'
    };
    
    await setDoc(doc(db, `artifacts/${appId}/public/data/judges/AI07ZWXjDwqJb1Q7qxZrxnf5Mew1`), judgeData);
    console.log('✅ สร้าง judges collection เรียบร้อยแล้ว');

    // 4. สร้าง aggregatedScores collection (ว่างไว้ก่อน)
    await setDoc(doc(db, `artifacts/${appId}/public/data/aggregatedScores/summary`), {
      // Document นี้จะถูกเติมข้อมูลโดย aggregateScores function
      placeholder: true
    });
    console.log('✅ สร้าง aggregatedScores collection เรียบร้อยแล้ว');

    // 5. สร้าง users/scores structure พร้อมตัวอย่างข้อมูล
    const judgeId = 'SxSRpQ7doqOsordyNsjdsoPrn1';
    const contestantId = contestantRef.id;
    
    const scoreData = {
      attire: 5,
      contestantId: contestantId,
      contestantName: 'test',
      judgeId: judgeId,
      judgeName: 'Credit',
      keepStatus: 'dont-keep',
      language: 5,
      overall: 5,
      personality: 15,
      submittedAt: new Date('August 7, 2025 at 5:45:02 PM UTC+7'),
      totalScore: 35,
      walking: 5
    };
    
    await setDoc(doc(db, `artifacts/${appId}/users/${judgeId}/scores/${contestantId}`), scoreData);
    console.log('✅ สร้าง users/scores structure เรียบร้อยแล้ว');

    console.log('🎉 สร้างโครงสร้าง Firestore ทั้งหมดเรียบร้อยแล้ว!');
    console.log('📁 โครงสร้างที่สร้าง:');
    console.log(`   artifacts/${appId}/`);
    console.log('   ├── public/');
    console.log('   │   └── data/');
    console.log('   │       ├── appState/');
    console.log('   │       │   └── control');
    console.log('   │       ├── contestants/');
    console.log('   │       │   └── [contestant-documents]');
    console.log('   │       ├── judges/');
    console.log('   │       │   └── [judge-documents]');
    console.log('   │       └── aggregatedScores/');
    console.log('   │           └── summary');
    console.log('   └── users/');
    console.log('       └── [userId]/');
    console.log('           └── scores/');
    console.log('               └── [score-documents]');

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการสร้างโครงสร้าง:', error);
    
    if (error.code === 'permission-denied') {
      console.log('💡 แนะนำการแก้ไข:');
      console.log('   1. ตรวจสอบว่าได้เปิดใช้ Firestore ในโปรเจคแล้ว');
      console.log('   2. ตรวจสอบ Firestore Security Rules');
      console.log('   3. ตรวจสอบว่า Project ID ถูกต้อง');
    }
  }
}

// เรียกใช้ function
setupFirestoreStructure().then(() => {
  console.log('เสร็จสิ้นการตั้งค่า');
  process.exit(0);
}).catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

