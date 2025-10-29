// testQueue.js
import { handlePlayCommand } from './queue.js';

// Fake Discord-like interaction objects
const mockUser1 = { user: { id: '111', username: 'PlayerOne' }, reply: console.log };
const mockUser2 = { user: { id: '222', username: 'PlayerTwo' }, reply: console.log };

// Simulate /play commands
await handlePlayCommand(mockUser1);
await handlePlayCommand(mockUser2);
