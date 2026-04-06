import { writeBatch, doc, collection, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase_config'; 
import { faker } from '@faker-js/faker';

export const resetAndSeedDemo = async () => {
  console.log("Starting the Ultimate Demo Wipe & Seed...");
  const now = Timestamp.now();
  const pastDate = (days) => Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const futureDate = (days) => Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
  
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

  // --- 2. CONFIG, SETTINGS & ROLES ---
  safeSet(doc(db, 'settings', 'global_options'), { departments: ['Production', 'Warehouse', 'Quality Control', 'Blending', 'Admin', 'Sales', 'Maintenance'], departmentManagers: { 'Production': 'TOP_LEVEL', 'Warehouse': 'TOP_LEVEL', 'Quality Control': 'TOP_LEVEL' } });
  safeSet(doc(db, 'config', 'finance'), { costPerHour: 25.50, agents: [{ name: 'Sarah Sales', comm: 5 }, { name: 'Mike Market', comm: 7 }, { name: 'Unassigned', comm: 0 }] });
  safeSet(doc(db, 'config', 'project_options'), { companies: ['Acme Corp', 'Globex', 'Soylent', 'Initech', 'Umbrella Corp'], categories: ['Assembly', 'Liquid Fill', 'Powder Fill', 'Labeling', 'Kitting'], sizes: ['1oz', '4oz', '8oz', '16oz', '32oz', '1 Gallon', 'Tote'] });
  safeSet(doc(db, 'qc_settings', 'five_s_config'), { alertThreshold: 3, categories: [{ name: 'Sort (Seiri)', minScore: 1, maxScore: 5, questions: ['Unneeded items removed?', 'Aisles clear?'] }, { name: 'Set In Order (Seiton)', minScore: 1, maxScore: 5, questions: ['Tools labeled and in place?'] }]});
  safeSet(doc(db, 'config_routing', 'paths'), { defaultHome: '/dashboard', fallback: '/404' });
  safeSet(doc(db, 'client_settings', 'default'), { portalTheme: 'light', allowSampleRequests: true });
  safeSet(doc(db, 'qc_settings', 'thresholds'), { minPh: 6.5, maxPh: 7.5, allowOverrides: false });
  safeSet(doc(db, 'settings', 'global'), { companyName: 'Make USA LLC', timezone: 'America/New_York' });
  safeSet(doc(db, 'roles', 'admin'), { name: 'Administrator', permissions: ['all'] });
  safeSet(doc(db, 'client_roles', 'standard_client'), { name: 'Standard Client', maxSamples: 5 });

  // --- 3. CLIENTS, CRM & CLIENT SAMPLES ---
  const clients = [];
  for (let i = 0; i < 5; i++) {
      const clientName = faker.company.name();
      clients.push(clientName);
      const cId = getRef('clients').id;
      safeSet(doc(db, 'clients', cId), { name: clientName, contact: faker.person.fullName(), emails: faker.internet.email(), phones: faker.phone.number(), status: 'Active', isActive: true });
      safeSet(getRef('crm_contacts'), { clientId: cId, name: faker.person.fullName(), role: 'Buyer', email: faker.internet.email() });
      safeSet(getRef('crm_deals'), { clientName: clientName, value: faker.number.int({min: 5000, max: 150000}), stage: faker.helpers.arrayElement(['Lead', 'Qualified', 'Proposal', 'Won', 'Lost']), probability: faker.number.int({min: 10, max: 100}), agent: faker.helpers.arrayElement(['Sarah Sales', 'Mike Market']), expectedCloseDate: futureDate(faker.number.int({min: 5, max: 60})) });
      // Client Samples
      safeSet(getRef('client_samples'), { clientName: clientName, product: `${clientName} Custom Blend`, status: faker.helpers.arrayElement(['Requested', 'In Lab', 'Shipped', 'Approved', 'Rejected']), requestedDate: pastDate(faker.number.int({min: 1, max: 30})), trackingInfo: `1Z${faker.string.alphanumeric(10).toUpperCase()}` });
  }

  // --- 4. HR, EMPLOYEES & WORKFORCE ---
  const workerData = [];
  const lineIds = [];
  for (let i = 1; i <= 5; i++) {
      const ref = getRef('lines');
      lineIds.push({ id: ref.id, name: `Line ${i}` });
      safeSet(ref, { name: `Line ${i}`, status: faker.helpers.arrayElement(['Operational', 'Maintenance', 'Down']) });
  }

  for (let i = 0; i < 15; i++) {
    const cardId = faker.string.numeric(6);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const empRef = getRef('employees');
    
    safeSet(empRef, { name: `${firstName} ${lastName}`, firstName, lastName, email: faker.internet.email(), department: faker.helpers.arrayElement(['Production', 'Warehouse', 'Quality Control', 'Blending', 'Admin']), status: faker.helpers.arrayElement(['Active', 'Active', 'Active', 'On Leave', 'Terminated']), type: i % 4 === 0 ? 'Salary' : 'Hourly', cardId: cardId, managerId: i % 5 === 0 ? 'TOP_LEVEL' : 'SomeManagerID', startDate: pastDate(faker.number.int({min: 30, max: 2000})).toDate().toISOString().split('T')[0], payRate: faker.number.int({min: 15, max: 40}) });
    safeSet(doc(db, 'workers', cardId), { name: `${firstName} ${lastName}`, active: true, pin: faker.string.numeric(4), employeeDocId: empRef.id });
    workerData.push({ id: cardId, name: `${firstName} ${lastName}` });

    // Global Active Workers (For kiosks)
    if (i < 5) safeSet(doc(db, 'global_active_workers', cardId), { name: `${firstName} ${lastName}`, clockedInAt: now, currentLine: lineIds[i%5].name });
    
    // HR Extras
    safeSet(getRef('assets'), { type: faker.helpers.arrayElement(['Tablet', 'Radio', 'Laptop']), serialId: `AST-${faker.string.alphanumeric(6).toUpperCase()}`, assignedTo: `${firstName} ${lastName}`, dateIssued: pastDate(faker.number.int({min: 1, max: 100})) });
    safeSet(getRef('keys'), { keyNumber: `K-${faker.number.int({min:100, max:999})}`, assignedTo: `${firstName} ${lastName}`, doorAccess: faker.helpers.arrayElement(['Main Floor', 'Warehouse', 'Server Room']) });
    safeSet(getRef('lockers'), { lockerNumber: `${i+1}${faker.helpers.arrayElement(['A','B','C'])}`, assignedTo: `${firstName} ${lastName}`, combination: faker.string.numeric(4) });
    safeSet(getRef('reviews'), { employeeId: empRef.id, employeeName: `${firstName} ${lastName}`, reviewer: 'Admin', score: faker.number.int({min:1, max:5}), status: 'Completed', notes: 'Routine review.', date: pastDate(faker.number.int({min:5, max:90})) });
    
    // Schedules
    for(let d=0; d<3; d++) {
        safeSet(getRef('schedules'), { employeeName: `${firstName} ${lastName}`, employeeId: empRef.id, date: futureDate(d).toDate().toISOString().split('T')[0], shift: faker.helpers.arrayElement(['1st Shift (6AM-2PM)', '2nd Shift (2PM-10PM)']), department: 'Production' });
    }
  }

  // Tablets / iPads Tracking
  for(let i=0; i<3; i++) {
      safeSet(getRef('ipads'), { deviceId: `IPAD-${i+1}`, location: lineIds[i].name, batteryLevel: faker.number.int({min: 20, max: 100}), lastPing: now });
  }

  // Issue Reports
  for(let i=0; i<4; i++) {
      safeSet(getRef('issue_reports'), { type: faker.helpers.arrayElement(['Safety Hazard', 'Machine Breakdown', 'Facility Maintenance']), description: faker.lorem.sentence(), priority: faker.helpers.arrayElement(['Low', 'Medium', 'High', 'Critical']), status: faker.helpers.arrayElement(['Open', 'In Progress', 'Resolved']), reportedBy: workerData[i].name, date: pastDate(i) });
  }

  // --- 5. PRODUCTION, BLENDING & QC ---
  // Project Queue (Incoming pre-pipeline)
  for(let i=0; i<3; i++) {
      safeSet(getRef('project_queue'), { client: clients[i], requestedCategory: 'Assembly', targetQuantity: faker.number.int({min: 5000, max: 50000}), status: 'Pending Review', submittedAt: pastDate(i) });
  }

  // Production Pipeline Exhaustive
  const prodStatuses = ['planning', 'waiting_components', 'ready', 'production', 'qc_pending', 'qc_failed', 'completed', 'canceled'];
  prodStatuses.forEach((status, i) => {
      safeSet(getRef('production_pipeline'), { company: faker.helpers.arrayElement(clients), project: `Project ${status.toUpperCase()} ${i}`, category: 'Liquid Fill', size: '16oz', quantity: faker.number.int({min: 500, max: 20000}), status: status, componentsArrived: faker.datatype.boolean(), techSheetUploaded: true, requiresBlending: true, createdAt: pastDate(30 - i) });
  });

  // Exhaustive Blending Data
  const blendStatuses = ['queued', 'measuring', 'mixing', 'testing', 'approved', 'rejected'];
  blendStatuses.forEach((status) => {
      const formulaId = `FORM-${faker.string.alphanumeric(4).toUpperCase()}`;
      // Queue
      safeSet(getRef('blending_queue'), { formulaId, client: faker.helpers.arrayElement(clients), targetGallons: faker.number.int({min: 50, max: 1000}), status: status, assignedTech: workerData[0].name, createdAt: pastDate(2) });
      // Production Track
      if (['mixing', 'testing', 'approved'].includes(status)) {
          safeSet(getRef('blending_production'), { formulaId, batchNumber: `BAT-${faker.string.numeric(5)}`, currentStep: faker.number.int({min: 1, max: 5}), totalSteps: 5, status: status, startedAt: pastDate(1) });
      }
      // R&D Samples
      safeSet(getRef('blending_samples'), { formulaId, purpose: 'Client Match', technician: workerData[1].name, phLevel: faker.number.float({min: 5.5, max: 8.5}), viscosity: 'Medium', status: faker.helpers.arrayElement(['In Testing', 'Completed']), date: pastDate(i) });
  });

  // Machine Logs & Audits
  for (let i = 0; i < 6; i++) {
      safeSet(getRef('machine_setup_reports'), { line: faker.helpers.arrayElement(lineIds).name, machine: faker.helpers.arrayElement(['Filler', 'Capper', 'Labeler']), technician: workerData[i].name, status: 'Completed', verified: true, date: pastDate(i) });
      safeSet(getRef('downtime_reports'), { line: faker.helpers.arrayElement(lineIds).name, machine: 'Capper', minutes: faker.number.int({min: 15, max: 240}), reason: faker.helpers.arrayElement(['Jammed belt', 'No air pressure', 'Sensor failure']), reportedBy: workerData[i].name, date: pastDate(i) });
      safeSet(getRef('five_s_audits'), { status: 'submitted', timestamp: pastDate(i), line: faker.helpers.arrayElement(lineIds).name, results: { "0-0": { points: "4" }, "0-1": { points: "2", action: "Blocked path", owner: "admin@makeusa.us" } } });
  }

  // --- 6. WAREHOUSE, SHED & INVENTORY ---
  const invTypes = ['Raw Material', 'Packaging', 'Finished Good'];
  invTypes.forEach(type => {
      safeSet(getRef('inventory'), { sku: `SKU-${faker.string.numeric(5)}`, name: `${type} Normal`, type: type, quantity: faker.number.int({min: 1000, max: 5000}), reorderLevel: 500, location: 'Warehouse A' });
      safeSet(getRef('inventory'), { sku: `SKU-${faker.string.numeric(5)}`, name: `${type} Low`, type: type, quantity: faker.number.int({min: 10, max: 400}), reorderLevel: 500, location: 'Warehouse B' });
      safeSet(getRef('inventory'), { sku: `SKU-${faker.string.numeric(5)}`, name: `${type} OOS`, type: type, quantity: 0, reorderLevel: 200, location: 'Warehouse C' });
  });
  
  // Shed Inventory
  for(let i=0; i<5; i++) {
      safeSet(getRef('shed_inventory_v1'), { itemCode: `SHED-${faker.string.numeric(4)}`, description: faker.helpers.arrayElement(['Empty Totes', 'Pallets', 'Drums', 'Cleaning Chems']), quantity: faker.number.int({min: 5, max: 100}), lastChecked: pastDate(i) });
  }

  // --- 7. SHIPMENTS, BILLING & FINANCIAL REPORTS ---
  const shipStatuses = ['Pending', 'In Transit', 'Delivered', 'Billed', 'Cancelled'];
  shipStatuses.forEach((status, i) => {
      safeSet(getRef('shipments'), { vendor: faker.company.name(), carrier: faker.helpers.arrayElement(['FedEx', 'UPS', 'USPS', 'Freight']), trackingNumber: `1Z${faker.string.alphanumeric(10).toUpperCase()}`, shippingCost: faker.number.float({ min: 50, max: 1500, fractionDigits: 2 }), status: status, shippedDate: status !== 'Pending' ? pastDate(faker.number.int({min: 1, max: 10})) : null, billedDate: status === 'Billed' ? pastDate(1) : null, billedBy: status === 'Billed' ? 'Demo Admin' : null, billingInvoiceNumber: status === 'Billed' ? `INV-${faker.string.numeric(5)}` : null });
  });

  for (let i = 0; i < 6; i++) {
      safeSet(getRef('reports'), { company: faker.helpers.arrayElement(clients), project: `Finished Run ${i}`, projectType: 'Assembly', leader: faker.helpers.arrayElement(workerData).name, agentName: faker.helpers.arrayElement(['Sarah Sales', 'Mike Market']), financeStatus: i % 2 === 0 ? 'complete' : 'pending', completedAt: pastDate(i), totalUnits: faker.number.int({min: 1000, max: 5000}), invoiceAmount: faker.number.int({min: 2000, max: 10000}) });
  }

  // --- 8. ARCHIVE, WIFI & SYSTEM LOGS ---
  for (let i = 0; i < 8; i++) {
      safeSet(getRef('archive'), { originalCollection: 'production_pipeline', documentName: `Old Project ${i}`, purgedAt: pastDate(i), purgedBy: 'System' });
      safeSet(getRef('audit_logs'), { action: faker.helpers.arrayElement(['Created Item', 'Deleted Record', 'Updated Status']), module: faker.helpers.arrayElement(['Inventory', 'HR', 'Production']), user: 'Admin', timestamp: pastDate(i) });
      safeSet(getRef('security_logs'), { event: faker.helpers.arrayElement(['Login Success', 'Failed Password', 'Password Reset']), ip: faker.internet.ipv4(), userEmail: 'demo@makeusa.us', timestamp: pastDate(i) });
  }

  // --- 9. SECURITY CLEARANCES & ACCESS ---
  // We setup personas to test different access levels across the app
  const personas = [
      { email: 'demo@makeusa.us', name: 'Master Admin', role: 'admin', modules: ['blending_access', 'client_access', 'machine_access', 'master_admin_access', 'production_access', 'qc_access', 'shed_access', 'shipment_access', 'tech_access', 'wifi_access', 'authorized_users'] },
      { email: 'sales@makeusa.us', name: 'Sales Agent', role: 'sales', modules: ['client_access', 'authorized_users'] },
      { email: 'tech@makeusa.us', name: 'Floor Tech', role: 'tech', modules: ['machine_access', 'tech_access', 'qc_access', 'authorized_users'] }
  ];

  personas.forEach(persona => {
      safeSet(doc(db, 'users', persona.email), { role: persona.role, email: persona.email, allowPassword: true, name: persona.name });
      persona.modules.forEach(module => {
          safeSet(doc(db, module, persona.email), { enabled: true, role: persona.role, email: persona.email, lastUpdated: now });
      });
  });
  
  // Final flush of remaining writes
  await commitBatches();
  console.log("Ultimate Demo Environment successfully seeded. All sub-modules populated.");
};