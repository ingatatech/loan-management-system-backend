
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { ActualMoneyService } from "../services/actualMoneyService";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    organizationId: number | null;
    username: string;
    email: string;
  };
  organizationId?: number;
}

class ActualMoneyController {
  private actualMoneyService: ActualMoneyService;

  constructor() {
    this.actualMoneyService = new ActualMoneyService();
  }

  /**
   * GET /api/organizations/:organizationId/actual-money
   * Calculate actual money available in the banking system
   */
  getActualMoney = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }


      const result = await this.actualMoneyService.calculateActualMoney(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while calculating actual money",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * POST /api/organizations/:organizationId/actual-money/validate-disbursement
   * Validate if a specific loan amount can be disbursed
   */
  validateDisbursement = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const { requestedAmount } = req.body;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!requestedAmount || requestedAmount <= 0) {
        res.status(400).json({
          success: false,
          message: "Requested amount must be greater than zero",
        });
        return;
      }


      const result = await this.actualMoneyService.canDisburseLoan(
        organizationId, 
        requestedAmount
      );

      if (result.success) {
        const statusCode = result.data?.canDisburse ? 200 : 400;
        res.status(statusCode).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while validating disbursement",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new ActualMoneyController();
