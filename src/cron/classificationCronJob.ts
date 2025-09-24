
import cron from 'node-cron';
import { DailyClassificationUpdateService } from '../services/dailyClassificationUpdateService';


export function startClassificationCronJob() {
  cron.schedule('0 2 * * *', async () => {
    console.log('\n🕐 Cron Job: Daily Classification Update Triggered');
    console.log('Time:', new Date().toISOString());

    try {
      await DailyClassificationUpdateService.runDailyUpdate();
      console.log('✓ Daily classification update completed successfully');
    } catch (error: any) {
      console.error('✗ Daily classification update failed:', error);
    }
  });

  console.log('✓ Classification cron job scheduled (Daily at 2:00 AM)');
}