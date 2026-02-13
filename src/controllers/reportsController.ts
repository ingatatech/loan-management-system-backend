import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import ReportsService from "../services/reportsService";

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

class ReportsController {
  // ==================== SYSTEM REPORT ====================

  /**
   * GET /api/reports/system
   * Comprehensive system-wide report — all data from DB via ReportsService
   */
  getSystemReport = async (
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

      const dateRange = this.parseDateRange(req);
      const result = await ReportsService.getSystemReport(dateRange);

      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      console.error("Error in getSystemReport:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating system report",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ==================== ORGANIZATION REPORTS ====================

  /**
   * GET /api/reports/organizations
   * All organizations summary report — system owner only
   */
  getAllOrganizationsReport = async (
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

      const dateRange = this.parseDateRange(req);
      const result = await ReportsService.getAllOrganizationsReport(dateRange);

      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      console.error("Error in getAllOrganizationsReport:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating organizations report",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * GET /api/reports/organizations/:organizationId
   * Detailed single organization report
   */
  getOrganizationReport = async (
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

      const organizationId = parseInt(req.params.organizationId, 10);
      if (isNaN(organizationId) || organizationId <= 0) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID — must be a positive integer",
        });
        return;
      }

      const dateRange = this.parseDateRange(req);
      const result = await ReportsService.getOrganizationReport(
        organizationId,
        dateRange
      );

      // 404 when org is not found, 200 otherwise
      res.status(result.success ? 200 : 404).json(result);
    } catch (error: any) {
      console.error("Error in getOrganizationReport:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating organization report",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ==================== BORROWER REPORT ====================

  /**
   * GET /api/reports/borrowers
   * Borrower report, optionally scoped to an organization
   */
  getBorrowerReport = async (
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

      const organizationId = req.query.organizationId
        ? parseInt(req.query.organizationId as string, 10)
        : undefined;

      if (
        req.query.organizationId !== undefined &&
        (organizationId === undefined || isNaN(organizationId!))
      ) {
        res.status(400).json({
          success: false,
          message: "organizationId must be a valid integer",
        });
        return;
      }

      const dateRange = this.parseDateRange(req);
      const result = await ReportsService.getBorrowerReport(
        organizationId,
        dateRange
      );

      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      console.error("Error in getBorrowerReport:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating borrower report",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ==================== LOAN PORTFOLIO REPORT ====================

  /**
   * GET /api/reports/loans
   * Loan portfolio report, optionally scoped to an organization
   */
  getLoanPortfolioReport = async (
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

      const organizationId = req.query.organizationId
        ? parseInt(req.query.organizationId as string, 10)
        : undefined;

      if (
        req.query.organizationId !== undefined &&
        (organizationId === undefined || isNaN(organizationId!))
      ) {
        res.status(400).json({
          success: false,
          message: "organizationId must be a valid integer",
        });
        return;
      }

      const dateRange = this.parseDateRange(req);
      const result = await ReportsService.getLoanPortfolioReport(
        organizationId,
        dateRange
      );

      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      console.error("Error in getLoanPortfolioReport:", error);
      res.status(500).json({
        success: false,
        message:
          "Internal server error while generating loan portfolio report",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ==================== FINANCIAL REPORT ====================

  /**
   * GET /api/reports/financial
   * Financial report, optionally scoped to an organization
   */
  getFinancialReport = async (
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

      const organizationId = req.query.organizationId
        ? parseInt(req.query.organizationId as string, 10)
        : undefined;

      if (
        req.query.organizationId !== undefined &&
        (organizationId === undefined || isNaN(organizationId!))
      ) {
        res.status(400).json({
          success: false,
          message: "organizationId must be a valid integer",
        });
        return;
      }

      const dateRange = this.parseDateRange(req);
      const result = await ReportsService.getFinancialReport(
        organizationId,
        dateRange
      );

      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      console.error("Error in getFinancialReport:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating financial report",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ==================== CUSTOM REPORT ====================

  /**
   * POST /api/reports/custom
   * Generate a custom report based on caller-specified metrics & dimensions
   */
  generateCustomReport = async (
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

      const { metrics, dimensions, filters, dateRange } = req.body;

      if (!metrics && !dimensions) {
        res.status(400).json({
          success: false,
          message:
            "At least one of 'metrics' or 'dimensions' must be provided",
        });
        return;
      }

      const result = await ReportsService.getCustomReport({
        metrics: Array.isArray(metrics) ? metrics : [],
        dimensions: Array.isArray(dimensions) ? dimensions : [],
        filters: filters && typeof filters === "object" ? filters : {},
        dateRange:
          dateRange?.startDate || dateRange?.endDate
            ? {
                startDate: dateRange.startDate
                  ? new Date(dateRange.startDate)
                  : undefined,
                endDate: dateRange.endDate
                  ? new Date(dateRange.endDate)
                  : undefined,
              }
            : undefined,
      });

      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      console.error("Error in generateCustomReport:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating custom report",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ==================== EXPORT ENDPOINTS ====================

  /**
   * POST /api/reports/export/csv
   * Export arbitrary report data as a CSV file download
   */
  exportReportAsCSV = async (
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

      const { reportType, data } = req.body;

      if (!reportType || typeof reportType !== "string") {
        res.status(400).json({
          success: false,
          message: "reportType is required and must be a string",
        });
        return;
      }

      if (!data || typeof data !== "object") {
        res.status(400).json({
          success: false,
          message: "data is required and must be an object",
        });
        return;
      }

      const csv = this.convertToCSV(data);
      const filename = `${reportType}-${
        new Date().toISOString().split("T")[0]
      }.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.send(csv);
    } catch (error: any) {
      console.error("Error in exportReportAsCSV:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while exporting report",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * POST /api/reports/export/pdf
   * Placeholder — PDF generation requires an external library (pdfkit / puppeteer).
   * Returns a clear, actionable message instead of silently succeeding with no file.
   */
  exportReportAsPDF = async (
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

      // Not yet implemented — caller should use CSV export or client-side PDF generation
      res.status(501).json({
        success: false,
        message:
          "PDF export is not yet implemented. Use POST /api/reports/export/csv or generate the PDF client-side.",
      });
    } catch (error: any) {
      console.error("Error in exportReportAsPDF:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while exporting report as PDF",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ==================== PRIVATE HELPERS ====================

  /**
   * Parses startDate / endDate from query string.
   * Returns undefined values (not dummy dates) when not supplied so that
   * the service applies its own sensible defaults.
   */
  private parseDateRange(req: Request): {
    startDate?: Date;
    endDate?: Date;
  } {
    const startDate =
      req.query.startDate && typeof req.query.startDate === "string"
        ? new Date(req.query.startDate)
        : undefined;

    const endDate =
      req.query.endDate && typeof req.query.endDate === "string"
        ? new Date(req.query.endDate)
        : undefined;

    // Guard against invalid dates from malformed query strings
    return {
      startDate:
        startDate && !isNaN(startDate.getTime()) ? startDate : undefined,
      endDate: endDate && !isNaN(endDate.getTime()) ? endDate : undefined,
    };
  }

  /**
   * Converts a (potentially nested) object to CSV format.
   * Flattens one level deep; arrays are serialised as JSON strings.
   */
  private convertToCSV(data: any): string {
    if (!data || typeof data !== "object") {
      return "";
    }

    const flattenObject = (
      obj: any,
      prefix = ""
    ): Record<string, any> => {
      return Object.keys(obj).reduce(
        (acc: Record<string, any>, key: string) => {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          const value = obj[key];

          if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            !(value instanceof Date)
          ) {
            Object.assign(acc, flattenObject(value, fullKey));
          } else {
            acc[fullKey] = value;
          }

          return acc;
        },
        {}
      );
    };

    const flattened = flattenObject(data);
    const headers = Object.keys(flattened);

    const escapeCell = (value: any): string => {
      if (value === null || value === undefined) return "";
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value)) return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
      const str = String(value);
      // Quote strings that contain commas, quotes, or newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows: string[] = [
      headers.join(","),
      headers.map((h) => escapeCell(flattened[h])).join(","),
    ];

    return rows.join("\n");
  }
}

export default new ReportsController();