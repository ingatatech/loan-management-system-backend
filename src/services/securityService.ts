import { Repository, Between, MoreThanOrEqual, LessThanOrEqual, In } from "typeorm";
import { AuditLog, AuditAction, AuditResource, AuditStatus } from "../entities/AuditLog";
import { ComplianceReport, ComplianceType, ComplianceStatus, ComplianceSeverity } from "../entities/ComplianceReport";
import { SecurityEvent, SecurityEventType, SecurityEventSeverity, SecurityEventStatus } from "../entities/SecurityEvent";
import { User } from "../entities/User";
import { Organization } from "../entities/Organization";
import dbConnection from "../db";
import { 
  subDays, 
  subHours, 
  subMonths, 
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth
} from "date-fns";

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export class SecurityService {
  private auditLogRepo: Repository<AuditLog>;
  private complianceRepo: Repository<ComplianceReport>;
  private securityEventRepo: Repository<SecurityEvent>;
  private userRepo: Repository<User>;
  private organizationRepo: Repository<Organization>;

  constructor() {
    this.auditLogRepo = dbConnection.getRepository(AuditLog);
    this.complianceRepo = dbConnection.getRepository(ComplianceReport);
    this.securityEventRepo = dbConnection.getRepository(SecurityEvent);
    this.userRepo = dbConnection.getRepository(User);
    this.organizationRepo = dbConnection.getRepository(Organization);
  }

  /**
   * Get security overview dashboard data
   */
  async getSecurityOverview(organizationId?: number): Promise<ServiceResponse> {
    try {
      const now = new Date();
      const last24Hours = subHours(now, 24);
      const last7Days = subDays(now, 7);
      const last30Days = subDays(now, 30);
      const last90Days = subDays(now, 90);

      // Build where clause based on organization access
      const whereClause = organizationId ? { organizationId } : {};

      // Fetch security events
      const [
        criticalEvents,
        highEvents,
        mediumEvents,
        lowEvents,
        recentEvents,
        unresolvedEvents,
        eventsByType
      ] = await Promise.all([
        // Critical events count
        this.securityEventRepo.count({
          where: {
            ...whereClause,
            severity: SecurityEventSeverity.CRITICAL,
            createdAt: MoreThanOrEqual(last30Days)
          }
        }),
        // High severity events
        this.securityEventRepo.count({
          where: {
            ...whereClause,
            severity: SecurityEventSeverity.HIGH,
            createdAt: MoreThanOrEqual(last30Days)
          }
        }),
        // Medium severity events
        this.securityEventRepo.count({
          where: {
            ...whereClause,
            severity: SecurityEventSeverity.MEDIUM,
            createdAt: MoreThanOrEqual(last30Days)
          }
        }),
        // Low severity events
        this.securityEventRepo.count({
          where: {
            ...whereClause,
            severity: SecurityEventSeverity.LOW,
            createdAt: MoreThanOrEqual(last30Days)
          }
        }),
        // Recent events (last 24h)
        this.securityEventRepo.find({
          where: {
            ...whereClause,
            createdAt: MoreThanOrEqual(last24Hours)
          },
          order: { createdAt: 'DESC' },
          take: 10,
          relations: ['user']
        }),
        // Unresolved events
        this.securityEventRepo.count({
          where: {
            ...whereClause,
            isResolved: false,
            severity: In([SecurityEventSeverity.CRITICAL, SecurityEventSeverity.HIGH, SecurityEventSeverity.MEDIUM])
          }
        }),
        // Events by type (last 30 days)
        this.securityEventRepo
          .createQueryBuilder('event')
          .select('event.type', 'type')
          .addSelect('COUNT(*)', 'count')
          .where('event.createdAt >= :last30Days', { last30Days })
          .andWhere(organizationId ? 'event.organizationId = :organizationId' : '1=1', { organizationId })
          .groupBy('event.type')
          .getRawMany()
      ]);

      // Fetch audit logs for activity metrics
      const [
        totalAuditLogs,
        failedActions,
        suspiciousActivities,
        uniqueUsers,
        actionsByResource
      ] = await Promise.all([
        this.auditLogRepo.count({
          where: {
            ...whereClause,
            createdAt: MoreThanOrEqual(last30Days)
          }
        }),
        this.auditLogRepo.count({
          where: {
            ...whereClause,
            status: AuditStatus.FAILURE,
            createdAt: MoreThanOrEqual(last30Days)
          }
        }),
        this.auditLogRepo.count({
          where: {
            ...whereClause,
            action: In([
              AuditAction.LOGIN_FAILED,
              AuditAction.PASSWORD_CHANGE,
              AuditAction.USER_ROLE_CHANGED
            ]),
            createdAt: MoreThanOrEqual(last30Days)
          }
        }),
        this.auditLogRepo
          .createQueryBuilder('log')
          .select('COUNT(DISTINCT log.userId)', 'count')
          .where('log.createdAt >= :last30Days', { last30Days })
          .andWhere(organizationId ? 'log.organizationId = :organizationId' : '1=1', { organizationId })
          .getRawOne(),
        this.auditLogRepo
          .createQueryBuilder('log')
          .select('log.resource', 'resource')
          .addSelect('COUNT(*)', 'count')
          .where('log.createdAt >= :last30Days', { last30Days })
          .andWhere(organizationId ? 'log.organizationId = :organizationId' : '1=1', { organizationId })
          .groupBy('log.resource')
          .getRawMany()
      ]);

      // Fetch compliance status
      const [
        totalComplianceReports,
        compliantReports,
        nonCompliantReports,
        pendingReviews,
        overdueReports
      ] = await Promise.all([
        this.complianceRepo.count({
          where: {
            ...whereClause,
            createdAt: MoreThanOrEqual(last90Days)
          }
        }),
        this.complianceRepo.count({
          where: {
            ...whereClause,
            status: ComplianceStatus.COMPLETED,
            overallScore: MoreThanOrEqual(80)
          }
        }),
        this.complianceRepo.count({
          where: {
            ...whereClause,
            status: ComplianceStatus.COMPLETED,
            overallScore: LessThanOrEqual(50)
          }
        }),
        this.complianceRepo.count({
          where: {
            ...whereClause,
            status: ComplianceStatus.GENERATING
          }
        }),
        this.complianceRepo.count({
          where: {
            ...whereClause,
            dueDate: LessThanOrEqual(now),
            status: In([ComplianceStatus.DRAFT, ComplianceStatus.GENERATING, ComplianceStatus.REVIEWED])
          }
        })
      ]);

      // Calculate user security metrics
      const [
        totalUsers,
        usersWithMFA,
        usersWithoutMFA,
        recentLogins,
        failedLogins
      ] = await Promise.all([
        this.userRepo.count({ where: organizationId ? { organizationId } : {} }),
        this.userRepo.count({ 
          where: { 
            ...(organizationId ? { organizationId } : {}),
            is2FAEnabled: true 
          } 
        }),
        this.userRepo.count({ 
          where: { 
            ...(organizationId ? { organizationId } : {}),
            is2FAEnabled: false 
          } 
        }),
        this.auditLogRepo.count({
          where: {
            ...whereClause,
            action: AuditAction.LOGIN_SUCCESS,
            createdAt: MoreThanOrEqual(last24Hours)
          }
        }),
        this.auditLogRepo.count({
          where: {
            ...whereClause,
            action: AuditAction.LOGIN_FAILED,
            createdAt: MoreThanOrEqual(last24Hours)
          }
        })
      ]);

      // Generate security score
      const securityScore = this.calculateSecurityScore({
        mfaAdoptionRate: totalUsers > 0 ? (usersWithMFA / totalUsers) * 100 : 0,
        failedLoginRatio: recentLogins > 0 ? (failedLogins / (recentLogins + failedLogins)) * 100 : 0,
        criticalEvents,
        unresolvedEvents,
        complianceScore: compliantReports > 0 ? (compliantReports / totalComplianceReports) * 100 : 0
      });

      return {
        success: true,
        message: "Security overview retrieved successfully",
        data: {
          summary: {
            securityScore,
            securityGrade: this.getSecurityGrade(securityScore),
            totalEvents: criticalEvents + highEvents + mediumEvents + lowEvents,
            criticalEvents,
            highEvents,
            mediumEvents,
            lowEvents,
            unresolvedEvents,
            failedActions,
            suspiciousActivities,
            uniqueUsers: uniqueUsers?.count || 0,
            totalAuditLogs
          },
          
          securityEvents: {
            recent: recentEvents,
            byType: eventsByType,
            timeline: await this.generateEventTimeline(organizationId, last7Days)
          },
          
          auditSummary: {
            totalLogs: totalAuditLogs,
            failedActions,
            suspiciousActivities,
            byResource: actionsByResource,
            successRate: totalAuditLogs > 0 
              ? ((totalAuditLogs - failedActions) / totalAuditLogs) * 100 
              : 100
          },
          
          complianceStatus: {
            total: totalComplianceReports,
            compliant: compliantReports,
            nonCompliant: nonCompliantReports,
            pendingReviews,
            overdue: overdueReports,
            complianceRate: totalComplianceReports > 0 
              ? (compliantReports / totalComplianceReports) * 100 
              : 0
          },
          
          userSecurity: {
            totalUsers,
            mfaEnabled: usersWithMFA,
            mfaDisabled: usersWithoutMFA,
            mfaAdoptionRate: totalUsers > 0 ? (usersWithMFA / totalUsers) * 100 : 0,
            recentLogins,
            failedLogins,
            loginSuccessRate: (recentLogins + failedLogins) > 0
              ? (recentLogins / (recentLogins + failedLogins)) * 100
              : 100
          },
          
          alerts: await this.generateSecurityAlerts(organizationId),
          
          recommendations: this.generateSecurityRecommendations({
            mfaAdoptionRate: usersWithMFA / totalUsers,
            failedLoginRatio: failedLogins / (recentLogins + failedLogins || 1),
            criticalEvents,
            unresolvedEvents,
            complianceScore: compliantReports / totalComplianceReports || 0
          }),
          
          timestamp: now.toISOString()
        }
      };
    } catch (error: any) {
      console.error("Error in getSecurityOverview:", error);
      return {
        success: false,
        message: "Failed to retrieve security overview",
        error: error.message
      };
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(
    organizationId?: number,
    page: number = 1,
    limit: number = 50,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      userId?: number;
      action?: AuditAction;
      resource?: AuditResource;
      status?: AuditStatus;
      search?: string;
    }
  ): Promise<ServiceResponse> {
    try {
      const queryBuilder = this.auditLogRepo
        .createQueryBuilder('log')
        .leftJoinAndSelect('log.user', 'user')
        .leftJoinAndSelect('log.organization', 'organization')
        .orderBy('log.createdAt', 'DESC');

      // Apply organization filter
      if (organizationId) {
        queryBuilder.andWhere('log.organizationId = :organizationId', { organizationId });
      }

      // Apply date filters
      if (filters?.startDate) {
        queryBuilder.andWhere('log.createdAt >= :startDate', { startDate: filters.startDate });
      }
      if (filters?.endDate) {
        queryBuilder.andWhere('log.createdAt <= :endDate', { endDate: filters.endDate });
      }

      // Apply other filters
      if (filters?.userId) {
        queryBuilder.andWhere('log.userId = :userId', { userId: filters.userId });
      }
      if (filters?.action) {
        queryBuilder.andWhere('log.action = :action', { action: filters.action });
      }
      if (filters?.resource) {
        queryBuilder.andWhere('log.resource = :resource', { resource: filters.resource });
      }
      if (filters?.status) {
        queryBuilder.andWhere('log.status = :status', { status: filters.status });
      }

      // Search in description and metadata
      if (filters?.search) {
        queryBuilder.andWhere(
          '(log.description ILIKE :search OR CAST(log.metadata AS TEXT) ILIKE :search)',
          { search: `%${filters.search}%` }
        );
      }

      // Get total count
      const total = await queryBuilder.getCount();

      // Apply pagination
      queryBuilder
        .skip((page - 1) * limit)
        .take(limit);

      // Execute query
      const logs = await queryBuilder.getMany();

      // Get summary statistics
      const [
        totalCount,
        successCount,
        failureCount,
        uniqueUsers,
        actionsBreakdown,
        resourcesBreakdown
      ] = await Promise.all([
        this.auditLogRepo.count({ where: organizationId ? { organizationId } : {} }),
        this.auditLogRepo.count({ 
          where: { 
            ...(organizationId ? { organizationId } : {}),
            status: AuditStatus.SUCCESS 
          } 
        }),
        this.auditLogRepo.count({ 
          where: { 
            ...(organizationId ? { organizationId } : {}),
            status: AuditStatus.FAILURE 
          } 
        }),
        this.auditLogRepo
          .createQueryBuilder('log')
          .select('COUNT(DISTINCT log.userId)', 'count')
          .where(organizationId ? 'log.organizationId = :organizationId' : '1=1', { organizationId })
          .getRawOne(),
        this.auditLogRepo
          .createQueryBuilder('log')
          .select('log.action', 'action')
          .addSelect('COUNT(*)', 'count')
          .where(organizationId ? 'log.organizationId = :organizationId' : '1=1', { organizationId })
          .groupBy('log.action')
          .getRawMany(),
        this.auditLogRepo
          .createQueryBuilder('log')
          .select('log.resource', 'resource')
          .addSelect('COUNT(*)', 'count')
          .where(organizationId ? 'log.organizationId = :organizationId' : '1=1', { organizationId })
          .groupBy('log.resource')
          .getRawMany()
      ]);

      return {
        success: true,
        message: "Audit logs retrieved successfully",
        data: {
          logs,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          },
          summary: {
            total: totalCount,
            success: successCount,
            failure: failureCount,
            successRate: totalCount > 0 ? (successCount / totalCount) * 100 : 0,
            uniqueUsers: uniqueUsers?.count || 0,
            actionsBreakdown,
            resourcesBreakdown
          }
        }
      };
    } catch (error: any) {
      console.error("Error in getAuditLogs:", error);
      return {
        success: false,
        message: "Failed to retrieve audit logs",
        error: error.message
      };
    }
  }

  /**
   * Get audit log details by ID
   */
  async getAuditLogById(id: number, organizationId?: number): Promise<ServiceResponse> {
    try {
      const queryBuilder = this.auditLogRepo
        .createQueryBuilder('log')
        .leftJoinAndSelect('log.user', 'user')
        .leftJoinAndSelect('log.organization', 'organization')
        .where('log.id = :id', { id });

      if (organizationId) {
        queryBuilder.andWhere('log.organizationId = :organizationId', { organizationId });
      }

      const log = await queryBuilder.getOne();

      if (!log) {
        return {
          success: false,
          message: "Audit log not found"
        };
      }

      return {
        success: true,
        message: "Audit log retrieved successfully",
        data: log
      };
    } catch (error: any) {
      console.error("Error in getAuditLogById:", error);
      return {
        success: false,
        message: "Failed to retrieve audit log",
        error: error.message
      };
    }
  }

  /**
   * Get compliance reports with filtering and pagination
   */
  async getComplianceReports(
    organizationId?: number,
    page: number = 1,
    limit: number = 10,
    filters?: {
      type?: ComplianceType;
      status?: ComplianceStatus;
      startDate?: Date;
      endDate?: Date;
      search?: string;
    }
  ): Promise<ServiceResponse> {
    try {
      const queryBuilder = this.complianceRepo
        .createQueryBuilder('report')
        .leftJoinAndSelect('report.creator', 'creator')
        .leftJoinAndSelect('report.organization', 'organization')
        .orderBy('report.createdAt', 'DESC');

      // Apply organization filter
      if (organizationId) {
        queryBuilder.andWhere('report.organizationId = :organizationId', { organizationId });
      }

      // Apply filters
      if (filters?.type) {
        queryBuilder.andWhere('report.type = :type', { type: filters.type });
      }
      if (filters?.status) {
        queryBuilder.andWhere('report.status = :status', { status: filters.status });
      }
      if (filters?.startDate) {
        queryBuilder.andWhere('report.reportDate >= :startDate', { startDate: filters.startDate });
      }
      if (filters?.endDate) {
        queryBuilder.andWhere('report.reportDate <= :endDate', { endDate: filters.endDate });
      }
      if (filters?.search) {
        queryBuilder.andWhere(
          '(report.title ILIKE :search OR report.description ILIKE :search)',
          { search: `%${filters.search}%` }
        );
      }

      // Get total count
      const total = await queryBuilder.getCount();

      // Apply pagination
      queryBuilder
        .skip((page - 1) * limit)
        .take(limit);

      // Execute query
      const reports = await queryBuilder.getMany();

      // Get summary statistics
      const [
        totalReports,
        completedReports,
        pendingReports,
        averageScore,
        complianceByType
      ] = await Promise.all([
        this.complianceRepo.count({ where: organizationId ? { organizationId } : {} }),
        this.complianceRepo.count({ 
          where: { 
            ...(organizationId ? { organizationId } : {}),
            status: ComplianceStatus.COMPLETED 
          } 
        }),
        this.complianceRepo.count({ 
          where: { 
            ...(organizationId ? { organizationId } : {}),
            status: In([ComplianceStatus.DRAFT, ComplianceStatus.GENERATING, ComplianceStatus.REVIEWED])
          } 
        }),
        this.complianceRepo
          .createQueryBuilder('report')
          .select('AVG(report.overallScore)', 'average')
          .where(organizationId ? 'report.organizationId = :organizationId' : '1=1', { organizationId })
          .andWhere('report.status = :status', { status: ComplianceStatus.COMPLETED })
          .getRawOne(),
        this.complianceRepo
          .createQueryBuilder('report')
          .select('report.type', 'type')
          .addSelect('COUNT(*)', 'count')
          .addSelect('AVG(report.overallScore)', 'averageScore')
          .where(organizationId ? 'report.organizationId = :organizationId' : '1=1', { organizationId })
          .groupBy('report.type')
          .getRawMany()
      ]);

      return {
        success: true,
        message: "Compliance reports retrieved successfully",
        data: {
          reports,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          },
          summary: {
            total: totalReports,
            completed: completedReports,
            pending: pendingReports,
            completionRate: totalReports > 0 ? (completedReports / totalReports) * 100 : 0,
            averageScore: Math.round(averageScore?.average || 0),
            byType: complianceByType
          }
        }
      };
    } catch (error: any) {
      console.error("Error in getComplianceReports:", error);
      return {
        success: false,
        message: "Failed to retrieve compliance reports",
        error: error.message
      };
    }
  }

  /**
   * Get compliance report by ID
   */
  async getComplianceReportById(id: number, organizationId?: number): Promise<ServiceResponse> {
    try {
      const queryBuilder = this.complianceRepo
        .createQueryBuilder('report')
        .leftJoinAndSelect('report.creator', 'creator')
        .leftJoinAndSelect('report.organization', 'organization')
        .where('report.id = :id', { id });

      if (organizationId) {
        queryBuilder.andWhere('report.organizationId = :organizationId', { organizationId });
      }

      const report = await queryBuilder.getOne();

      if (!report) {
        return {
          success: false,
          message: "Compliance report not found"
        };
      }

      return {
        success: true,
        message: "Compliance report retrieved successfully",
        data: report
      };
    } catch (error: any) {
      console.error("Error in getComplianceReportById:", error);
      return {
        success: false,
        message: "Failed to retrieve compliance report",
        error: error.message
      };
    }
  }

  /**
   * Create a new compliance report
   */
  async createComplianceReport(
    data: Partial<ComplianceReport>,
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse> {
    try {
      const report = this.complianceRepo.create({
        ...data,
        reportId: `COMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        organizationId,
        createdBy: userId,
        status: ComplianceStatus.DRAFT
      });

      await this.complianceRepo.save(report);

      // Log audit event
      await this.createAuditLog({
        action: AuditAction.REPORT_GENERATED,
        resource: AuditResource.REPORT,
        resourceId: report.reportId,
        organizationId,
        userId,
        metadata: { reportType: report.type, reportId: report.id }
      });

      return {
        success: true,
        message: "Compliance report created successfully",
        data: report
      };
    } catch (error: any) {
      console.error("Error in createComplianceReport:", error);
      return {
        success: false,
        message: "Failed to create compliance report",
        error: error.message
      };
    }
  }

  /**
   * Update compliance report
   */
  async updateComplianceReport(
    id: number,
    data: Partial<ComplianceReport>,
    organizationId?: number,
    userId?: number
  ): Promise<ServiceResponse> {
    try {
      const queryBuilder = this.complianceRepo
        .createQueryBuilder('report')
        .where('report.id = :id', { id });

      if (organizationId) {
        queryBuilder.andWhere('report.organizationId = :organizationId', { organizationId });
      }

      const report = await queryBuilder.getOne();

      if (!report) {
        return {
          success: false,
          message: "Compliance report not found"
        };
      }

      // Update report
      Object.assign(report, {
        ...data,
        updatedBy: userId,
        updatedAt: new Date()
      });

      await this.complianceRepo.save(report);

      return {
        success: true,
        message: "Compliance report updated successfully",
        data: report
      };
    } catch (error: any) {
      console.error("Error in updateComplianceReport:", error);
      return {
        success: false,
        message: "Failed to update compliance report",
        error: error.message
      };
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    type: ComplianceType,
    organizationId: number,
    userId: number,
    options?: {
      periodStart?: Date;
      periodEnd?: Date;
      sections?: string[];
    }
  ): Promise<ServiceResponse> {
    try {
      // Create report in generating status
      const report = await this.createComplianceReport({
        type,
        title: `${type.replace(/_/g, ' ')} Compliance Report`,
        reportDate: new Date(),
        periodStart: options?.periodStart,
        periodEnd: options?.periodEnd,
        status: ComplianceStatus.GENERATING
      }, organizationId, userId);

      if (!report.success || !report.data) {
        return report;
      }

      // Generate report data asynchronously
      this.processComplianceReportGeneration(report.data.id, organizationId, userId, options).catch(console.error);

      return {
        success: true,
        message: "Compliance report generation started",
        data: report.data
      };
    } catch (error: any) {
      console.error("Error in generateComplianceReport:", error);
      return {
        success: false,
        message: "Failed to generate compliance report",
        error: error.message
      };
    }
  }

  /**
   * Create audit log entry
   */
  async createAuditLog(data: {
    action: AuditAction;
    resource: AuditResource;
    resourceId?: string;
    organizationId?: number;
    userId?: number;
    metadata?: Record<string, any>;
    description?: string;
    status?: AuditStatus;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    requestData?: Record<string, any>;
    responseData?: Record<string, any>;
    responseTime?: number;
  }): Promise<AuditLog> {
    try {
      const log = this.auditLogRepo.create({
        ...data,
        status: data.status || AuditStatus.SUCCESS,
        createdAt: new Date()
      });

      return await this.auditLogRepo.save(log);
    } catch (error) {
      console.error("Error creating audit log:", error);
      throw error;
    }
  }

  /**
   * Create security event
   */
  async createSecurityEvent(data: {
    type: SecurityEventType;
    severity: SecurityEventSeverity;
    title: string;
    description?: string;
    source?: any;
    details?: any;
    userId?: number;
    organizationId?: number;
  }): Promise<SecurityEvent> {
    try {
      const event = this.securityEventRepo.create({
        ...data,
        status: SecurityEventStatus.NEW,
        count: 1,
        createdAt: new Date()
      });

      return await this.securityEventRepo.save(event);
    } catch (error) {
      console.error("Error creating security event:", error);
      throw error;
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Calculate security score based on various metrics
   */
  private calculateSecurityScore(metrics: {
    mfaAdoptionRate: number;
    failedLoginRatio: number;
    criticalEvents: number;
    unresolvedEvents: number;
    complianceScore: number;
  }): number {
    const mfaScore = metrics.mfaAdoptionRate * 0.25;
    const loginScore = Math.max(0, 100 - metrics.failedLoginRatio) * 0.2;
    const eventScore = Math.max(0, 100 - (metrics.criticalEvents * 5)) * 0.2;
    const resolutionScore = Math.max(0, 100 - (metrics.unresolvedEvents * 2)) * 0.15;
    const complianceScore = metrics.complianceScore * 0.2;

    return Math.round(mfaScore + loginScore + eventScore + resolutionScore + complianceScore);
  }

  /**
   * Get security grade based on score
   */
  private getSecurityGrade(score: number): string {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 75) return 'C+';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Generate event timeline data
   */
  private async generateEventTimeline(
    organizationId?: number,
    startDate?: Date
  ): Promise<any[]> {
    const timeline: any[] = [];
    const now = new Date();
    const start = startDate || subDays(now, 7);

    // Generate daily aggregates
    let currentDate = start;
    while (currentDate <= now) {
      const nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const [
        critical,
        high,
        medium,
        low
      ] = await Promise.all([
        this.securityEventRepo.count({
          where: {
            ...(organizationId ? { organizationId } : {}),
            severity: SecurityEventSeverity.CRITICAL,
            createdAt: Between(currentDate, nextDate)
          }
        }),
        this.securityEventRepo.count({
          where: {
            ...(organizationId ? { organizationId } : {}),
            severity: SecurityEventSeverity.HIGH,
            createdAt: Between(currentDate, nextDate)
          }
        }),
        this.securityEventRepo.count({
          where: {
            ...(organizationId ? { organizationId } : {}),
            severity: SecurityEventSeverity.MEDIUM,
            createdAt: Between(currentDate, nextDate)
          }
        }),
        this.securityEventRepo.count({
          where: {
            ...(organizationId ? { organizationId } : {}),
            severity: SecurityEventSeverity.LOW,
            createdAt: Between(currentDate, nextDate)
          }
        })
      ]);

      timeline.push({
        date: format(currentDate, 'yyyy-MM-dd'),
        critical,
        high,
        medium,
        low,
        total: critical + high + medium + low
      });

      currentDate = nextDate;
    }

    return timeline;
  }

  /**
   * Generate security alerts
   */
  private async generateSecurityAlerts(organizationId?: number): Promise<any[]> {
    const alerts = [];
    const now = new Date();
    const lastHour = subHours(now, 1);

    // Check for critical events in last hour
    const criticalEvents = await this.securityEventRepo.count({
      where: {
        ...(organizationId ? { organizationId } : {}),
        severity: SecurityEventSeverity.CRITICAL,
        createdAt: MoreThanOrEqual(lastHour)
      }
    });

    if (criticalEvents > 0) {
      alerts.push({
        id: `alert-${Date.now()}-1`,
        severity: 'critical',
        title: 'Critical Security Events Detected',
        message: `${criticalEvents} critical event${criticalEvents > 1 ? 's' : ''} in the last hour`,
        timestamp: now,
        actionable: true
      });
    }

    // Check for multiple failed logins
    const failedLogins = await this.auditLogRepo.count({
      where: {
        ...(organizationId ? { organizationId } : {}),
        action: AuditAction.LOGIN_FAILED,
        createdAt: MoreThanOrEqual(lastHour)
      }
    });

    if (failedLogins > 10) {
      alerts.push({
        id: `alert-${Date.now()}-2`,
        severity: 'high',
        title: 'Multiple Failed Login Attempts',
        message: `${failedLogins} failed login attempts in the last hour`,
        timestamp: now,
        actionable: true
      });
    }

    // Check MFA adoption
    if (!organizationId) {
      const totalUsers = await this.userRepo.count();
      const mfaUsers = await this.userRepo.count({ where: { is2FAEnabled: true } });
      const mfaRate = (mfaUsers / totalUsers) * 100;

      if (mfaRate < 50) {
        alerts.push({
          id: `alert-${Date.now()}-3`,
          severity: 'medium',
          title: 'Low MFA Adoption',
          message: `Only ${mfaRate.toFixed(1)}% of users have MFA enabled`,
          timestamp: now,
          actionable: true
        });
      }
    }

    return alerts;
  }

  /**
   * Generate security recommendations
   */
  private generateSecurityRecommendations(metrics: any): string[] {
    const recommendations = [];

    if (metrics.mfaAdoptionRate < 0.8) {
      recommendations.push('Enable Multi-Factor Authentication (MFA) for all users');
    }

    if (metrics.failedLoginRatio > 0.1) {
      recommendations.push('Implement account lockout policies after 5 failed attempts');
    }

    if (metrics.criticalEvents > 0) {
      recommendations.push('Review and investigate critical security events immediately');
    }

    if (metrics.unresolvedEvents > 5) {
      recommendations.push('Address pending security events to reduce risk exposure');
    }

    if (metrics.complianceScore < 0.7) {
      recommendations.push('Schedule compliance audit to address regulatory requirements');
    }

    if (recommendations.length === 0) {
      recommendations.push('Security posture is strong - continue regular monitoring');
    }

    return recommendations;
  }

  /**
   * Process compliance report generation asynchronously
   */
  private async processComplianceReportGeneration(
    reportId: number,
    organizationId: number,
    userId: number,
    options?: any
  ): Promise<void> {
    try {
      // Simulate report generation with real data
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Generate findings based on actual data
      const findings = await this.generateComplianceFindings(organizationId, options?.type);
      
      // Calculate scores
      const totalScore = findings.reduce((sum, f) => sum + f.severity === 'critical' ? 0 : 
                          f.severity === 'high' ? 60 : f.severity === 'medium' ? 80 : 100, 0) / findings.length;

      // Update report with generated data
      await this.complianceRepo.update(reportId, {
        status: ComplianceStatus.COMPLETED,
        overallScore: Math.round(totalScore),
        findings,
        sections: await this.generateComplianceSections(organizationId, options?.type),
        recommendations: this.generateComplianceRecommendations(findings),
        updatedAt: new Date()
      });

    } catch (error) {
      console.error("Error generating compliance report:", error);
      await this.complianceRepo.update(reportId, {
        status: ComplianceStatus.FAILED,
        updatedAt: new Date()
      });
    }
  }

  /**
   * Generate compliance findings based on actual data
   */
  private async generateComplianceFindings(
    organizationId: number,
    type?: ComplianceType
  ): Promise<any[]> {
    const findings = [];
    const now = new Date();

    // Check user security settings
    const users = await this.userRepo.find({ where: { organizationId } });
    const usersWithoutMFA = users.filter(u => !u.is2FAEnabled);

    if (usersWithoutMFA.length > 0) {
      findings.push({
        id: `finding-${Date.now()}-1`,
        type: 'authentication',
        severity: 'high',
        title: 'Users without MFA',
        description: `${usersWithoutMFA.length} users do not have Multi-Factor Authentication enabled`,
        recommendation: 'Enable MFA for all user accounts',
        affectedItems: usersWithoutMFA.map(u => u.email),
        status: 'open',
        createdAt: now
      });
    }

    // Check for inactive users
    const inactiveThreshold = subDays(now, 90);
    const inactiveUsers = users.filter(u => !u.lastLoginAt || u.lastLoginAt < inactiveThreshold);

    if (inactiveUsers.length > 0) {
      findings.push({
        id: `finding-${Date.now()}-2`,
        type: 'access_control',
        severity: 'medium',
        title: 'Inactive User Accounts',
        description: `${inactiveUsers.length} user accounts inactive for over 90 days`,
        recommendation: 'Review and disable inactive user accounts',
        affectedItems: inactiveUsers.map(u => u.email),
        status: 'open',
        createdAt: now
      });
    }

    return findings;
  }

  /**
   * Generate compliance sections
   */
  private async generateComplianceSections(
    organizationId: number,
    type?: ComplianceType
  ): Promise<any[]> {
    return [
      {
        id: 'auth-security',
        title: 'Authentication Security',
        description: 'Assessment of authentication mechanisms and policies',
        status: 'partial',
        score: 75,
        weight: 25,
        findings: []
      },
      {
        id: 'data-protection',
        title: 'Data Protection',
        description: 'Evaluation of data encryption and protection measures',
        status: 'passed',
        score: 90,
        weight: 30,
        findings: []
      },
      {
        id: 'access-control',
        title: 'Access Control',
        description: 'Review of user access controls and permissions',
        status: 'partial',
        score: 70,
        weight: 25,
        findings: []
      },
      {
        id: 'audit-logging',
        title: 'Audit Logging',
        description: 'Assessment of audit trail completeness and integrity',
        status: 'passed',
        score: 95,
        weight: 20,
        findings: []
      }
    ];
  }

  /**
   * Generate compliance recommendations
   */
  private generateComplianceRecommendations(findings: any[]): string[] {
    const recommendations = [];

    const criticalFindings = findings.filter(f => f.severity === 'critical');
    const highFindings = findings.filter(f => f.severity === 'high');
    const mediumFindings = findings.filter(f => f.severity === 'medium');

    if (criticalFindings.length > 0) {
      recommendations.push(`Address ${criticalFindings.length} critical findings immediately`);
    }

    if (highFindings.length > 0) {
      recommendations.push(`Resolve ${highFindings.length} high-severity issues within 30 days`);
    }

    if (mediumFindings.length > 0) {
      recommendations.push(`Plan remediation for ${mediumFindings.length} medium-severity findings`);
    }

    recommendations.push('Schedule regular security awareness training for all users');
    recommendations.push('Implement automated security monitoring and alerting');

    return recommendations;
  }
}

export default new SecurityService();