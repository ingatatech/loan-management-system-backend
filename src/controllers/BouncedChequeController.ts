
// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { BouncedChequeService } from "../services/BouncedChequeService";
import { BouncedChequeData } from "../entities/BouncedCheque";
import { BouncedCheque } from "../entities/BouncedCheque";
import { Organization } from "../entities/Organization";
import { Loan } from "../entities/Loan";
import { BorrowerProfile } from "../entities/BorrowerProfile";
import dbConnection from "../db";
import { parseISO, isValid } from "date-fns";

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

class BouncedChequeController {
  private bouncedChequeService: BouncedChequeService;

  constructor() {
    this.bouncedChequeService = new BouncedChequeService(
      dbConnection.getRepository(BouncedCheque),
      dbConnection.getRepository(Organization),
      dbConnection.getRepository(Loan),
      dbConnection.getRepository(BorrowerProfile)
    );
  }

  /**
   * Helper function to safely parse dates
   * Converts empty strings to null, handles valid dates
   */
  private parseDateField(dateValue: any): Date | null {
    // Return null for empty strings, null, or undefined
    if (!dateValue || dateValue === "" || dateValue.trim?.() === "") {
      return null;
    }

    try {
      const parsedDate = parseISO(dateValue);
      if (isValid(parsedDate)) {
        return parsedDate;
      }
      return null;
    } catch (error) {
      console.warn(`Invalid date format: ${dateValue}`);
      return null;
    }
  }

  /**
   * Helper function to sanitize bounced cheque data
   * Converts empty strings to null for all nullable fields
   */
  private sanitizeBouncedChequeData(data: any): BouncedChequeData {
    return {
      accountNumber: data.accountNumber || "",
      type: data.type,
      // Individual fields - convert empty strings to null
      surname: data.surname && data.surname.trim() !== "" ? data.surname : null,
      forename1: data.forename1 && data.forename1.trim() !== "" ? data.forename1 : null,
      forename2: data.forename2 && data.forename2.trim() !== "" ? data.forename2 : null,
      forename3: data.forename3 && data.forename3.trim() !== "" ? data.forename3 : null,
      nationalId: data.nationalId && data.nationalId.trim() !== "" ? data.nationalId : null,
      dateOfBirth: this.parseDateField(data.dateOfBirth),
      placeOfBirth: data.placeOfBirth && data.placeOfBirth.trim() !== "" ? data.placeOfBirth : null,
      // Institution fields - convert empty strings to null
      institutionName: data.institutionName && data.institutionName.trim() !== "" ? data.institutionName : null,
      tradingName: data.tradingName && data.tradingName.trim() !== "" ? data.tradingName : null,
      companyRegNo: data.companyRegNo && data.companyRegNo.trim() !== "" ? data.companyRegNo : null,
      companyRegistrationDate: this.parseDateField(data.companyRegistrationDate),
      // Common fields - convert empty strings to null
      passportNo: data.passportNo && data.passportNo.trim() !== "" ? data.passportNo : null,
      nationality: data.nationality && data.nationality.trim() !== "" ? data.nationality : null,
      postalAddressLine1: data.postalAddressLine1 && data.postalAddressLine1.trim() !== "" ? data.postalAddressLine1 : null,
      postalAddressLine2: data.postalAddressLine2 && data.postalAddressLine2.trim() !== "" ? data.postalAddressLine2 : null,
      town: data.town && data.town.trim() !== "" ? data.town : null,
      postalCode: data.postalCode && data.postalCode.trim() !== "" ? data.postalCode : null,
      country: data.country && data.country.trim() !== "" ? data.country : null,
      // Cheque details - required fields remain as is
      chequeNumber: data.chequeNumber,
      chequeDate: this.parseDateField(data.chequeDate) || new Date(),
      reportedDate: this.parseDateField(data.reportedDate) || new Date(),
      currency: data.currency || "RWF",
      amount: parseFloat(data.amount) || 0,
      returnedChequeReason: data.returnedChequeReason,
      beneficiaryName: data.beneficiaryName || "",
      notes: data.notes && data.notes.trim() !== "" ? data.notes : null,
    };
  }

