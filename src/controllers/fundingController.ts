// @ts-nocheck
import { ShareCapitalRequest } from "../interfaces/funding.interface";

import type { Response, NextFunction } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../db";
import { Borrowing } from "../entities/Borrowing"
import { GrantedFunds } from "../entities/GrantedFunds"
import { OperationalFunds } from "../entities/OperationalFunds"
import { Organization } from "../entities/Organization"
import { FundingService } from "../services/fundingService"
import type { AuthenticatedRequest } from "../middleware/auth"
import { ShareCapital } from "../entities/ShareCapital";
import { IndividualShareholder } from "../entities/IndividualShareholder";
import { InstitutionShareholder } from "../entities/InstitutionShareholder";
export class FundingController {
  private fundingService: FundingService

  constructor() {
    this.fundingService = new FundingService(
      dbConnection.getRepository(Borrowing),
      dbConnection.getRepository(GrantedFunds),
      dbConnection.getRepository(OperationalFunds),
      dbConnection.getRepository(ShareCapital),
      dbConnection.getRepository(Organization),
      dbConnection.getRepository(IndividualShareholder),
      dbConnection.getRepository(InstitutionShareholder),
    )
  }

  updateOperationalFundsAmount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const operationalId = Number.parseInt(id);
      const updateData = req.body;


      // Get user info for history tracking
      const performedBy = req.user?.id;
      const performedByName = req.user?.name || req.user?.username || 'System';

      const result = await this.fundingService.updateOperationalFundsAmount(
        operationalId,
        updateData,
        performedBy,
        performedByName
      );


