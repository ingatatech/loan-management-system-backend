import app from "./app"
import dbConnection from "./db"
import dotenv from "dotenv"
import repaymentReminderService from "./cron/repaymentReminderService"

// Load environment variables
dotenv.config()

const PORT = process.env.PORT || 5000

async function startServer() {
  try {
    // Initialize database connection
    if (!dbConnection.isInitialized) {
      await dbConnection.initialize();
    }

    // Initialize SMS reminder cron jobs
    repaymentReminderService.initializeCronJobs();

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📚 API Documentation available at http://localhost:${PORT}/api`);
      console.log(`🏥 Health check available at http://localhost:${PORT}/api/health`);
      console.log(`📱 SMS Reminders: ACTIVE`);
      console.log(`   - 7-day reminders: Daily at 9:00 AM`);
      console.log(`   - 3-day reminders: Daily at 9:00 AM`);
      console.log(`   - 1-day reminders: Daily at 5:00 PM`);
      console.log(`   - Overdue reminders: Daily at 10:00 AM`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  
  if (dbConnection.isInitialized) {
    await dbConnection.destroy();
    console.log('✅ Database connection closed');
  }

  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log('👋 SIGINT received, shutting down gracefully...');
  
  if (dbConnection.isInitialized) {
    await dbConnection.destroy();
    console.log('✅ Database connection closed');
  }

  process.exit(0);
});

// Start the server
startServer();