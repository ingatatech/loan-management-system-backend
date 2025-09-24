// loanAnalysisReportController.ts
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import LoanAnalysisReportService, { 
  CreateAnalysisReportRequest
} from "../services/loanAnalysisReportService";
import { ReportType, ReportStatus } from "../entities/LoanAnalysisReport";

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

class LoanAnalysisReportController {
  private service = LoanAnalysisReportService;

  /**
   * Create a new loan analysis report with optional signatures
   */
  createAnalysisReport = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== CREATE LOAN ANALYSIS REPORT WITH SIGNATURES START ===');

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
      const userId = req.user?.id;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      // ✅ Get uploaded signature files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const loanOfficerSignature = files?.loanOfficerSignature?.[0];
      const managingDirectorSignature = files?.managingDirectorSignature?.[0];

      console.log('📁 Files received:', {
        loanOfficerSignature: loanOfficerSignature ? loanOfficerSignature.originalname : 'none',
        managingDirectorSignature: managingDirectorSignature ? managingDirectorSignature.originalname : 'none'
      });

      // Parse JSON fields if sent as strings
      let approvalConditions = null;
      if (req.body.approvalConditions) {
        try {
          approvalConditions = typeof req.body.approvalConditions === 'string'
            ? JSON.parse(req.body.approvalConditions)
            : req.body.approvalConditions;
        } catch (e) {
          res.status(400).json({
            success: false,
            message: "Invalid approval conditions format"
          });
          return;
        }
      }

      let rejectionReasons = null;
      if (req.body.rejectionReasons) {
        try {
          rejectionReasons = typeof req.body.rejectionReasons === 'string'
            ? JSON.parse(req.body.rejectionReasons)
            : req.body.rejectionReasons;
        } catch (e) {
          res.status(400).json({
            success: false,
            message: "Invalid rejection reasons format"
          });
          return;
        }
      }

      const reportData: CreateAnalysisReportRequest = {
        loanId: parseInt(req.body.loanId),
        reportType: req.body.reportType as ReportType,
        introductionMessage: req.body.introductionMessage,
        approveMessage: req.body.approveMessage,
        approvalConditions,
        rejectMessage: req.body.rejectMessage,
        rejectionReasons,
        additionalNotes: req.body.additionalNotes,
        internalRemarks: req.body.internalRemarks,
        // ✅ NEW: Add signature files and names
        loanOfficerSignature,
        managingDirectorSignature,
        loanOfficerName: req.body.loanOfficerName,
        managingDirectorName: req.body.managingDirectorName
      };

      const result = await this.service.createAnalysisReport(
        reportData,
        organizationId,
        userId
      );

      if (result.success) {
        console.log('✅ Analysis report created successfully with signatures');
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Create analysis report error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while creating analysis report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ✅ REMOVED: signReport method - no longer needed

  /**
   * Get report by ID
   */
  getReportById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const reportId = parseInt(req.params.reportId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!reportId || isNaN(reportId)) {
        res.status(400).json({
          success: false,
          message: "Invalid report ID",
        });
        return;
      }

      const result = await this.service.getReportById(reportId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }

    } catch (error: any) {
      console.error('❌ Get report error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while retrieving report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get all reports for a specific loan
   */
  getLoanReports = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
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

      const result = await this.service.getLoanReports(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Get loan reports error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while retrieving loan reports",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get all reports with pagination and filtering
   */
  getAllReports = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const filters = {
        reportType: req.query.reportType as ReportType | undefined,
        status: req.query.status as ReportStatus | undefined,
        isFinalized: req.query.isFinalized === 'true' ? true : 
                     req.query.isFinalized === 'false' ? false : undefined,
        search: req.query.search as string | undefined
      };

      const result = await this.service.getAllReports(
        organizationId,
        page,
        limit,
        filters
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Get all reports error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while retrieving reports",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Update an existing report
   */
  updateReport = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== UPDATE LOAN ANALYSIS REPORT START ===');

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
      const reportId = parseInt(req.params.reportId);
      const userId = req.user?.id;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!reportId || isNaN(reportId)) {
        res.status(400).json({
          success: false,
          message: "Invalid report ID",
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      // Parse JSON fields if needed
      const updates: any = { ...req.body };
      
      if (updates.approvalConditions && typeof updates.approvalConditions === 'string') {
        try {
          updates.approvalConditions = JSON.parse(updates.approvalConditions);
        } catch (e) {
          res.status(400).json({
            success: false,
            message: "Invalid approval conditions format"
          });
          return;
        }
      }

      if (updates.rejectionReasons && typeof updates.rejectionReasons === 'string') {
        try {
          updates.rejectionReasons = JSON.parse(updates.rejectionReasons);
        } catch (e) {
          res.status(400).json({
            success: false,
            message: "Invalid rejection reasons format"
          });
          return;
        }
      }

      const result = await this.service.updateReport(
        reportId,
        updates,
        organizationId,
        userId
      );

      if (result.success) {
        console.log('✅ Report updated successfully');
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Update report error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while updating report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Delete a report (soft delete)
   */
  deleteReport = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const reportId = parseInt(req.params.reportId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!reportId || isNaN(reportId)) {
        res.status(400).json({
          success: false,
          message: "Invalid report ID",
        });
        return;
      }

      const result = await this.service.deleteReport(reportId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Delete report error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while deleting report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get report statistics
   */
  getReportStatistics = async (
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

      const result = await this.service.getReportStatistics(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Get statistics error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while retrieving statistics",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new LoanAnalysisReportController();