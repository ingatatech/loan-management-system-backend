

import type { Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import dbConnection from "../db";
import { OtherInformationService } from "../services/otherInformationService";
import type { AuthenticatedRequest } from "../middleware/auth";
import { Borrowing } from "../entities/Borrowing";
import { Loan } from "../entities/Loan";
import { User } from "../entities/User";
import { BoardDirector } from "../entities/BoardDirector";
import { IndividualShareholder } from "../entities/IndividualShareholder";
import { InstitutionShareholder } from "../entities/InstitutionShareholder";
import { SupplementaryInformationService } from "../services/supplementaryInformationService";
import { BorrowerProfile } from "../entities/BorrowerProfile";
import { LoanClassification } from "../entities/LoanClassification";
export class OtherInformationController {
  private otherInformationService: OtherInformationService;
  private supplementaryInfoService: SupplementaryInformationService;
  constructor() {
    this.otherInformationService = new OtherInformationService(
      dbConnection.getRepository(Borrowing),
      dbConnection.getRepository(Loan),
      dbConnection.getRepository(User),
      dbConnection.getRepository(BoardDirector),
      dbConnection.getRepository(IndividualShareholder),
      dbConnection.getRepository(InstitutionShareholder)
    )
    this.supplementaryInfoService = new SupplementaryInformationService(
    dbConnection.getRepository(Loan),
    dbConnection.getRepository(BorrowerProfile),
    dbConnection.getRepository(LoanClassification)
  )
  }

  /**
   * Get other information for organization
   * GET /api/organizations/:organizationId/other-information
   */
  getOtherInformation = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array()
        });
        return;
      }

      // Parse and validate organizationId
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      // Check if user has access to this organization
      if (req.user?.organizationId !== organizationId && req.user?.role !== 'system_owner') {
        res.status(403).json({
          success: false,
          message: "You do not have permission to access this organization's data"
        });
        return;
      }

      // Fetch other information
      const result = await this.otherInformationService.getOtherInformation(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error('Get other information controller error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching other information",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  getSupplementaryInformation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    console.log('=== GET SUPPLEMENTARY INFORMATION CONTROLLER START ===');
    
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array()
      });
      return;
    }

    // Parse and validate organizationId
    const organizationId = parseInt(req.params.organizationId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID"
      });
      return;
    }

    // Check if user has access to this organization
    if (req.user?.organizationId !== organizationId && req.user?.role !== 'system_owner') {
      res.status(403).json({
        success: false,
        message: "You do not have permission to access this organization's data"
      });
      return;
    }

    console.log('Fetching supplementary information for organization:', organizationId);

    // Fetch supplementary information
    const result = await this.supplementaryInfoService.getSupplementaryInformation(organizationId);

    console.log('Supplementary information result:', {
      success: result.success,
      hasData: !!result.data,
      quarter: result.data?.reportPeriod?.quarter
    });

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
    
    console.log('=== GET SUPPLEMENTARY INFORMATION CONTROLLER END ===');
  } catch (error: any) {
    console.error('Get supplementary information controller error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching supplementary information",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

}