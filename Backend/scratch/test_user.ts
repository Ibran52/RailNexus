import mongoose from 'mongoose';
import { User } from '../src/server/models/User';

async function test() {
  console.log('Connecting...');
  await mongoose.connect('mongodb://127.0.0.1:27017/railnexus');
  console.log('Connected! Querying User.findOne...');
  const u = await User.findOne({});
  console.log('User query finished. Found:', u ? u.email : 'None');
  await mongoose.disconnect();
  console.log('Done!');
}
test().catch(err => console.error('Error in test:', err));
