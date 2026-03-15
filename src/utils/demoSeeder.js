import { writeBatch, doc, collection, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase_config'; 
import { faker } from '@faker-js/faker';

export const resetAndSeedDemo = async () => {
  console.log("Starting Comprehensive Demo Wipe & Seed...");
  const now = Timestamp.now();
  const pastDate = (days) => Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  
  let batches = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;

  const commitBatches = async () => {
    if (opCount > 0) batches.push(currentBatch.commit());
    await Promise.all(batches);
    batches = [];
    currentBatch = writeBatch(db);
    opCount = 0;
  };

  const safeSet = (ref, data) => {
    currentBatch.set(ref, data);
    opCount++;
    if (opCount >= 450) {
      batches.push(currentBatch.commit());
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  };

  const safeDelete = (ref) => {
    currentBatch.delete(ref);
    opCount++;
    if (opCount >= 450) {
      batches.push(currentBatch.commit());
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  };

  // --- 1. WIPE EVERYTHING ---
  const collectionsToClear = [
    'archive', 'assets', 'audit_logs', 'authorized_users', 'blending_access', 
    'blending_production', 'blending_queue', 'blending_samples', 'client_access', 
    'client_roles', 'client_samples', 'client_settings', 'clients', 'config', 
    'config_routing', 'crm_contacts', 'crm_deals', 'employees', 'five_s_audits', 
    'global_active_workers', 'inventory', 'ipads', 'issue_reports', 'keys', 'lines', 
    'lockers', 'machine_access', 'machine_setup_reports', 'downtime_reports', 'master_admin_access', 
    'production_access', 'production_pipeline', 'project_queue', 'qc_access', 
    'qc_settings', 'reports', 'reviews', 'roles', 'schedules', 'security_logs', 
    'settings', 'shed_access', 'shed_inventory_v1', 'shipment_access', 'shipments', 
    'tech_access', 'users', 'wifi_access', 'workers'
  ];
  
  for (const collPath of collectionsToClear) {
      try {
          const snap = await getDocs(collection(db, collPath));
          snap.forEach(d => safeDelete(d.ref));
      } catch (e) { console.warn(`Skipping wipe for ${collPath}`); }
  }
  await commitBatches(); 

  const getRef = (path) => doc(collection(db, path));

  // --- 2. GLOBAL CONFIGURATIONS (Fixes Org Chart, 5S Audits, Financials) ---
  
  // Org Chart & General HR Settings
  safeSet(doc(db, 'settings', 'global_options'), { 
      departments: ['Production', 'Warehouse', 'Quality Control', 'Blending', 'Admin'], 
      departmentManagers: { 'Production': 'TOP_LEVEL', 'Warehouse': 'TOP_LEVEL' } 
  });

  // Financial Report Settings
  safeSet(doc(db, 'config', 'finance'), { 
      costPerHour: 25.50, 
      agents: [{ name: 'Sarah Sales', comm: 5 }, { name: 'Mike Market', comm: 7 }] 
  });
  
  // Production Dropdowns
  safeSet(doc(db, 'config', 'project_options'), {
      companies: ['Acme Corp', 'Globex', 'Soylent', 'Initech'],
      categories: ['Assembly', 'Liquid Fill', 'Powder Fill', 'Labeling'],
      sizes: ['1oz', '4oz', '8oz', '16oz', '1 Gallon']
  });

  // 5S Audit Configuration
  safeSet(doc(db, 'qc_settings', 'five_s_config'), {
      alertThreshold: 3,
      categories: [
          { name: 'Sort (Seiri)', minScore: 1, maxScore: 5, questions: ['Are unneeded items removed from the workspace?', 'Are aisles and walkways clear?'] },
          { name: 'Set In Order (Seiton)', minScore: 1, maxScore: 5, questions: ['Are tools properly labeled and in their designated places?'] }
      ]
  });

  // 5S Audit Owners
  safeSet(doc(db, 'qc_settings', 'owners'), {
      list: [{ name: 'Jane Supervisor', email: 'jane@makeusa.us' }, { name: 'Bob Lead', email: 'bob@makeusa.us' }]
  });

  // --- 3. CORE INFRASTRUCTURE & HR ---
  const lineIds = [];
  for (let i = 1; i <= 5; i++) {
    const ref = getRef('lines');
    lineIds.push({ id: ref.id, name: `Line ${i}` });
    safeSet(ref, { name: `Line ${i}`, status: 'Operational' });
  }

  const workerData = [];
  for (let i = 0; i < 15; i++) {
    const cardId = faker.string.numeric(6);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const empRef = getRef('employees');
    
    // Detailed HR Data for Org Chart and Detail Views
    safeSet(empRef, { 
        name: `${firstName} ${lastName}`, 
        firstName, 
        lastName, 
        email: faker.internet.email(), 
        department: faker.helpers.arrayElement(['Production', 'Warehouse', 'Quality Control']), 
        status: 'Active', 
        type: 'Hourly', 
        cardId: cardId,
        managerId: 'TOP_LEVEL', // Makes them show up correctly on the Org Chart Root
        startDate: pastDate(faker.number.int({min: 30, max: 1000})).toDate().toISOString().split('T')[0],
        compensation: `$${faker.number.int({min: 15, max: 35})}.00/hr`,
        payRate: faker.number.int({min: 15, max: 35})
    });
    safeSet(doc(db, 'workers', cardId), { name: `${firstName} ${lastName}`, active: true, pin: faker.string.numeric(4), employeeDocId: empRef.id });
    workerData.push({ id: cardId, name: `${firstName} ${lastName}`, empId: empRef.id });

    // HR Assets, Keys, Lockers, Reviews
    safeSet(getRef('assets'), { type: 'Tablet', serialId: `TAB-${faker.string.alphanumeric(6).toUpperCase()}`, assignedTo: `${firstName} ${lastName}`, dateIssued: pastDate(10) });
    safeSet(getRef('keys'), { keyNumber: `K-${faker.number.int({min:100, max:999})}`, assignedTo: `${firstName} ${lastName}`, doorAccess: 'Main Floor' });
    safeSet(getRef('lockers'), { lockerNumber: `${i+1}A`, assignedTo: `${firstName} ${lastName}`, combination: faker.string.numeric(4) });
    
    // Performance Reviews
    if (i % 3 === 0) {
        safeSet(getRef('reviews'), { 
            employeeId: empRef.id, employeeName: `${firstName} ${lastName}`, reviewer: 'Admin', score: faker.number.int({min:3, max:5}), 
            status: 'Completed', notes: 'Great performance this quarter.', date: pastDate(5) 
        });
    }
  }

  // --- 4. PRODUCTION PIPELINE (Fixing the stages) ---
  
  // A. "Waiting for Components" (production status, componentsArrived: false)
  for (let i = 0; i < 3; i++) {
      safeSet(getRef('production_pipeline'), { 
          company: 'Acme Corp', project: `Acme New Build ${i}`, category: 'Assembly', size: '8oz', quantity: 5000,
          status: 'production', componentsArrived: false, techSheetUploaded: false, requiresBlending: false, createdAt: pastDate(1)
      });
  }

  // B. "In Production / Ready" (componentsArrived: true)
  for (let i = 0; i < 3; i++) {
      safeSet(getRef('production_pipeline'), { 
          company: 'Globex', project: `Globex Run ${i}`, category: 'Liquid Fill', size: '16oz', quantity: 2500,
          status: 'production', componentsArrived: true, techSheetUploaded: true, requiresBlending: true, blendingStatus: 'completed', createdAt: pastDate(2)
      });
  }

  // C. "QC Pending" (Sent to QC)
  for (let i = 0; i < 3; i++) {
      safeSet(getRef('production_pipeline'), { 
          company: 'Soylent', project: `Soylent Green ${i}`, category: 'Powder Fill', size: '1 Gallon', quantity: 1000,
          status: 'qc_pending', componentsArrived: true, techSheetUploaded: true, sentToQcAt: pastDate(1)
      });
  }

  // --- 5. FINANCIAL REPORTS & IPAD FINISHED PROJECTS ---
  // To populate FinancialReport.jsx
  for (let i = 0; i < 6; i++) {
      safeSet(getRef('reports'), { 
          company: faker.helpers.arrayElement(['Acme Corp', 'Globex', 'Initech']),
          project: `Finished Run ${i}`,
          projectType: 'Assembly',
          leader: workerData[i].name,
          agentName: 'Sarah Sales',
          financeStatus: 'complete',
          completedAt: pastDate(i),
          originalSeconds: faker.number.int({min: 36000, max: 72000}), // Est time
          finalSeconds: faker.number.int({min: 20000, max: 35000}), // Actual time (creates profit margin)
          totalUnits: faker.number.int({min: 1000, max: 5000}),
          invoiceAmount: faker.number.int({min: 2000, max: 10000}),
          commissionExcluded: 0
      });
  }

  // --- 6. SHIPMENT BILLING HISTORY ---
  // To populate PastBills.jsx
  for (let i = 0; i < 5; i++) {
      safeSet(getRef('shipments'), { 
          vendor: faker.company.name(), 
          carrier: 'FedEx', 
          trackingNumber: `1Z${faker.string.alphanumeric(10).toUpperCase()}`,
          shippingCost: faker.number.float({ min: 50, max: 500, fractionDigits: 2 }),
          dutiesAmount: faker.number.float({ min: 10, max: 100, fractionDigits: 2 }),
          status: 'Billed', 
          billedDate: pastDate(i), 
          billedBy: 'Demo Admin',
          billingInvoiceNumber: `INV-${faker.string.numeric(5)}`
      });
  }

  // --- 7. MACHINES & QC ---
  for (let i = 0; i < 4; i++) {
      // Setup Reports
      safeSet(getRef('machine_setup_reports'), { 
          line: lineIds[0].name, machine: 'Filler A', technician: workerData[i].name, status: 'Completed', verified: true, date: pastDate(i) 
      });
      // Downtime Reports
      safeSet(getRef('downtime_reports'), { 
          line: lineIds[1].name, machine: 'Capper B', minutes: faker.number.int({min: 15, max: 120}), reason: 'Jammed belt', reportedBy: workerData[i+1].name, date: pastDate(i) 
      });
      
      // Actual 5S Audits
      safeSet(getRef('five_s_audits'), {
          status: 'submitted',
          timestamp: pastDate(i),
          results: {
              "0-0": { points: "4", action: "Looks good" },
              "0-1": { points: "2", action: "Aisle blocked by pallets", owner: "jane@makeusa.us", dueDate: pastDate(-2).toDate().toISOString().split('T')[0] },
              "1-0": { points: "5", action: "Perfect" }
          }
      });
  }

  // --- 8. LOGS ---
  for (let i = 0; i < 10; i++) {
      safeSet(getRef('audit_logs'), { action: 'Updated Record', user: 'Admin', timestamp: pastDate(i) });
      safeSet(getRef('security_logs'), { event: 'Login Success', ip: '192.168.1.1', timestamp: pastDate(i) });
  }

  // --- 9. CLIENTS ---
  for (let i = 0; i < 5; i++) {
      safeSet(getRef('clients'), { 
          name: faker.company.name(), 
          contact: faker.person.fullName(), 
          emails: faker.internet.email(), 
          phones: faker.phone.number(), 
          status: 'Active', 
          isActive: true 
      });
  }

// --- 10. ACCESS, CONFIG & SYSTEM COLLECTIONS ---
  const demoEmail = 'demo@makeusa.us';
  const accessModules = [
    'blending_access', 'client_access', 'machine_access', 'master_admin_access', 
    'production_access', 'qc_access', 'shed_access', 'shipment_access', 
    'tech_access', 'wifi_access', 'authorized_users'
  ];

  accessModules.forEach(module => {
      safeSet(doc(db, module, demoEmail), { 
          enabled: true, 
          // Sets role to 'Admin' for shipments, 'admin' for everything else
          role: module === 'shipment_access' ? 'Admin' : 'admin', 
          email: demoEmail, 
          lastUpdated: now 
      });
  });

  safeSet(doc(db, 'users', demoEmail), { role: 'admin', email: demoEmail, allowPassword: true, name: 'Demo Admin' });
  
  // Roles
  safeSet(doc(db, 'roles', 'admin'), { name: 'Administrator', permissions: ['all'] });
  safeSet(doc(db, 'client_roles', 'standard_client'), { name: 'Standard Client', maxSamples: 5 });

  // Settings & Config
  safeSet(doc(db, 'config', 'general'), { maintenanceMode: false, currentVersion: 'v2.1.0' });
  safeSet(doc(db, 'config_routing', 'paths'), { defaultHome: '/dashboard', fallback: '/404' });
  safeSet(doc(db, 'client_settings', 'default'), { portalTheme: 'light', allowSampleRequests: true });
  safeSet(doc(db, 'qc_settings', 'thresholds'), { minPh: 6.5, maxPh: 7.5, allowOverrides: false });
  safeSet(doc(db, 'settings', 'global'), { companyName: 'Make USA LLC', timezone: 'America/New_York' });

  // Final flush of remaining writes
  await commitBatches();
  console.log("Comprehensive Demo Environment successfully seeded!");
};