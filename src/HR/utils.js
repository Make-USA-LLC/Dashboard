export const HOURLY_LEAVE_TYPES = ["Sick", "Emergency", "No Show", "Vacation"];

export const calculateSalaryBenefits = (hireDateSeconds, sickCarryover = 0) => {
  if (!hireDateSeconds) return { ptoAllowance: 0, sickAllowance: 0 };
  
  const hireDate = new Date(hireDateSeconds * 1000);
  const now = new Date();
  const currentYear = now.getFullYear();
  const startOfYear = new Date(currentYear, 0, 1); // Jan 1st of current year

  // --- PTO CALCULATION (Daily Accrual) ---
  // Rate: 15 days / 365 days = 0.0410958904109589
  const dailyRate = 15 / 365; 

  // Determine "Day of the Year" for accrual
  // If they were hired BEFORE this year, they accrue from Jan 1st.
  // If they were hired THIS year, they accrue from their Hire Date.
  let accrualStartDate = startOfYear;
  if (hireDate > startOfYear) {
      accrualStartDate = hireDate;
  }

  // Calculate days passed between Start Date and Today
  const diffTime = now - accrualStartDate;
  // Convert milliseconds to days (ensure it doesn't go negative)
  const daysAccrued = Math.max(0, diffTime / (1000 * 60 * 60 * 24));

  const ptoAllowance = daysAccrued * dailyRate;

  // --- SICK CALCULATION (Front-Loaded Bucket) ---
  // Rule: 5 days given on Jan 1st + Carryover (Max 10 total)
  let sickAllowance = 5;
  
  // Optional: If you want to prorate sick days for new hires, uncomment below.
  // Currently, it gives the full 5 days immediately upon hire.
  // if (hireDate > startOfYear) { ... }

  let totalSick = sickAllowance + parseFloat(sickCarryover || 0);
  if (totalSick > 10) totalSick = 10; // Hard cap

  return {
    ptoAllowance: parseFloat(ptoAllowance.toFixed(4)), // High precision for display
    sickAllowance: parseFloat(totalSick.toFixed(2))
  };
};