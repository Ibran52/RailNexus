import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | null = null;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_jwt_secret_for_railnexus_unit_and_integration_tests_32chars';
  process.env.BRAIN_SERVICE_URL = 'http://127.0.0.1:8000';
  process.env.MONGOMS_STARTUP_TIMEOUT = '60000';

  try {
    mongod = await MongoMemoryServer.create({
      instance: {
        launchTimeout: 60000,
      },
    });
    const uri = mongod.getUri();
    process.env.MONGO_URI = uri;
    await mongoose.connect(uri);
  } catch (err: any) {
    console.error('FATAL: MongoMemoryServer failed to initialize for test suite:', err);
    throw new Error(
      `Test setup failed: MongoMemoryServer unavailable. Silent fallback to local MongoDB is prohibited. Cause: ${err?.message}`
    );
  }
}, 60000);

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
});
