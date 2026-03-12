import { collection, addDoc } from "firebase/firestore";
import { db, auth } from "../firebase"; 

// A utility to automatically compare two objects and return only the changed fields
export const getChangesDiff = (oldData, newData) => {
  const changes = {};
  const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

  allKeys.forEach(key => {
    const oldVal = JSON.stringify(oldData?.[key]);
    const newVal = JSON.stringify(newData?.[key]);

    if (oldVal !== newVal) {
      changes[key] = {
        from: oldData?.[key] ?? null,
        to: newData?.[key] ?? null
      };
    }
  });

  return changes;
};

// 1. General Audit Log (Who did what, and exactly what changed)
export const logAudit = async (action, target, details = "", changes = null) => {
  try {
    const user = auth.currentUser;
    const email = user ? user.email : "System/Unknown";
    const uid = user ? user.uid : "unknown";

    await addDoc(collection(db, "audit_logs"), {
      timestamp: new Date(),
      actor: email,      
      actorId: uid,
      action: action,    
      target: target,    
      details: details,
      changes: changes   // <--- Added payload for exact data tracking
    });
    console.log(`✅ Logged: ${action}`);
  } catch (error) {
    console.error("❌ Log Error:", error);
  }
};

// 2. Security Log (Failed Logins)
export const logFailedLogin = async (emailAttempted) => {
  try {
    await addDoc(collection(db, "security_logs"), {
      timestamp: new Date(),
      type: "FAILED_LOGIN",
      emailAttempted: emailAttempted,
      details: "Invalid password or user not found"
    });
    console.log(`⚠️ Security Log: Failed login for ${emailAttempted}`);
  } catch (error) {
    console.error("❌ Security Log Error:", error);
  }
};