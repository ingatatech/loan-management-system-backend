import { Repository } from "typeorm";
import { 
  LoanAnalysisReport, 
  ReportType, 
  ReportStatus,
  LoanApplicationRequirements,
  ApprovalConditions,
  RejectionReasons
} from "../entities/LoanAnalysisReport";
import { Loan, BorrowerType } from "../entities/Loan";
import { User, UserRole } from "../entities/User";
import { Organization } from "../entities/Organization";
import dbConnection from "../db";
import { UploadToCloud } from "../helpers/cloud";

export interface CreateAnalysisReportRequest {
  loanId: number;
  reportType: ReportType;
  introductionMessage: string;
  approveMessage?: string;
  approvalConditions?: ApprovalConditions;
  rejectMessage?: string;
  rejectionReasons?: RejectionReasons;
  additionalNotes?: string;
  internalRemarks?: string;
  // ✅ NEW: Signature files
  loanOfficerSignature?: Express.Multer.File;
  managingDirectorSignature?: Express.Multer.File;
  loanOfficerName?: string;
  managingDirectorName?: string;
}

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export class LoanAnalysisReportService {
  private reportRepository: Repository<LoanAnalysisReport>;
  private loanRepository: Repository<Loan>;
  private userRepository: Repository<User>;
  private organizationRepository: Repository<Organization>;

  constructor() {
    this.reportRepository = dbConnection.getRepository(LoanAnalysisReport);
    this.loanRepository = dbConnection.getRepository(Loan);
    this.userRepository = dbConnection.getRepository(User);
    this.organizationRepository = dbConnection.getRepository(Organization);
  }

  async createAnalysisReport(
    data: CreateAnalysisReportRequest,
    organizationId: number,
    createdBy: number
  ): Promise<ServiceResponse<LoanAnalysisReport>> {
    const queryRunner = dbConnection.createQueryRunner();
    
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      console.log('🔍 Creating loan analysis report with signatures...');

      // Find the loan
      const loan = await queryRunner.manager.findOne(Loan, {
        where: { id: data.loanId, organizationId },
        relations: ['borrower', 'organization']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      // Validate organization
      const organization = await queryRunner.manager.findOne(Organization, {
        where: { id: organizationId }
      });

      if (!organization) {
        throw new Error("Organization not found");
      }

      // Validate report type matches with required data
      if (data.reportType === ReportType.APPROVE) {
        if (!data.approveMessage || !data.approvalConditions) {
          throw new Error("Approval message and conditions are required for approval reports");
        }
        
        const conditions = data.approvalConditions;
        if (!conditions.approvedAmount || conditions.approvedAmount <= 0) {
          throw new Error("Valid approved amount is required");
        }
        if (!conditions.repaymentPeriod || conditions.repaymentPeriod <= 0) {
          throw new Error("Valid repayment period is required");
        }
        if (!conditions.paymentModality) {
          throw new Error("Payment modality is required");
        }
        if (conditions.interestRate === undefined || conditions.interestRate < 0) {
          throw new Error("Valid interest rate is required");
        }
      }

      if (data.reportType === ReportType.REJECT) {
        if (!data.rejectMessage || !data.rejectionReasons) {
          throw new Error("Rejection message and reasons are required for rejection reports");
        }
        
        const reasons = data.rejectionReasons;
        if (!reasons.primaryReason) {
          throw new Error("Primary rejection reason is required");
        }
        if (!reasons.detailedReasons || reasons.detailedReasons.length === 0) {
          throw new Error("At least one detailed rejection reason is required");
        }
      }

      // Get applicant name based on borrower type
      const applicantName = loan.borrowerType === BorrowerType.INSTITUTION
        ? (loan.institutionProfile?.institutionName || 'Institution Borrower')
        : (loan.borrower?.fullName || 'Individual Borrower');

      const applicantType = loan.borrowerType === BorrowerType.INSTITUTION 
        ? 'institution' 
        : 'individual';

      // Build application requirements from loan data
      const applicationRequirements: LoanApplicationRequirements = {
        requestedAmount: loan.disbursedAmount,
        loanPeriod: loan.termInMonths || 
          (loan.paymentPeriod ? parseInt(loan.paymentPeriod.replace('_', '')) : 12),
        loanPeriodUnit: 'months',
        paymentModality: loan.preferredPaymentFrequency || 'monthly',
        fundingPurpose: loan.purposeOfLoan,
        submissionDate: loan.createdAt
      };

      // Generate unique report ID
      const reportId = `LAR${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // ✅ NEW: Handle signature uploads
      let loanOfficerSignatureUrl: string | null = null;
      let managingDirectorSignatureUrl: string | null = null;

      if (data.loanOfficerSignature) {
        console.log('☁️  Uploading loan officer signature...');
        const uploadResult = await UploadToCloud(data.loanOfficerSignature);
        loanOfficerSignatureUrl = uploadResult.secure_url;
        console.log('✅ Loan officer signature uploaded');
      }

      if (data.managingDirectorSignature) {
        console.log('☁️  Uploading managing director signature...');
        const uploadResult = await UploadToCloud(data.managingDirectorSignature);
        managingDirectorSignatureUrl = uploadResult.secure_url;
        console.log('✅ Managing director signature uploaded');
      }

      // ✅ Determine if signatures are provided
      const isLoanOfficerSigned = !!loanOfficerSignatureUrl;
      const isManagingDirectorSigned = !!managingDirectorSignatureUrl;
      const isFinalized = isLoanOfficerSigned && isManagingDirectorSigned;

      // ✅ Determine status
      let status = ReportStatus.DRAFT;
      if (isFinalized) {
        status = ReportStatus.FINALIZED;
      } else if (isLoanOfficerSigned && !isManagingDirectorSigned) {
        status = ReportStatus.PENDING_MANAGING_DIRECTOR;
      } else if (!isLoanOfficerSigned) {
        status = ReportStatus.PENDING_LOAN_OFFICER;
      }

      // Create report entity
      const report = queryRunner.manager.create(LoanAnalysisReport, {
        reportId,
        loanId: loan.id,
        reportType: data.reportType,
        status,
        applicantName,
        applicantType,
        introductionMessage: data.introductionMessage,
        applicationRequirements,
        approveMessage: data.approveMessage || null,
        approvalConditions: data.approvalConditions || null,
        rejectMessage: data.rejectMessage || null,
        rejectionReasons: data.rejectionReasons || null,
        additionalNotes: data.additionalNotes || null,
        internalRemarks: data.internalRemarks || null,
        
        // ✅ NEW: Signature fields
        loanOfficerId: isLoanOfficerSigned ? createdBy : null,
        loanOfficerName: data.loanOfficerName || null,
        loanOfficerSignatureUrl,
        loanOfficerSignedAt: isLoanOfficerSigned ? new Date() : null,
        isLoanOfficerSigned,
        
        managingDirectorId: isManagingDirectorSigned ? createdBy : null,
        managingDirectorName: data.managingDirectorName || null,
        managingDirectorSignatureUrl,
        managingDirectorSignedAt: isManagingDirectorSigned ? new Date() : null,
        isManagingDirectorSigned,
        
        isFinalized,
        finalizedAt: isFinalized ? new Date() : null,
        finalizedBy: isFinalized ? createdBy : null,
        
        organizationId,
        createdBy,
        isActive: true
      });

      const savedReport = await queryRunner.manager.save(LoanAnalysisReport, report);

      await queryRunner.commitTransaction();

      console.log(`✅ Loan analysis report created: ${savedReport.reportId}`);
      if (isFinalized) {
        console.log('✅ Report automatically finalized with both signatures');
      }

      // Reload with relations
      const completeReport = await this.reportRepository.findOne({
        where: { id: savedReport.id },
        relations: ['loan', 'loan.borrower', 'organization']
      });

      return {
        success: true,
        message: `Loan analysis report created successfully${isFinalized ? ' and finalized' : ''}`,
        data: completeReport || savedReport
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("❌ Create analysis report error:", error);
      return {
        success: false,
        message: error.message || "Failed to create analysis report"
      };
    } finally {
      await queryRunner.release();
    }
  }

  // ✅ REMOVED: signReport method - no longer needed

  async getReportById(
    reportId: number,
    organizationId: number
  ): Promise<ServiceResponse<LoanAnalysisReport>> {
    try {
      const report = await this.reportRepository.findOne({
        where: { id: reportId, organizationId },
        relations: [
          'loan', 
          'loan.borrower', 
          'loan.collaterals',
          'loanOfficer', 
          'managingDirector', 
          'organization',
          'creator'
        ]
      });

      if (!report) {
        return {
          success: false,
          message: "Report not found"
        };
      }

      return {
        success: true,
        message: "Report retrieved successfully",
        data: report
      };

    } catch (error: any) {
      console.error("❌ Get report error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve report"
      };
    }
  }

  async getLoanReports(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse<LoanAnalysisReport[]>> {
    try {
      const reports = await this.reportRepository.find({
        where: { loanId, organizationId, isActive: true },
        relations: ['loanOfficer', 'managingDirector', 'creator'],
        order: { createdAt: 'DESC' }
      });

      return {
        success: true,
        message: `Found ${reports.length} report(s) for this loan`,
        data: reports
      };

    } catch (error: any) {
      console.error("❌ Get loan reports error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve loan reports"
      };
    }
  }

  async getAllReports(
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    filters?: {
      reportType?: ReportType;
      status?: ReportStatus;
      isFinalized?: boolean;
      search?: string;
    }
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const queryBuilder = this.reportRepository
        .createQueryBuilder('report')
        .leftJoinAndSelect('report.loan', 'loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('report.loanOfficer', 'loanOfficer')
        .leftJoinAndSelect('report.managingDirector', 'managingDirector')
        .where('report.organizationId = :organizationId', { organizationId })
        .andWhere('report.isActive = :isActive', { isActive: true });

      if (filters?.reportType) {
        queryBuilder.andWhere('report.reportType = :reportType', { 
          reportType: filters.reportType 
        });
      }

      if (filters?.status) {
        queryBuilder.andWhere('report.status = :status', { 
          status: filters.status 
        });
      }

      if (filters?.isFinalized !== undefined) {
        queryBuilder.andWhere('report.isFinalized = :isFinalized', { 
          isFinalized: filters.isFinalized 
        });
      }

      if (filters?.search) {
        queryBuilder.andWhere(
          '(report.reportId ILIKE :search OR ' +
          'report.applicantName ILIKE :search OR ' +
          'loan.loanId ILIKE :search)',
          { search: `%${filters.search}%` }
        );
      }

      const [reports, totalItems] = await queryBuilder
        .orderBy('report.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit);

      return {
        success: true,
        message: "Reports retrieved successfully",
        data: reports,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };

    } catch (error: any) {
      console.error("❌ Get all reports error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve reports"
      };
    }
  }

  async updateReport(
    reportId: number,
    updates: Partial<CreateAnalysisReportRequest>,
    organizationId: number,
    updatedBy: number
  ): Promise<ServiceResponse<LoanAnalysisReport>> {
    try {
      const report = await this.reportRepository.findOne({
        where: { id: reportId, organizationId }
      });

      if (!report) {
        return {
          success: false,
          message: "Report not found"
        };
      }

      if (report.isFinalized) {
        return {
          success: false,
          message: "Cannot update a finalized report"
        };
      }

      // Update allowed fields
      if (updates.introductionMessage !== undefined) {
        report.introductionMessage = updates.introductionMessage;
      }

      if (updates.approveMessage !== undefined) {
        report.approveMessage = updates.approveMessage;
      }

      if (updates.approvalConditions !== undefined) {
        report.approvalConditions = updates.approvalConditions;
      }

      if (updates.rejectMessage !== undefined) {
        report.rejectMessage = updates.rejectMessage;
      }

      if (updates.rejectionReasons !== undefined) {
        report.rejectionReasons = updates.rejectionReasons;
      }

      if (updates.additionalNotes !== undefined) {
        report.additionalNotes = updates.additionalNotes;
      }

      if (updates.internalRemarks !== undefined) {
        report.internalRemarks = updates.internalRemarks;
      }

      report.updatedBy = updatedBy;

      const savedReport = await this.reportRepository.save(report);

      console.log(`✅ Report updated: ${savedReport.reportId}`);

      return {
        success: true,
        message: "Report updated successfully",
        data: savedReport
      };

    } catch (error: any) {
      console.error("❌ Update report error:", error);
      return {
        success: false,
        message: error.message || "Failed to update report"
      };
    }
  }

  async deleteReport(
    reportId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const report = await this.reportRepository.findOne({
        where: { id: reportId, organizationId }
      });

      if (!report) {
        return {
          success: false,
          message: "Report not found"
        };
      }

      if (report.isFinalized) {
        return {
          success: false,
          message: "Cannot delete a finalized report"
        };
      }

      // Soft delete
      report.isActive = false;
      await this.reportRepository.save(report);

      console.log(`✅ Report soft deleted: ${report.reportId}`);

      return {
        success: true,
        message: "Report deleted successfully"
      };

    } catch (error: any) {
      console.error("❌ Delete report error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete report"
      };
    }
  }

  async getReportStatistics(
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const [
        totalReports,
        approvalReports,
        rejectionReports,
        finalizedReports,
        pendingReports
      ] = await Promise.all([
        this.reportRepository.count({ 
          where: { organizationId, isActive: true } 
        }),
        this.reportRepository.count({ 
          where: { organizationId, reportType: ReportType.APPROVE, isActive: true } 
        }),
        this.reportRepository.count({ 
          where: { organizationId, reportType: ReportType.REJECT, isActive: true } 
        }),
        this.reportRepository.count({ 
          where: { organizationId, isFinalized: true, isActive: true } 
        }),
        this.reportRepository.count({ 
          where: { organizationId, isFinalized: false, isActive: true } 
        })
      ]);

      return {
        success: true,
        message: "Statistics retrieved successfully",
        data: {
          totalReports,
          approvalReports,
          rejectionReports,
          finalizedReports,
          pendingReports,
          approvalRate: totalReports > 0 
            ? ((approvalReports / totalReports) * 100).toFixed(2) + '%'
            : '0%',
          rejectionRate: totalReports > 0 
            ? ((rejectionReports / totalReports) * 100).toFixed(2) + '%'
            : '0%',
          finalizationRate: totalReports > 0 
            ? ((finalizedReports / totalReports) * 100).toFixed(2) + '%'
            : '0%'
        }
      };

    } catch (error: any) {
      console.error("❌ Get statistics error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve statistics"
      };
    }
  }
}

export default new LoanAnalysisReportService();