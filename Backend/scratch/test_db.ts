import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/railnexus';
console.log('Testing connection to:', uri.replace(/:[^:@]+@/, ':***@'));

async function main() {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('Successfully connected to MongoDB!');
    console.log('Database name:', mongoose.connection.name);
    await mongoose.disconnect();
    console.log('Disconnected cleanly.');
  } catch (err: any) {
    console.error('MongoDB Atlas connection failed:', err.message);
    console.log('Falling back to test local MongoDB at 127.0.0.1:27017...');
    try {
      await mongoose.connect('mongodb://127.0.0.1:27017/railnexus', { serverSelectionTimeoutMS: 3000 });
      console.log('Successfully connected to local MongoDB!');
      await mongoose.disconnect();
    } catch (localErr: any) {
      console.error('Local connection failed:', localErr.message);
    }
  }
}

main();
