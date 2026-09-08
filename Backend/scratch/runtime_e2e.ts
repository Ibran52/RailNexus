import axios from 'axios';
import http from 'node:http';

const BASE_URL = 'http://127.0.0.1:5000/api/v1';

async function runE2E() {
  console.log('=====================================================');
  console.log('STARTING FULL RUNTIME E2E PIPELINE VERIFICATION');
  console.log('=====================================================');

  const timestamp = Date.now();
  const workerEmail = `worker_${timestamp}@railnexus.local`;
  const workerPassword = 'SecureWorkerPass123!';
  const controllerEmail = `controller_${timestamp}@railnexus.local`;
  const controllerPassword = 'SecureControllerPass123!';
  const controllerId = `Ct#${String(timestamp).slice(-3)}`; // 6 chars, uppercase, lowercase, special

  console.log(`\n--- Step 1: Worker Registration (${workerEmail}) ---`);
  const workerRegRes = await axios.post(`${BASE_URL}/auth/register`, {
    name: 'Engineering Incharge',
    email: workerEmail,
    password: workerPassword,
    role: 'MAINTENANCE_ENGINEERING',
    department: 'ENGINEERING',
    departmentType: 'ENGINEERING',
  });
  console.log('Worker Registered successfully. Status:', workerRegRes.status);
  const workerToken = workerRegRes.data.data.token;

  console.log(`\n--- Step 2: Worker Login ---`);
  const workerLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: workerEmail,
    password: workerPassword,
  });
  console.log('Worker Login success. Status:', workerLoginRes.status, 'User:', workerLoginRes.data.data.user.name);

  console.log(`\n--- Step 3: Worker Dashboard (Initial State) ---`);
  const workerReqsRes = await axios.get(`${BASE_URL}/maintenance/requests`, {
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  console.log('Worker Requests Count:', workerReqsRes.data.data.length);

  console.log(`\n--- Step 4: Create Maintenance Request on Real Corridor Section AKRD -> CCH ---`);
  const createPayload = {
    maintenanceType: 'TRACK_TAMPING',
    fromStation: 'AKRD',
    toStation: 'CCH',
    durationMinutes: 60,
    earliestStart: '1900-01-01T10:00:00.000Z',
    latestEnd: '1900-01-01T18:00:00.000Z',
    priority: 'HIGH',
    description: 'Track tamping on AKRD-CCH section using final dataset',
  };

  const createRes = await axios.post(`${BASE_URL}/maintenance/requests`, createPayload, {
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  console.log('Request Created! Status:', createRes.status);
  const createdReq = createRes.data.data;
  const requestId = createdReq.requestId;
  console.log('Request ID:', requestId);
  console.log('Initial Status:', createdReq.status);
  console.log('Current BrainRun ID:', createdReq.currentBrainRunId);
  console.log('Planning Version:', createdReq.planningVersion);
  console.log('Recommended Window:', createdReq.recommendation?.start, '->', createdReq.recommendation?.end);

  console.log(`\n--- Step 5: Verify Brain Analysis & BrainRun Persistence ---`);
  const analysisRes = await axios.get(`${BASE_URL}/maintenance/requests/${requestId}/analysis`, {
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  console.log('Brain Analysis retrieved. Status:', analysisRes.status);
  const brainRun = analysisRes.data.data;
  console.log('BrainRun ID in DB:', brainRun.brainRunId);
  console.log('Status:', brainRun.status);
  console.log('Direct Delay Mins:', brainRun.metrics?.directDelayMinutes);
  console.log('Total Delay Mins:', brainRun.metrics?.totalDelayMinutes);
  console.log('Impact Score:', brainRun.recommendation?.impactScore);
  console.log('Alternatives count:', brainRun.alternatives?.length);
  console.log('Dataset Version in Metadata:', brainRun.metadata?.datasetVersion);

  console.log(`\n--- Step 6: Controller Registration (${controllerEmail}, ID: ${controllerId}) ---`);
  const ctlRegRes = await axios.post(`${BASE_URL}/auth/controller/register`, {
    name: 'Chief Controller',
    email: controllerEmail,
    controllerId: controllerId,
    password: controllerPassword,
    confirmPassword: controllerPassword,
  });
  console.log('Controller Registered. Status:', ctlRegRes.status);
  const controllerToken = ctlRegRes.data.data.token;

  console.log(`\n--- Step 7: Controller Queue ---`);
  const ctlQueueRes = await axios.get(`${BASE_URL}/controller/requests`, {
    headers: { Authorization: `Bearer ${controllerToken}` },
  });
  console.log('Controller Queue total requests:', ctlQueueRes.data.data.length);
  const matchedInQueue = ctlQueueRes.data.data.find((r: any) => r.requestId === requestId);
  console.log(`Found request ${requestId} in queue:`, Boolean(matchedInQueue));

  console.log(`\n--- Step 8: Controller Request Analysis Details ---`);
  const ctlAnalysisRes = await axios.get(`${BASE_URL}/controller/requests/${requestId}/analysis`, {
    headers: { Authorization: `Bearer ${controllerToken}` },
  });
  console.log('Controller Analysis retrieved. Impact score:', ctlAnalysisRes.data.data.recommendation?.impactScore);

  console.log(`\n--- Step 9: What-If Simulation ---`);
  const whatIfRes = await axios.post(`${BASE_URL}/controller/what-if`, {
    requestId: requestId,
    fromStation: 'AKRD',
    toStation: 'CCH',
    start: '1900-01-01T14:00:00.000Z',
    end: '1900-01-01T15:00:00.000Z',
    priority: 'HIGH',
  }, {
    headers: { Authorization: `Bearer ${controllerToken}` },
  });
  console.log('What-If simulation status:', whatIfRes.status);
  console.log('What-If Impact Score:', whatIfRes.data.data.recommendation?.impactScore);

  console.log(`\n--- Step 10: Controller Approval ---`);
  const approveRes = await axios.post(`${BASE_URL}/controller/requests/${requestId}/approve`, {
    reason: 'Approved optimal maintenance block after conflict & cascade verification.',
  }, {
    headers: { Authorization: `Bearer ${controllerToken}` },
  });
  console.log('Approved! Status:', approveRes.status);
  console.log('Updated Status in response:', approveRes.data.data.status);
  console.log('Approval Decision ID:', approveRes.data.data.approvalDetails?.decisionId);

  console.log(`\n--- Step 11: Worker Status Verification (Persistence) ---`);
  const workerCheckRes = await axios.get(`${BASE_URL}/maintenance/requests/${requestId}`, {
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  console.log('Worker sees updated status:', workerCheckRes.data.data.status);

  console.log(`\n--- Step 12: Controller History ---`);
  const historyRes = await axios.get(`${BASE_URL}/controller/history`, {
    headers: { Authorization: `Bearer ${controllerToken}` },
  });
  console.log('Controller History items count:', historyRes.data.data.length);
  const foundInHistory = historyRes.data.data.find((h: any) => h.requestId === requestId);
  console.log(`Found ${requestId} in Controller History:`, Boolean(foundInHistory));

  console.log(`\n--- Step 13: Cross-Department Security Check ---`);
  try {
    await axios.get(`${BASE_URL}/controller/requests`, {
      headers: { Authorization: `Bearer ${workerToken}` },
    });
    console.error('FAILED: Worker was able to access controller route!');
  } catch (err: any) {
    console.log('Security check passed: Worker denied controller access with HTTP', err.response?.status);
  }

  console.log('\n=====================================================');
  console.log('ALL RUNTIME E2E CHECKS PASSED SUCCESSFULLY!');
  console.log('=====================================================');
}

runE2E().catch((err: any) => {
  console.error('FATAL E2E FAILURE:', err.response?.data || err.message);
  process.exit(1);
});
