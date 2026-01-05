import app from "./app"
import  dbConnection from "./db"
import dotenv from "dotenv"
import { startClassificationCronJob } from './cron/classificationCronJob';
// Load environment variables
dotenv.config()

const PORT = process.env.PORT || 5000

async function startServer() {
  try {
    // Initialize database connection
    if (!dbConnection.isInitialized) {
      await dbConnection.initialize();
    }

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📚 API Documentation available at http://localhost:${PORT}/api`);
      console.log(`🏥 Health check available at http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    process.exit(1);
  }
}
// Start the classification cron job
startClassificationCronJob();
// Handle graceful shutdown
process.on("SIGTERM", async () => {

  if (dbConnection.isInitialized) {
    await dbConnection.destroy()
  }

  process.exit(0)
})

process.on("SIGINT", async () => {

  if (dbConnection.isInitialized) {
    await dbConnection.destroy()
  }

  process.exit(0)
})

// Start the server
startServer()