  /**
   * Create Bounced Cheque
   * POST /api/organizations/:organizationId/bounced-cheques
   * Maintains 100% original functionality with enhanced validation
   */
  createBouncedCheque = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log("=== CREATE BOUNCED CHEQUE DEBUG START ===");
      console.log("Raw request body:", JSON.stringify(req.body, null, 2));

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log("Validation errors:", errors.array());
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

      // Sanitize the data - convert empty strings to null
      const sanitizedData = this.sanitizeBouncedChequeData(req.body);
      console.log("Sanitized data:", JSON.stringify(sanitizedData, null, 2));

      // Additional validation for required fields based on type
      if (sanitizedData.type === "individual") {
        if (!sanitizedData.surname || !sanitizedData.forename1) {
          res.status(400).json({
            success: false,
            message: "Surname and Forename 1 are required for individual type",
          });
          return;
        }
      } else if (sanitizedData.type === "institution") {
        if (!sanitizedData.institutionName) {
          res.status(400).json({
            success: false,
            message: "Institution name is required for institution type",
          });
          return;
        }
      }

      // Call service layer
      const result = await this.bouncedChequeService.createBouncedCheque(
        sanitizedData,
        organizationId,
        req.user?.id || null
      );

      console.log("Service result:", result.success);
      console.log("=== CREATE BOUNCED CHEQUE DEBUG END ===");

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Create bounced cheque error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during bounced cheque creation",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get All Bounced Cheques with Pagination
   * GET /api/organizations/:organizationId/bounced-cheques
   */
  getAllBouncedCheques = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const type = req.query.type as string;
      const reason = req.query.reason as string;

      const result = await this.bouncedChequeService.getAllBouncedCheques(
        organizationId,
        page,
        limit,
        search,
        type,
        reason
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get all bounced cheques error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching bounced cheques",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get Bounced Cheque by ID
   * GET /api/organizations/:organizationId/bounced-cheques/:chequeId
   */
  getBouncedChequeById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const chequeId = parseInt(req.params.chequeId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!chequeId || isNaN(chequeId)) {
        res.status(400).json({
          success: false,
          message: "Invalid cheque ID",
        });
        return;
      }

      const result = await this.bouncedChequeService.getBouncedChequeById(
        chequeId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get bounced cheque by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching bounced cheque",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Update Bounced Cheque
   * PUT /api/organizations/:organizationId/bounced-cheques/:chequeId
   */
  updateBouncedCheque = async (
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
      const chequeId = parseInt(req.params.chequeId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!chequeId || isNaN(chequeId)) {
        res.status(400).json({
          success: false,
          message: "Invalid cheque ID",
        });
        return;
      }

      // Sanitize update data - convert empty strings to null
      const sanitizedUpdateData = this.sanitizeBouncedChequeData(req.body);

      const result = await this.bouncedChequeService.updateBouncedCheque(
        chequeId,
        sanitizedUpdateData,
        organizationId,
        req.user?.id || null
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode =
          result.message === "Bounced cheque not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Update bounced cheque error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during bounced cheque update",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Delete Bounced Cheque
   * DELETE /api/organizations/:organizationId/bounced-cheques/:chequeId
   */
  deleteBouncedCheque = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const chequeId = parseInt(req.params.chequeId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!chequeId || isNaN(chequeId)) {
        res.status(400).json({
          success: false,
          message: "Invalid cheque ID",
        });
        return;
      }

      const result = await this.bouncedChequeService.deleteBouncedCheque(
        chequeId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode =
          result.message === "Bounced cheque not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Delete bounced cheque error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during bounced cheque deletion",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get Bounced Cheque Statistics
   * GET /api/organizations/:organizationId/bounced-cheques/stats
   */
  getBouncedChequeStats = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.bouncedChequeService.getBouncedChequeStats(
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get bounced cheque stats error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching statistics",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Link Bounced Cheque to Loan
   * POST /api/organizations/:organizationId/bounced-cheques/:chequeId/link-loan
   */
  linkToLoan = async (
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
      const chequeId = parseInt(req.params.chequeId);
      const loanId = parseInt(req.body.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!chequeId || isNaN(chequeId)) {
        res.status(400).json({
          success: false,
          message: "Invalid cheque ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.bouncedChequeService.linkBouncedChequeToLoan(
        chequeId,
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Link to loan error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while linking to loan",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new BouncedChequeController();