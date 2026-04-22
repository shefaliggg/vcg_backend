require('dotenv').config();
const connectDB = require('./config/db');
const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const Booking = require('./models/Booking');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    const server = http.createServer(app);
    const corsOptions = app.get('corsOptions') || { origin: '*' };
    const io = new Server(server, {
      cors: corsOptions,
    });
    app.set('io',io)



    require('./controllers/socket.controller')(io);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
      console.log(`Accessible via http://localhost:${PORT}`);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();