      res.status(200).json({
        success: true,
        message: `Operational funds ${updateData.type} recorded successfully`,
        data: result,
      });
    } catch (error: any) {

      let statusCode = 500;
      let errorMessage = error.message || "Failed to update operational funds";

      if (error.message.includes("not found")) {
        statusCode = 404;
        errorMessage = "Operational fund record not found";
      } else if (error.message.includes("must be positive")) {
        statusCode = 400;
      } else if (error.message.includes("cannot exceed")) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage
      });
    }
  }

  getOperationalHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const operationalId = Number.parseInt(id);

      const history = await this.fundingService.getOperationalHistory(operationalId);

      res.status(200).json({
        success: true,
        data: history,
      });
    } catch (error: any) {

      let statusCode = 500;
      let errorMessage = error.message || "Failed to get operational history";

      if (error.message.includes("not found")) {
        statusCode = 404;
        errorMessage = "Operational fund record not found";
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage
      });
    }
  }

  recordBorrowingRepayment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {

      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const borrowingId = Number.parseInt(id);

      // Extract repayments array from the request body
      const { repayments } = req.body;


      if (!repayments || !Array.isArray(repayments)) {
        return res.status(400).json({
          success: false,
          message: "repayments must be an array",
          errors: [{ message: "repayments must be an array" }]
        });
      }

      if (repayments.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one repayment is required",
          errors: [{ message: "At least one repayment is required" }]
        });
      }

      // Validate each repayment has required fields and proper values
      for (let i = 0; i < repayments.length; i++) {
        const repayment = repayments[i];

        // Check for required fields
        const missingFields = [];
        if (!repayment.amount || repayment.amount === "") missingFields.push("amount");
        if (!repayment.paymentDate) missingFields.push("paymentDate");
        if (!repayment.interestAmount) missingFields.push("interestAmount");
        if (!repayment.paymentMethod) missingFields.push("paymentMethod");
        if (!repayment.paymentReference) missingFields.push("paymentReference");

        if (missingFields.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Repayment ${i + 1}: Missing required fields: ${missingFields.join(", ")}`,
            errors: [{ message: `Repayment ${i + 1}: Missing required fields: ${missingFields.join(", ")}` }]
          });
        }

        // Validate amount is a valid number
        const amount = parseFloat(repayment.amount);
        if (isNaN(amount) || amount <= 0) {
          return res.status(400).json({
            success: false,
            message: `Repayment ${i + 1}: Amount must be a positive number`,
            errors: [{ message: `Repayment ${i + 1}: Amount must be a positive number` }]
          });
        }

        // Round to 2 decimal places to avoid floating point issues
        const roundedAmount = parseFloat(amount.toFixed(2));
        if (Math.abs(amount - roundedAmount) > 0.001) {
          return res.status(400).json({
            success: false,
            message: `Repayment ${i + 1}: Amount should have at most 2 decimal places`,
            errors: [{ message: `Repayment ${i + 1}: Amount should have at most 2 decimal places` }]
          });
        }

        // Update repayment amount with rounded value
        repayments[i].amount = roundedAmount.toString();
      }


      const result = await this.fundingService.recordBorrowingRepayment(borrowingId, repayments);

      res.status(200).json({
        success: true,
        message: "Repayment(s) recorded successfully",
        data: result,
      });

    } catch (error: any) {

      // Provide specific error messages
      let statusCode = 500;
      let errorMessage = error.message || "Failed to record repayment";

      if (error.message.includes("not found")) {
        statusCode = 404;
        errorMessage = "Borrowing record not found";
      } else if (error.message.includes("exceeds remaining principal")) {
        statusCode = 400;
      } else if (error.message.includes("Invalid repayment amount")) {
        statusCode = 400;
      } else if (error.message.includes("required")) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage
      });
    }
  }

  recordBorrowing = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const organizationId = req.user!.organizationId!
      const borrowingData = req.body

      const borrowing = await this.fundingService.recordBorrowing(borrowingData, organizationId)

      res.status(201).json({
        success: true,
        message: "Borrowing recorded successfully",
        data: borrowing,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to record borrowing",
      })
    }
  }

  recordGrantedFunds = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {


      const errors = validationResult(req)
      if (!errors.isEmpty()) {
  
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      // Step 2: Get organization ID
      const organizationId = req.user!.organizationId!
      if (!organizationId) {
        
        return res.status(400).json({
          success: false,
          message: "Organization ID is required",
        });
      }

      const grantData = req.body;



      const grantedFunds = await this.fundingService.recordGrantedFunds(grantData, organizationId);

      // Step 5: Send response
      res.status(201).json({
        success: true,
        message: "Granted funds recorded successfully",
        data: grantedFunds,
      })

    } catch (error: any) {


      let errorMessage = "Failed to record granted funds";
      let statusCode = 500;

      if (error.message.includes("invalid input syntax for type date")) {
        errorMessage = "Invalid date format provided. Please check all date fields.";
        statusCode = 400;
      } else if (error.message.includes("Organization not found")) {
        errorMessage = "Organization not found";
        statusCode = 404;
      } else if (error.message.includes("is required and cannot be empty")) {
        errorMessage = error.message;
        statusCode = 400;
      } else if (error.message.includes("Invalid date format")) {
        errorMessage = error.message;
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        debug: {
          originalError: error.message,
          timestamp: new Date().toISOString(),
        }
      });
    }
  }

recordOperationalFunds = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const organizationId = req.user!.organizationId!;
    const operationalData = req.body;

    const operationalFunds = await this.fundingService.recordOperationalFunds(operationalData, organizationId);

    res.status(201).json({
      success: true,
      message: "Operational funds account created successfully",
      data: operationalFunds,
    });
  } catch (error: any) {
    // Check for duplicate error
    if (error.message.includes("already exists")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Failed to record operational funds",
    });
  }
};
getFundingStructure = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.user!.organizationId!;
    const fundingStructure = await this.fundingService.getFundingStructure(organizationId);

    // Enhance operational funds with balance info
    if (fundingStructure.operational && fundingStructure.operational.length > 0) {
      fundingStructure.operational = fundingStructure.operational.map((fund: any) => ({
        ...fund,
        currentBalance: fund.getCurrentBalance ? fund.getCurrentBalance() : fund.amountCommitted,
        totalInjections: fund.getTotalInjections ? fund.getTotalInjections() : 0,
        totalWithdrawals: fund.getTotalWithdrawals ? fund.getTotalWithdrawals() : 0,
      }));
    }

    res.status(200).json({
      success: true,
      data: fundingStructure,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch funding structure",
    });
  }
};


  updateBorrowing = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const borrowingId = Number.parseInt(id)

      const borrowing = await this.fundingService.updateBorrowing(borrowingId, req.body)

      res.status(200).json({
        success: true,
        message: "Borrowing updated successfully",
        data: borrowing,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update borrowing",
      })
    }
  }

  deleteBorrowing = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const borrowingId = Number.parseInt(id)

      await this.fundingService.deleteBorrowing(borrowingId)

      res.status(200).json({
        success: true,
        message: "Borrowing deleted successfully",
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete borrowing",
      })
    }
  }

recordShareCapital = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const organizationId = req.user!.organizationId!;
    const shareCapitalData = req.body as ShareCapitalRequest;
    const performedBy = req.user?.id;
    const performedByName = req.user?.name || req.user?.username || 'System';

    // Handle file uploads
    const files = req.files as { paymentProof?: Express.Multer.File[] };

    const result = await this.fundingService.recordShareCapital(
      shareCapitalData,
      organizationId,
      files,
      performedBy,
      performedByName
    );

    const message = result.isNewRecord
      ? "Share capital contribution recorded successfully"
      : `Contribution added successfully. Total contributions: ${result.contributionCount}`;

    res.status(201).json({
      success: true,
      message,
      data: {
        shareCapital: {
          id: result.id,
          shareholderId: result.shareholderId,
          shareholderType: result.shareholderType,
          totalNumberOfShares: result.totalNumberOfShares,
          totalContributedCapitalValue: result.totalContributedCapitalValue,
          averageValuePerShare: result.averageValuePerShare,
          contributionCount: result.contributionCount,
          firstContributionDate: result.firstContributionDate,
          lastContributionDate: result.lastContributionDate,
        },
        contribution: result.contribution,
        isNewRecord: result.isNewRecord,
        previousTotal: result.previousTotal,
        newTotal: result.newTotal
      }
    });
  } catch (error: any) {
    console.error('Error recording share capital:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to record share capital contribution",
    });
  }
};
  updateShareCapital = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const shareCapitalId = Number.parseInt(id)

      // Handle file uploads
      const files = req.files as { paymentProof?: Express.Multer.File[] };

      const shareCapital = await this.fundingService.updateShareCapital(
        shareCapitalId,
        req.body,
        files
      )

      res.status(200).json({
        success: true,
        message: "Share capital contribution updated successfully",
        data: shareCapital,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update share capital contribution",
      })
    }
  }

deleteShareCapital = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const shareCapitalId = Number.parseInt(id)

    // Fix: Call the correct method name - deleteShareCapitalById instead of deleteShareCapital
    await this.fundingService.deleteShareCapitalById(shareCapitalId)

    res.status(200).json({
      success: true,
      message: "Share capital contribution deleted successfully",
    })
  } catch (error: any) {
    console.error('Error deleting share capital:', error);
    
    let statusCode = 500;
    let errorMessage = error.message || "Failed to delete share capital contribution";

    if (error.message.includes("not found")) {
      statusCode = 404;
      errorMessage = "Share capital record not found";
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
    })
  }
}

getShareCapital = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.user!.organizationId!;
    const shareCapitals = await this.fundingService.getShareCapitalByOrganization(organizationId);

    // Transform data for frontend
    const transformedData = shareCapitals.map(sc => ({
      id: sc.id,
      shareholderId: sc.shareholderId,
      shareholderType: sc.shareholderType,
      shareholderName: sc.getShareholderName(),
      totalNumberOfShares: sc.totalNumberOfShares,
      totalContributedCapitalValue: sc.totalContributedCapitalValue,
      averageValuePerShare: sc.averageValuePerShare,
      contributionCount: sc.contributionCount,
      firstContributionDate: sc.firstContributionDate,
      lastContributionDate: sc.lastContributionDate,
      isActive: sc.isActive,
      contributions: sc.contributions?.map(c => ({
        id: c.id,
        contributionDate: c.contributionDate,
        shareType: c.shareType,
        numberOfShares: c.numberOfShares,
        valuePerShare: c.valuePerShare,
        totalValue: c.totalValue,
        paymentDetails: c.paymentDetails,
        notes: c.notes,
        isVerified: c.isVerified,
        recordedByName: c.recordedByName,
        createdAt: c.createdAt
      })).sort((a, b) => new Date(b.contributionDate).getTime() - new Date(a.contributionDate).getTime())
    }));

    res.status(200).json({
      success: true,
      data: transformedData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch share capital contributions",
    });
  }
};


  updateGrantedFunds = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const { id } = req.params
      const grantId = Number.parseInt(id)
      const grantData = req.body

      const grantedFunds = await this.fundingService.updateGrantedFunds(grantId, grantData)

      res.status(200).json({
        success: true,
        message: "Granted funds updated successfully",
        data: grantedFunds,
      })
    } catch (error: any) {

      let errorMessage = "Failed to update granted funds";
      let statusCode = 500;

      if (error.message.includes("not found")) {
        errorMessage = "Grant record not found";
        statusCode = 404;
      } else if (error.message.includes("invalid input syntax for type date")) {
        errorMessage = "Invalid date format provided";
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
      })
    }
  }

  deleteGrantedFunds = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const grantId = Number.parseInt(id)

      await this.fundingService.deleteGrantedFunds(grantId)

      res.status(200).json({
        success: true,
        message: "Granted funds deleted successfully",
      })
    } catch (error: any) {
      let errorMessage = "Failed to delete granted funds";
      let statusCode = 500;

      if (error.message.includes("not found")) {
        errorMessage = "Grant record not found";
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
      })
    }
  }

  updateOperationalFunds = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const { id } = req.params
      const operationalId = Number.parseInt(id)
      const operationalData = req.body

      const operationalFunds = await this.fundingService.updateOperationalFunds(operationalId, operationalData)

      res.status(200).json({
        success: true,
        message: "Operational funds updated successfully",
        data: operationalFunds,
      })
    } catch (error: any) {
      let errorMessage = "Failed to update operational funds";
      let statusCode = 500;

      if (error.message.includes("not found")) {
        errorMessage = "Operational fund record not found";
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
      })
    }
  }

  deleteOperationalFunds = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const operationalId = Number.parseInt(id)

      await this.fundingService.deleteOperationalFunds(operationalId)

      res.status(200).json({
        success: true,
        message: "Operational funds deleted successfully",
      })
    } catch (error: any) {
      let errorMessage = "Failed to delete operational funds";
      let statusCode = 500;

      if (error.message.includes("not found")) {
        errorMessage = "Operational fund record not found";
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
      })
    }
  }
}