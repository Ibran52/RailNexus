import supertest from 'supertest';
import app from '../src/server/app';
import { connectDB, disconnectDB } from '../src/server/db/mongo';

async function main() {
  console.log('Connecting DB...');
  await connectDB();
  console.log('DB connected! Testing supertest against /api/v1/auth/register...');

  const timestamp = Date.now();
  const workerEmail = `worker_${timestamp}@test.local`;
  const res = await supertest(app)
    .post('/api/v1/auth/register')
    .send({
      name: 'Direct Worker',
      email: workerEmail,
      password: 'Password123!',
      role: 'MAINTENANCE_ENGINEERING',
      department: 'ENGINEERING',
      departmentType: 'ENGINEERING',
    });

  console.log('Register Response Status:', res.status);
  console.log('Register Response Body:', res.body);

  await disconnectDB();
  console.log('Done direct test!');
}

main().catch(err => {
  console.error('Direct test failed:', err);
  process.exit(1);
});
