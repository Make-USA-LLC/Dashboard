import { collection, addDoc } from "firebase/firestore";
import { db, auth } from "../firebase"; 

// 1. General Audit Log (Who did what)
export const logAudit = async (action, target, details = "") => {
  try {
    const user = auth.currentUser;
    const email = user ? user.email : "System/Unknown";
    const uid = user ? user.uid : "unknown";

    await addDoc(collection(db, "audit_logs"), {
      timestamp: new Date(),
      actor: email,      
      actorId: uid,
      action: action,    // e.g., "Created Key"
      target: target,    // e.g., "Master Key A"
      details: details   // e.g., "Assigned to John Doe"
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