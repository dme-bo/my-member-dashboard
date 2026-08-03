// import { initializeApp } from "firebase/app";
// import { getFirestore } from "firebase/firestore";

// // const firebaseConfig = {
// //   apiKey: "YOUR_API_KEY",
// //   authDomain: "YOUR_PROJECT.firebaseapp.com",
// //   projectId: "YOUR_PROJECT_ID",
// //   storageBucket: "YOUR_PROJECT.appspot.com",
// //   messagingSenderId: "YOUR_SENDER_ID",
// //   appId: "YOUR_APP_ID"
// // };

// // For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//   apiKey: "AIzaSyDUDgc9Jzg8RhiJ7jAQGSCI9piAi8gBVSw",
//   authDomain: "briskoliveresourcemangement.firebaseapp.com",
//   projectId: "briskoliveresourcemangement",
//   storageBucket: "briskoliveresourcemangement.appspot.com",
//   messagingSenderId: "136082985440",
//   appId: "1:136082985440:web:adb0b6ea5a87ceb51adb85"
// //   measurementId: "G-D9W2HNJCB6"
// };



// // // Initialize Firebase
// // const app = initializeApp(firebaseConfig);
// // export const db = getFirestore(app);

// export const app = initializeApp(firebaseConfig);

// // Optional: export auth and firestore too
// export const auth = getAuth(app);
// export const db = getFirestore(app);


// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDUDgc9Jzg8RhiJ7jAQGSCI9piAi8gBVSw",
  authDomain: "briskoliveresourcemangement.firebaseapp.com",
  projectId: "briskoliveresourcemangement",
  storageBucket: "briskoliveresourcemangement.appspot.com",
  messagingSenderId: "136082985440",
  appId: "1:136082985440:web:adb0b6ea5a87ceb51adb85",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Persist reads to IndexedDB so repeat visits (and page navigation within a
// session) can show the ~12k-member "users" collection instantly from cache
// while Firestore quietly syncs any changes in the background, instead of
// re-fetching the entire collection over the network every time.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Optional: export app itself if some files need it
export { app };

// You can also export it as default if you prefer
export default app;
