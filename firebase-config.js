// Firebase Configuration
// Replace these values with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyC-KkJ8msrHeL5QQg3ssBeE0hlQD0xHYPc",
  authDomain: "prodicity-sales.firebaseapp.com",
  projectId: "prodicity-sales",
  storageBucket: "prodicity-sales.firebasestorage.app",
  messagingSenderId: "483698240203",
  appId: "1:483698240203:web:23306478e68c791da0094e",
  measurementId: "G-NKVX9VGPCP",
};

// Export for use in other files
if (typeof module !== "undefined" && module.exports) {
  module.exports = firebaseConfig;
} else {
  window.firebaseConfig = firebaseConfig;
}
