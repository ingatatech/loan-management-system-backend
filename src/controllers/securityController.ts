// @ts-nocheck

import { Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import SecurityService from "../services/securityService";
import { AuditAction, AuditResource, AuditStatus } from "../entities/AuditLog";
import { ComplianceType, ComplianceStatus } from "../entities/ComplianceReport";
import { Request } from "express";

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

class SecurityController {
  /**
   * Get security overview dashboard
   */
  getSecurityOverview = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user?.role === 'system_owner' ? undefined : req.user?.organizationId || undefined;
      
      const result = await SecurityService.getSecurityOverview(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Error in getSecurityOverview:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching security overview",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get audit logs with pagination and filtering  (system-owner: all orgs)
   */
  getAuditLogs = async (
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

      const organizationId = req.user?.role === 'system_owner' ? undefined : req.user?.organizationId || undefined;
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const filters = {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        action: req.query.action as AuditAction,
        resource: req.query.resource as AuditResource,
        status: req.query.status as AuditStatus,
        search: req.query.search as string
      };

      const result = await SecurityService.getAuditLogs(organizationId, page, limit, filters);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Error in getAuditLogs:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching audit logs",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * GET /security/organizations/:organizationId/audit-logs
   *
   * Organisation-scoped audit logs:
   * • system_owner  — can query any org's logs via the URL param
   * • other roles   — can only query their own org (enforced by tenantIsolation
   *                   middleware + the check below)
   */
  getOrganizationAuditLogs = async (
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

      const requestedOrgId = parseInt(req.params.organizationId);

      if (!requestedOrgId || isNaN(requestedOrgId)) {
        res.status(400).json({ success: false, message: "Invalid organization ID" });
        return;
      }

      // Non-system-owner users can only view their own org's logs
      if (req.user?.role !== 'system_owner' && req.user?.organizationId !== requestedOrgId) {
        res.status(403).json({
          success: false,
          message: "You do not have permission to view audit logs for this organization",
        });
        return;
      }

      const page  = parseInt(req.query.page  as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const filters = {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate:   req.query.endDate   ? new Date(req.query.endDate   as string) : undefined,
        userId:    req.query.userId    ? parseInt(req.query.userId    as string) : undefined,
        action:    req.query.action    as AuditAction,
        resource:  req.query.resource  as AuditResource,
        status:    req.query.status    as AuditStatus,
        search:    req.query.search    as string,
      };

      const result = await SecurityService.getAuditLogs(requestedOrgId, page, limit, filters);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Error in getOrganizationAuditLogs:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching organization audit logs",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get audit log by ID
   */
  getAuditLogById = async (
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

      const organizationId = req.user?.role === 'system_owner' ? undefined : req.user?.organizationId || undefined;
      const logId = parseInt(req.params.id);

      if (isNaN(logId)) {
        res.status(400).json({
          success: false,
          message: "Invalid audit log ID"
        });
        return;
      }

      const result = await SecurityService.getAuditLogById(logId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Error in getAuditLogById:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching audit log",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get compliance reports
   */
  getComplianceReports = async (
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

      const organizationId = req.user?.role === 'system_owner' ? undefined : req.user?.organizationId || undefined;
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const filters = {
        type: req.query.type as ComplianceType,
        status: req.query.status as ComplianceStatus,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        search: req.query.search as string
      };

      const result = await SecurityService.getComplianceReports(organizationId, page, limit, filters);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Error in getComplianceReports:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching compliance reports",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get compliance report by ID
   */
  getComplianceReportById = async (
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

      const organizationId = req.user?.role === 'system_owner' ? undefined : req.user?.organizationId || undefined;
      const reportId = parseInt(req.params.id);

      if (isNaN(reportId)) {
        res.status(400).json({
          success: false,
          message: "Invalid report ID"
        });
        return;
      }

      const result = await SecurityService.getComplianceReportById(reportId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Error in getComplianceReportById:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching compliance report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Generate compliance report
   */
  generateComplianceReport = async (
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

      const organizationId = req.user?.organizationId;
      const userId = req.user?.id;

      if (!organizationId || !userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required"
        });
        return;
      }

      const { type, periodStart, periodEnd, sections } = req.body;

      const result = await SecurityService.generateComplianceReport(
        type,
        organizationId,
        userId,
        { periodStart, periodEnd, sections }
      );

      if (result.success) {
        res.status(202).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Error in generateComplianceReport:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating compliance report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Create audit log entry (internal use)
   */
  createAuditLog = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const { action, resource, resourceId, metadata, description, status } = req.body;
      const organizationId = req.user?.organizationId;
      const userId = req.user?.id;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      const log = await SecurityService.createAuditLog({
        action,
        resource,
        resourceId,
        organizationId,
        userId,
        metadata,
        description,
        status,
        ipAddress,
        userAgent,
        requestData: req.body,
        responseTime: Date.now() - (req as any).startTime
      });

      res.status(201).json({
        success: true,
        message: "Audit log created successfully",
        data: log
      });
    } catch (error: any) {
      console.error("Error in createAuditLog:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while creating audit log",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new SecurityController();