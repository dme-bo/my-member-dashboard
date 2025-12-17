import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// const firebaseConfig = {
//   apiKey: "YOUR_API_KEY",
//   authDomain: "YOUR_PROJECT.firebaseapp.com",
//   projectId: "YOUR_PROJECT_ID",
//   storageBucket: "YOUR_PROJECT.appspot.com",
//   messagingSenderId: "YOUR_SENDER_ID",
//   appId: "YOUR_APP_ID"
// };

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDUDgc9Jzg8RhiJ7jAQGSCI9piAi8gBVSw",
  authDomain: "briskoliveresourcemangement.firebaseapp.com",
  projectId: "briskoliveresourcemangement",
  storageBucket: "briskoliveresourcemangement.appspot.com",
  messagingSenderId: "136082985440",
  appId: "1:136082985440:web:adb0b6ea5a87ceb51adb85"
//   measurementId: "G-D9W2HNJCB6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);