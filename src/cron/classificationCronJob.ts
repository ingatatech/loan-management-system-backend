
import cron from 'node-cron';
import { DailyClassificationUpdateService } from '../services/dailyClassificationUpdateService';


export function startClassificationCronJob() {
  cron.schedule('0 2 * * *', async () => {

    try {
      await DailyClassificationUpdateService.runDailyUpdate();
    } catch (error: any) {
      // console.error('✗ Daily classification update failed:', error);
    }
  });

}