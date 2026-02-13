import { Router } from "express";
import { Request, Response } from "express";
import repaymentReminderService from "../cron/repaymentReminderService";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);



router.get("/test-reminders", async (req: Request, res: Response) => {
  try {
    console.log('🧪 Manual reminder test triggered');
    
    const stats = await repaymentReminderService.triggerManualReminder();

    res.status(200).json({
      success: true,
      message: "Reminder check completed successfully",
      data: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error in manual reminder test:', error);
    
    res.status(500).json({
      success: false,
      message: "Failed to execute reminder check",
      error: error.message
    });
  }
});


router.get("/reminder-stats", async (req: Request, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);

    // This would query the RepaymentReminder table for statistics
    // For now, returning placeholder data
    
    res.status(200).json({
      success: true,
      message: "Reminder statistics retrieved successfully",
      data: {
        totalRemindersSent: 0,
        last24Hours: 0,
        last7Days: 0,
        last30Days: 0,
        byType: {
          sevenDay: 0,
          threeDay: 0,
          oneDay: 0,
          overdue: 0
        },
        deliveryStatus: {
          sent: 0,
          failed: 0,
          delivered: 0
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching reminder stats:', error);
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch reminder statistics",
      error: error.message
    });
  }
});

export default router;