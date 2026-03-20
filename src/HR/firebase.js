// src/HR/firebase.js
import { db, auth, provider } from '../firebase_config';

// Re-export using the names the HR app expects
export { db, auth, provider as googleProvider };