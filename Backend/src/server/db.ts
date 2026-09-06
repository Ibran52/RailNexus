import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoMemoryServer: MongoMemoryServer | null = null;

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI;

  if (uri && uri.trim() !== '') {
    try {
      console.log('Attempting to connect to MongoDB via MONGO_URI...');
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('Connected to MongoDB via MONGO_URI');
      return;
    } catch (error: any) {
      console.warn(`Failed to connect to MONGO_URI (${error.message}). Falling back to in-memory MongoMemoryServer...`);
    }
  }

  try {
    console.log('Starting in-memory MongoDB instance...');
    mongoMemoryServer = await MongoMemoryServer.create();
    const mongoUri = mongoMemoryServer.getUri();
    await mongoose.connect(mongoUri);
    console.log(`Connected to in-memory MongoDB at ${mongoUri}`);
  } catch (memError) {
    console.error('Critical: Failed to start in-memory MongoDB instance:', memError);
  }
}

export async function closeDB(): Promise<void> {
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
}
