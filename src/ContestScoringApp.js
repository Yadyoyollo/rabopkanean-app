
import React, { useState, useEffect, useContext, createContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBkF6zYQGGmKqQP-8vQFx9FqJ6zX3Kq1Ug",
  authDomain: "nrkaneanproject.firebaseapp.com",
  projectId: "nrkaneanproject",
  storageBucket: "nrkaneanproject.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

const FirebaseContext = createContext();
const CANVAS_APP_ID = 'contestScoringApp';

// Message Modal Component
function MessageModal({ message, onClose }) {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">แจ้งเตือน</h3>
        <p className="text-gray-600 mb-4">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-200"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

// Login Panel Component
function LoginPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { showMessage, setLoggedInUser, setView } = useContext(FirebaseContext);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      showMessage('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Get user role from Firestore
      const userDoc = await getDoc(doc(db, `artifacts/${CANVAS_APP_ID}/users`, user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setLoggedInUser({ uid: user.uid, email: user.email, role: userData.role, name: userData.name });
        setView(userData.role === 'admin' ? 'admin' : 'judge');
      } else {
        showMessage('ไม่พบข้อมูลผู้ใช้ในระบบ');
        await signOut(auth);
      }
    } catch (error) {
      showMessage('เข้าสู่ระบบไม่สำเร็จ: ' + error.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">เข้าสู่ระบบ</h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition duration-200 disabled:opacity-50"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Judge Panel Component
function JudgePanel() {
  const [contestants, setContestants] = useState([]);
  const [currentContestantIndex, setCurrentContestantIndex] = useState(0);
  const [scores, setScores] = useState({});
  const [keepStatus, setKeepStatus] = useState('');
  const [submittedScores, setSubmittedScores] = useState(new Set());
  const [isJudgingOpen, setIsJudgingOpen] = useState(true);
  const { db, userId, showMessage, setView } = useContext(FirebaseContext);

  const categories = [
    { key: 'personality', label: 'บุคลิกภาพ', maxScore: 10 },
    { key: 'walking', label: 'การเดิน', maxScore: 10 },
    { key: 'attire', label: 'เครื่องแต่งกาย', maxScore: 10 },
    { key: 'language', label: 'การใช้ภาษา', maxScore: 10 },
    { key: 'overall', label: 'ความประทับใจโดยรวม', maxScore: 10 }
  ];

  useEffect(() => {
    loadContestants();
    checkJudgingStatus();
  }, []);

  const loadContestants = async () => {
    try {
      const contestantsRef = collection(db, `artifacts/${CANVAS_APP_ID}/contestants`);
      const snapshot = await getDocs(contestantsRef);
      const contestantsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContestants(contestantsList);
      
      // Load submitted scores
      if (userId) {
        const scoresRef = collection(db, `artifacts/${CANVAS_APP_ID}/users/${userId}/scores`);
        const scoresSnapshot = await getDocs(scoresRef);
        const submitted = new Set();
        scoresSnapshot.docs.forEach(doc => {
          submitted.add(doc.data().contestantId);
        });
        setSubmittedScores(submitted);
      }
    } catch (error) {
      showMessage('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้เข้าแข่งขัน');
    }
  };

  const checkJudgingStatus = async () => {
    try {
      const statusDoc = await getDoc(doc(db, `artifacts/${CANVAS_APP_ID}/settings`, 'judging'));
      if (statusDoc.exists()) {
        setIsJudgingOpen(statusDoc.data().open || false);
      }
    } catch (error) {
      console.error('Error checking judging status:', error);
    }
  };

  const handleScoreButtonClick = (category, score) => {
    if (isSubmittedForCurrentContestant || !isJudgingOpen) return;
    setScores(prev => ({ ...prev, [category]: score }));
  };

  const handleKeepStatusClick = (status) => {
    if (isSubmittedForCurrentContestant || !isJudgingOpen) return;
    setKeepStatus(status);
  };

  const handleSubmitScore = async () => {
    if (isSubmittedForCurrentContestant || !isJudgingOpen) return;

    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant) return;

    // Check if all categories are scored
    const allScored = categories.every(cat => scores[cat.key] !== undefined);
    if (!allScored || !keepStatus) {
      showMessage('กรุณาให้คะแนนครบทุกหมวดหมู่และเลือกสถานะการคัดเลือก');
      return;
    }

    const totalScore = categories.reduce((sum, cat) => sum + (scores[cat.key] || 0), 0);

    try {
      await setDoc(doc(db, `artifacts/${CANVAS_APP_ID}/users/${userId}/scores`, currentContestant.id), {
        contestantId: currentContestant.id,
        ...scores,
        keepStatus,
        totalScore,
        timestamp: new Date()
      });

      setSubmittedScores(prev => new Set([...prev, currentContestant.id]));
      showMessage('บันทึกคะแนนเรียบร้อยแล้ว');
      
      // Move to next contestant
      if (currentContestantIndex < contestants.length - 1) {
        setCurrentContestantIndex(prev => prev + 1);
        setScores({});
        setKeepStatus('');
      }
    } catch (error) {
      showMessage('เกิดข้อผิดพลาดในการบันทึกคะแนน');
    }
  };

  const currentContestant = contestants[currentContestantIndex];
  const isSubmittedForCurrentContestant = currentContestant && submittedScores.has(currentContestant.id);

  const handleLogout = async () => {
    await signOut(auth);
    setView('login');
  };

  if (!currentContestant) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-700 mb-4">ไม่พบข้อมูลผู้เข้าแข่งขัน</div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">ระบบให้คะแนนผู้เข้าแข่งขัน</h1>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200"
            >
              ออกจากระบบ
            </button>
          </div>
          
          {!isJudgingOpen && (
            <div className="mt-4 p-4 bg-red-100 border border-red-300 rounded-lg">
              <p className="text-red-700 font-semibold">ระบบการให้คะแนนปิดอยู่ในขณะนี้</p>
            </div>
          )}
        </div>

        {/* Contestant Info */}
        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-800">
              ผู้เข้าแข่งขันคนที่ {currentContestantIndex + 1} จาก {contestants.length}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentContestantIndex(Math.max(0, currentContestantIndex - 1))}
                disabled={currentContestantIndex === 0}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg disabled:opacity-50 hover:bg-gray-600"
              >
                ก่อนหน้า
              </button>
              <button
                onClick={() => setCurrentContestantIndex(Math.min(contestants.length - 1, currentContestantIndex + 1))}
                disabled={currentContestantIndex === contestants.length - 1}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg disabled:opacity-50 hover:bg-gray-600"
              >
                ถัดไป
              </button>
            </div>
          </div>
          
          <div className="text-xl text-gray-700">
            <p><span className="font-semibold">ชื่อ:</span> {currentContestant.name}</p>
            <p><span className="font-semibold">หมายเลข:</span> {currentContestant.number}</p>
          </div>

          {isSubmittedForCurrentContestant && (
            <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg">
              <p className="text-green-700 font-semibold">✅ คุณได้ให้คะแนนผู้เข้าแข่งขันคนนี้แล้ว</p>
            </div>
          )}
        </div>

        {/* Scoring Section */}
        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
          <h3 className="text-xl font-semibold mb-6 text-gray-800">การให้คะแนน</h3>
          
          {categories.map(category => (
            <div key={category.key} className="mb-8">
              <h4 className="text-lg font-medium mb-3 text-gray-700">
                {category.label} (คะแนนเต็ม {category.maxScore})
              </h4>
              <div className="flex flex-wrap gap-2">
                {Array.from({length: category.maxScore + 1}, (_, i) => i).map(scoreValue => (
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

          {/* Keep Status Section */}
          <div className="bg-blue-50 p-5 rounded-xl shadow-md border border-blue-200 mb-8">
            <h3 className="text-xl font-semibold mb-3 text-blue-800">การคัดเลือกเข้ารอบ</h3>
            <div className="flex justify-center gap-8">
              <button
                onClick={() => handleKeepStatusClick('keep')}
                className={`px-8 py-4 font-bold text-xl rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105
                  ${keepStatus === 'keep' ? 'bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}
                  ${isSubmittedForCurrentContestant || !isJudgingOpen ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                disabled={isSubmittedForCurrentContestant || !isJudgingOpen}
              >
                ✅ เก็บเข้ารอบ
              </button>
              <button
                onClick={() => handleKeepStatusClick('eliminate')}
                className={`px-8 py-4 font-bold text-xl rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105
                  ${keepStatus === 'eliminate' ? 'bg-red-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}
                  ${isSubmittedForCurrentContestant || !isJudgingOpen ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                disabled={isSubmittedForCurrentContestant || !isJudgingOpen}
              >
                ❌ ตัดออก
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-center">
            <button
              onClick={handleSubmitScore}
              disabled={isSubmittedForCurrentContestant || !isJudgingOpen}
              className={`px-12 py-4 text-xl font-bold rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105
                ${isSubmittedForCurrentContestant || !isJudgingOpen 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }
              `}
            >
              {isSubmittedForCurrentContestant ? 'บันทึกแล้ว' : 'บันทึกคะแนน'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Admin Panel Component
function AdminPanel() {
  const [contestants, setContestants] = useState([]);
  const [judges, setJudges] = useState([]);
  const [results, setResults] = useState([]);
  const [isJudgingOpen, setIsJudgingOpen] = useState(false);
  const [newContestantName, setNewContestantName] = useState('');
  const [newContestantNumber, setNewContestantNumber] = useState('');
  const [newJudgeEmail, setNewJudgeEmail] = useState('');
  const [newJudgeName, setNewJudgeName] = useState('');
  const [loading, setLoading] = useState(false);
  const { db, showMessage, setView } = useContext(FirebaseContext);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([
      loadContestants(),
      loadJudges(),
      loadResults(),
      checkJudgingStatus()
    ]);
  };

  const loadContestants = async () => {
    try {
      const contestantsRef = collection(db, `artifacts/${CANVAS_APP_ID}/contestants`);
      const snapshot = await getDocs(contestantsRef);
      const contestantsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContestants(contestantsList);
    } catch (error) {
      showMessage('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้เข้าแข่งขัน');
    }
  };

  const loadJudges = async () => {
    try {
      const judgesRef = query(
        collection(db, `artifacts/${CANVAS_APP_ID}/users`),
        where('role', '==', 'judge')
      );
      const snapshot = await getDocs(judgesRef);
      const judgesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setJudges(judgesList);
    } catch (error) {
      showMessage('เกิดข้อผิดพลาดในการโหลดข้อมูลกรรมการ');
    }
  };

  const loadResults = async () => {
    try {
      const contestantsRef = collection(db, `artifacts/${CANVAS_APP_ID}/contestants`);
      const contestantsSnapshot = await getDocs(contestantsRef);
      const results = {};

      contestantsSnapshot.docs.forEach(doc => {
        const contestantData = doc.data();
        results[doc.id] = {
          id: doc.id,
          name: contestantData.name,
          number: contestantData.number,
          personalitySum: 0,
          walkingSum: 0,
          attireSum: 0,
          languageSum: 0,
          overallSum: 0,
          totalScoreSum: 0,
          submittedJudgesCount: 0,
          judgeScores: {},
          averageScore: 0,
          keepCount: 0,
          eliminateCount: 0
        };
      });

      const allJudgesRef = query(
        collection(db, `artifacts/${CANVAS_APP_ID}/users`),
        where('role', '==', 'judge')
      );
      const allJudgesSnapshot = await getDocs(allJudgesRef);

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
              personality: scoreData.personality,
              walking: scoreData.walking,
              attire: scoreData.attire,
              language: scoreData.language,
              overall: scoreData.overall,
              keepStatus: scoreData.keepStatus || '',
            };

            if (scoreData.keepStatus === 'keep') {
              results[contestantId].keepCount++;
            } else if (scoreData.keepStatus === 'eliminate') {
              results[contestantId].eliminateCount++;
            }
          }
        });
      }

      Object.keys(results).forEach(contestantId => {
        const contestantResult = results[contestantId];
        if (contestantResult.submittedJudgesCount > 0) {
          contestantResult.averageScore = contestantResult.totalScoreSum / contestantResult.submittedJudgesCount;
        }
      });

      const sortedResults = Object.values(results).sort((a, b) => b.averageScore - a.averageScore);
      setResults(sortedResults);
    } catch (error) {
      showMessage('เกิดข้อผิดพลาดในการโหลดผลคะแนน');
    }
  };

  const checkJudgingStatus = async () => {
    try {
      const statusDoc = await getDoc(doc(db, `artifacts/${CANVAS_APP_ID}/settings`, 'judging'));
      if (statusDoc.exists()) {
        setIsJudgingOpen(statusDoc.data().open || false);
      }
    } catch (error) {
      console.error('Error checking judging status:', error);
    }
  };

  const handleAddContestant = async () => {
    if (!newContestantName.trim() || !newContestantNumber.trim()) {
      showMessage('กรุณากรอกชื่อและหมายเลขผู้เข้าแข่งขัน');
      return;
    }

    setLoading(true);
    try {
      await setDoc(doc(db, `artifacts/${CANVAS_APP_ID}/contestants`, newContestantNumber), {
        name: newContestantName.trim(),
        number: newContestantNumber.trim(),
        createdAt: new Date()
      });

      setNewContestantName('');
      setNewContestantNumber('');
      showMessage('เพิ่มผู้เข้าแข่งขันเรียบร้อยแล้ว');
      await loadContestants();
    } catch (error) {
      showMessage('เกิดข้อผิดพลาดในการเพิ่มผู้เข้าแข่งขัน: ' + error.message);
    }
    setLoading(false);
  };

  const handleAddJudge = async () => {
    if (!newJudgeEmail.trim() || !newJudgeName.trim()) {
      showMessage('กรุณากรอกอีเมลและชื่อกรรมการ');
      return;
    }

    setLoading(true);
    try {
      // Create a unique ID for the judge (you might want to use the actual auth UID)
      const judgeId = newJudgeEmail.replace(/[^a-zA-Z0-9]/g, '');
      await setDoc(doc(db, `artifacts/${CANVAS_APP_ID}/users`, judgeId), {
        email: newJudgeEmail.trim(),
        name: newJudgeName.trim(),
        role: 'judge',
        createdAt: new Date()
      });

      setNewJudgeEmail('');
      setNewJudgeName('');
      showMessage('เพิ่มกรรมการเรียบร้อยแล้ว');
      await loadJudges();
    } catch (error) {
      showMessage('เกิดข้อผิดพลาดในการเพิ่มกรรมการ: ' + error.message);
    }
    setLoading(false);
  };

  const handleToggleJudging = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, `artifacts/${CANVAS_APP_ID}/settings`, 'judging'), {
        open: !isJudgingOpen,
        updatedAt: new Date()
      });

      setIsJudgingOpen(!isJudgingOpen);
      showMessage(isJudgingOpen ? 'ปิดระบบการให้คะแนนแล้ว' : 'เปิดระบบการให้คะแนนแล้ว');
    } catch (error) {
      showMessage('เกิดข้อผิดพลาดในการเปลี่ยนสถานะระบบ');
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">Admin Panel</h1>
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200 font-medium"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>

        {/* Judging Control */}
        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">การควบคุมระบบให้คะแนน</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={handleToggleJudging}
              disabled={loading}
              className={`px-8 py-4 text-lg font-bold rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed
                ${isJudgingOpen 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
                }
              `}
            >
              {loading ? 'กำลังดำเนินการ...' : (isJudgingOpen ? '🔴 ปิดระบบให้คะแนน' : '🟢 เปิดระบบให้คะแนน')}
            </button>
            <div className={`px-4 py-2 rounded-lg font-medium
              ${isJudgingOpen 
                ? 'bg-green-100 text-green-800 border border-green-300' 
                : 'bg-red-100 text-red-800 border border-red-300'
              }
            `}>
              สถานะ: {isJudgingOpen ? 'เปิดให้คะแนน' : 'ปิดให้คะแนน'}
            </div>
          </div>
        </div>

        {/* Add Contestant Section */}
        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">เพิ่มผู้เข้าแข่งขัน</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="ชื่อผู้เข้าแข่งขัน"
              value={newContestantName}
              onChange={(e) => setNewContestantName(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="หมายเลขผู้เข้าแข่งขัน"
              value={newContestantNumber}
              onChange={(e) => setNewContestantNumber(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAddContestant}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'กำลังเพิ่ม...' : 'เพิ่มผู้เข้าแข่งขัน'}
            </button>
          </div>
        </div>

        {/* Add Judge Section */}
        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">เพิ่มกรรมการ</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="email"
              placeholder="อีเมลกรรมการ"
              value={newJudgeEmail}
              onChange={(e) => setNewJudgeEmail(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="ชื่อกรรมการ"
              value={newJudgeName}
              onChange={(e) => setNewJudgeName(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAddJudge}
              disabled={loading}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'กำลังเพิ่ม...' : 'เพิ่มกรรมการ'}
            </button>
          </div>
        </div>

        {/* Contestants List */}
        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">รายชื่อผู้เข้าแข่งขัน ({contestants.length} คน)</h2>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">หมายเลข</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ชื่อ</th>
                </tr>
              </thead>
              <tbody>
                {contestants.map((contestant, index) => (
                  <tr key={contestant.id} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="px-4 py-3 text-sm text-gray-900">{contestant.number}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{contestant.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Judges List */}
        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">รายชื่อกรรมการ ({judges.length} คน)</h2>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ชื่อ</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">อีเมล</th>
                </tr>
              </thead>
              <tbody>
                {judges.map((judge, index) => (
                  <tr key={judge.id} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="px-4 py-3 text-sm text-gray-900">{judge.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{judge.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Results Section */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-800">ผลคะแนน</h2>
            <button
              onClick={loadResults}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 font-medium"
            >
              🔄 รีเฟรชข้อมูล
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">อันดับ</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">หมายเลข</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ชื่อ</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">คะแนนเฉลี่ย</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">กรรมการที่ให้คะแนน</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">เก็บเข้ารอบ</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">ตัดออก</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr key={result.id} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50`}>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{index + 1}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{result.number}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{result.name}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-blue-600">
                      {result.averageScore.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-900">
                      {result.submittedJudgesCount}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">
                        {result.keepCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full font-medium">
                        {result.eliminateCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main App Component
export default function ContestScoringApp() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('login');
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [message, setMessage] = useState('');
  const [videoPlayingState, setVideoPlayingState] = useState(false);
  const [showSummaryScreen, setShowSummaryScreen] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setUserId(user.uid);
        
        try {
          const userDoc = await getDoc(doc(db, `artifacts/${CANVAS_APP_ID}/users`, user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setLoggedInUser({ uid: user.uid, email: user.email, role: userData.role, name: userData.name });
            setView(userData.role === 'admin' ? 'admin' : 'judge');
          } else {
            setView('login');
            setLoggedInUser(null);
            setUserId(null);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          setView('login');
          setLoggedInUser(null);
          setUserId(null);
        }
      } else {
        setView('login');
        setLoggedInUser(null);
        setUserId(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const localShowMessage = (msg) => {
    setMessage(msg);
  };

  const localCloseMessageModal = () => {
    setMessage('');
  };

  const toggleVideoPlaying = () => {
    setVideoPlayingState(!videoPlayingState);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-2xl font-semibold text-gray-700">กำลังโหลดแอปพลิเคชัน...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-700 p-4 font-inter">
        <div className="text-center">
          <p className="text-lg mb-2">เกิดข้อผิดพลาดในการโหลด Firebase: {error}</p>
          <p className="text-sm">โปรดตรวจสอบการตั้งค่า Firebase และกฎความปลอดภัย</p>
        </div>
      </div>
    );
  }

  const firebaseContextValue = {
    db,
    auth,
    storage,
    userId,
    showMessage: localShowMessage,
    closeMessageModal: localCloseMessageModal,
    loggedInUser,
    setLoggedInUser,
    setView,
    toggleVideoPlaying,
    videoPlayingState,
    showSummaryScreen,
    setShowSummaryScreen,
    videoRef
  };

  return (
    <FirebaseContext.Provider value={firebaseContextValue}>
      <div className="min-h-screen flex flex-col font-inter bg-gray-100">
        {view === 'login' && <LoginPanel />}
        {view === 'judge' && loggedInUser?.role === 'judge' && <JudgePanel />}
        {view === 'admin' && loggedInUser?.role === 'admin' && <AdminPanel />}
        
        <MessageModal message={message} onClose={localCloseMessageModal} />
      </div>
    </FirebaseContext.Provider>
  );
}
