import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import UpdatedLoanDisbursementService from "../services/loanDisbursementService";
import dbConnection from "../db";
import { Loan, LoanStatus, RepaymentModality } from "../entities/Loan";
import { LoanDisbursement } from "../entities/LoanDisbursement";
import { Repository } from "typeorm";

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

class UpdatedLoanDisbursementController {
  private loanRepository: Repository<Loan>;
  private disbursementRepository: Repository<LoanDisbursement>;

  constructor() {
    // Initialize repositories immediately
    this.loanRepository = dbConnection.getRepository(Loan);
    this.disbursementRepository = dbConnection.getRepository(LoanDisbursement);

    // Bind methods to preserve 'this' context
    this.getDisbursedLoans = this.getDisbursedLoans.bind(this);
    this.getDisbursedLoanDetails = this.getDisbursedLoanDetails.bind(this);
    this.getDisbursedLoansStats = this.getDisbursedLoansStats.bind(this);
    this.createThreeStepDisbursement = this.createThreeStepDisbursement.bind(this);
  }

  /**
   * GET: Fetch disbursed loans with pagination, search, and filters
   */
  async getDisbursedLoans(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const {
        page = 1,
        limit = 10,
        search = "",
        dateFrom,
        dateTo,
        loanOfficer,
        branch,
        sortBy = "disbursementDate_desc",
        borrowerType,
        minAmount,
        maxAmount,
      } = req.query;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Create query builder
      const queryBuilder = this.loanRepository
        .createQueryBuilder("loan")
        .leftJoinAndSelect("loan.borrower", "borrower")
        .leftJoinAndSelect("loan.collaterals", "collaterals")
        .leftJoinAndSelect("loan.analysisReports", "analysisReports")
        .leftJoinAndSelect("loan.repaymentSchedules", "repaymentSchedules")
        .leftJoinAndSelect("loan.transactions", "transactions")
        .leftJoinAndSelect("loan.guarantors", "guarantors")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...statuses)", {
          statuses: [
            LoanStatus.DISBURSED,
            LoanStatus.PERFORMING,
            LoanStatus.WATCH,
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS
          ]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true });

      // Apply search filters
      if (search) {
        const searchTerm = `%${(search as string).toLowerCase()}%`;
        queryBuilder.andWhere(
          `(
            LOWER(loan.loanId) LIKE :searchTerm OR
            LOWER(borrower.firstName) LIKE :searchTerm OR
            LOWER(borrower.lastName) LIKE :searchTerm OR
            LOWER(borrower.nationalId) LIKE :searchTerm OR
            LOWER(borrower.primaryPhone) LIKE :searchTerm OR
            LOWER(loan.purposeOfLoan) LIKE :searchTerm OR
            LOWER(loan.loanOfficer) LIKE :searchTerm OR
            loan.institutionProfile ->> 'institutionName' ILIKE :searchTerm OR
            loan.institutionProfile ->> 'contactPerson' ILIKE :searchTerm
          )`,
          { searchTerm }
        );
      }

      // Apply date filters
      if (dateFrom) {
        queryBuilder.andWhere("loan.disbursementDate >= :dateFrom", {
          dateFrom: new Date(dateFrom as string),
        });
      }

      if (dateTo) {
        const toDate = new Date(dateTo as string);
        toDate.setHours(23, 59, 59, 999);
        queryBuilder.andWhere("loan.disbursementDate <= :dateTo", {
          dateTo,
        });
      }

      // Apply loan officer filter
      if (loanOfficer) {
        queryBuilder.andWhere("LOWER(loan.loanOfficer) LIKE :loanOfficer", {
          loanOfficer: `%${(loanOfficer as string).toLowerCase()}%`,
        });
      }

      // Apply branch filter
      if (branch) {
        queryBuilder.andWhere("LOWER(loan.branchName) LIKE :branch", {
          branch: `%${(branch as string).toLowerCase()}%`,
        });
      }

      // Apply borrower type filter
      if (borrowerType) {
        queryBuilder.andWhere("loan.borrowerType = :borrowerType", {
          borrowerType,
        });
      }

      // Apply amount filters
      if (minAmount) {
        queryBuilder.andWhere("loan.disbursedAmount >= :minAmount", {
          minAmount: parseFloat(minAmount as string),
        });
      }

      if (maxAmount) {
        queryBuilder.andWhere("loan.disbursedAmount <= :maxAmount", {
          maxAmount: parseFloat(maxAmount as string),
        });
      }

      // Apply sorting
      switch (sortBy) {
        case "disbursementDate_desc":
          queryBuilder.orderBy("loan.disbursementDate", "DESC");
          break;
        case "disbursementDate_asc":
          queryBuilder.orderBy("loan.disbursementDate", "ASC");
          break;
        case "amount_desc":
          queryBuilder.orderBy("loan.disbursedAmount", "DESC");
          break;
        case "amount_asc":
          queryBuilder.orderBy("loan.disbursedAmount", "ASC");
          break;
        case "borrowerName_asc":
          queryBuilder
            .addSelect(`
              CASE 
                WHEN loan.borrowerType = 'individual' THEN CONCAT(borrower.firstName, ' ', borrower.lastName)
                WHEN loan.borrowerType = 'institution' THEN loan.institutionProfile ->> 'institutionName'
                ELSE ''
              END
            `, "borrowerName")
            .orderBy("borrowerName", "ASC");
          break;
        case "daysOverdue_desc":
          queryBuilder.orderBy("loan.daysInArrears", "DESC");
          break;
        default:
          queryBuilder.orderBy("loan.createdAt", "DESC");
      }

      // Get total count for pagination
      const total = await queryBuilder.getCount();

      // Apply pagination
      queryBuilder.skip(skip).take(limitNum);

      // Execute query
      const loans = await queryBuilder.getMany();

      // Transform loans to include performance metrics
      const transformedLoans = loans.map((loan) => {
        const loanObj = loan as any;

        // Add performance metrics
        loanObj.performanceMetrics = loan.getPerformanceMetrics();

        // Add collateral coverage ratio
        loanObj.collateralCoverageRatio = loan.getCollateralCoverageRatio();

        // Add classification category
        loanObj.classificationCategory = loan.getClassificationCategory();

        // Add latest analysis report if exists
        loanObj.latestAnalysisReport = loan.getLatestAnalysisReport();

        // Calculate days since disbursement
        if (loan.disbursementDate) {
          const today = new Date();
          const disbursementDate = new Date(loan.disbursementDate);
          const diffTime = Math.abs(today.getTime() - disbursementDate.getTime());
          loanObj.daysSinceDisbursement = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        return loanObj;
      });

      res.status(200).json({
        success: true,
        data: transformedLoans,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
        filters: {
          search,
          dateFrom,
          dateTo,
          loanOfficer,
          branch,
          sortBy,
          borrowerType,
          minAmount,
          maxAmount,
        },
      });

    } catch (error: any) {
      console.error("Error fetching disbursed loans:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch disbursed loans",
        error: error.message,
      });
    }
  }

  /**
   * GET: Fetch single disbursed loan details
   */
  async getDisbursedLoanDetails(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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

      const loan = await this.loanRepository
        .createQueryBuilder("loan")
        .leftJoinAndSelect("loan.borrower", "borrower")
        .leftJoinAndSelect("loan.collaterals", "collaterals")
        .leftJoinAndSelect("loan.analysisReports", "analysisReports")
        .leftJoinAndSelect("loan.repaymentSchedules", "repaymentSchedules")
        .leftJoinAndSelect("loan.transactions", "transactions")
        .leftJoinAndSelect("loan.guarantors", "guarantors")
        .leftJoinAndSelect("loan.classifications", "classifications")
        .leftJoinAndSelect("loan.reviews", "reviews")
        .leftJoinAndSelect("loan.bouncedCheques", "bouncedCheques")
        .leftJoin("loan.repaymentSchedules", "schedule")
        .addSelect([
          "schedule.id",
          "schedule.installmentNumber",
          "schedule.dueDate",
          "schedule.duePrincipal",
          "schedule.dueInterest",
          "schedule.dueTotal",
          "schedule.paidPrincipal",
          "schedule.paidInterest",
          "schedule.paidTotal",
          "schedule.status",
          "schedule.paymentStatus",
          "schedule.isPaid",
          "schedule.delayedDays",
          "schedule.daysOverdue",
        ])
        .where("loan.id = :loanId", { loanId })
        .andWhere("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .getOne();

      if (!loan) {
        res.status(404).json({
          success: false,
          message: "Loan not found",
        });
        return;
      }

      // Check if loan is disbursed
      if (![
        LoanStatus.DISBURSED,
        LoanStatus.PERFORMING,
        LoanStatus.WATCH,
        LoanStatus.SUBSTANDARD,
        LoanStatus.DOUBTFUL,
        LoanStatus.LOSS
      ].includes(loan.status)) {
        res.status(400).json({
          success: false,
          message: "Loan is not disbursed",
        });
        return;
      }

      // Get loan disbursement details
      const disbursement = await this.disbursementRepository.findOne({
        where: {
          loanId: loan.id,
          organizationId,
          isActive: true,
        },
      });

      // Transform loan with additional data
      const loanObj = loan as any;
      loanObj.performanceMetrics = loan.getPerformanceMetrics();
      loanObj.collateralBreakdown = loan.getCollateralBreakdown();
      loanObj.collateralCoverageRatio = loan.getCollateralCoverageRatio();
      loanObj.classificationCategory = loan.getClassificationCategory();
      loanObj.provisionRequired = loan.calculateProvisionRequired();
      loanObj.netExposure = loan.calculateNetExposure();
      loanObj.latestAnalysisReport = loan.getLatestAnalysisReport();
      loanObj.disbursementDetails = disbursement;

      // Calculate repayment summary
      if (loan.repaymentSchedules && loan.repaymentSchedules.length > 0) {
        const schedules = loan.repaymentSchedules;
        const totalInstallments = schedules.length;
        const paidInstallments = schedules.filter(s => s.isPaid).length;
        const overdueInstallments = schedules.filter(s =>
          !s.isPaid && s.status === 'overdue'
        ).length;
        const totalPaid = schedules.reduce((sum, s) => sum + (s.paidTotal || 0), 0);
        const totalDue = schedules.reduce((sum, s) => sum + (s.dueTotal || 0), 0);

        loanObj.repaymentSummary = {
          totalInstallments,
          paidInstallments,
          overdueInstallments,
          pendingInstallments: totalInstallments - paidInstallments,
          paymentCompletionRate: totalInstallments > 0 ? (paidInstallments / totalInstallments) * 100 : 0,
          amountPaid: totalPaid,
          amountDue: totalDue,
          amountOutstanding: totalDue - totalPaid,
        };
      }

      res.status(200).json({
        success: true,
        data: loanObj,
      });

    } catch (error: any) {
      console.error("Error fetching disbursed loan details:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch disbursed loan details",
        error: error.message,
      });
    }
  }

  /**
   * GET: Get disbursed loans statistics
   * Fixed version that properly handles the stats endpoint
   */
  async getDisbursedLoansStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const organizationId = parseInt(req.params.organizationId);

      // Validate organization ID
      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      console.log('📊 Fetching disbursed loans statistics for org:', organizationId);

      // Base query for disbursed loans
      const queryBuilder = this.loanRepository
        .createQueryBuilder("loan")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...statuses)", {
          statuses: [
            LoanStatus.DISBURSED,
            LoanStatus.PERFORMING,
            LoanStatus.WATCH,
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS
          ]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true });

      // Get total counts and amounts
      const totalLoans = await queryBuilder.getCount();

      const totalAmountResult = await queryBuilder
        .select("COALESCE(SUM(loan.disbursedAmount), 0)", "total")
        .getRawOne();
      const totalAmount = parseFloat(totalAmountResult?.total || 0);

      // Get status breakdown
      const statusBreakdown = await this.loanRepository
        .createQueryBuilder("loan")
        .select("loan.status", "status")
        .addSelect("COUNT(*)", "count")
        .addSelect("COALESCE(SUM(loan.disbursedAmount), 0)", "totalAmount")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...statuses)", {
          statuses: [
            LoanStatus.DISBURSED,
            LoanStatus.PERFORMING,
            LoanStatus.WATCH,
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS
          ]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .groupBy("loan.status")
        .getRawMany();

      // Get performing vs non-performing counts
      const performingCount = await this.loanRepository
        .createQueryBuilder("loan")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...performing)", {
          performing: [LoanStatus.DISBURSED, LoanStatus.PERFORMING]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .getCount();

      const nonPerformingCount = await this.loanRepository
        .createQueryBuilder("loan")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...nonPerforming)", {
          nonPerforming: [
            LoanStatus.WATCH,
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS
          ]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .getCount();

      // Get overdue loans count
      const overdueCount = await this.loanRepository
        .createQueryBuilder("loan")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...statuses)", {
          statuses: [
            LoanStatus.DISBURSED,
            LoanStatus.PERFORMING,
            LoanStatus.WATCH,
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS
          ]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .andWhere("loan.daysInArrears > :days", { days: 0 })
        .getCount();

      // Get average loan amount
      const avgAmountResult = await this.loanRepository
        .createQueryBuilder("loan")
        .select("AVG(loan.disbursedAmount)", "average")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...statuses)", {
          statuses: [
            LoanStatus.DISBURSED,
            LoanStatus.PERFORMING,
            LoanStatus.WATCH,
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS
          ]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .getRawOne();
      const avgAmount = parseFloat(avgAmountResult?.average || 0);

      // Get portfolio at risk (PAR)
      const parResult = await this.loanRepository
        .createQueryBuilder("loan")
        .select("COALESCE(SUM(loan.outstandingPrincipal + loan.accruedInterestToDate), 0)", "totalPar")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...parStatuses)", {
          parStatuses: [
            LoanStatus.WATCH,
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS
          ]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .getRawOne();
      const parAmount = parseFloat(parResult?.totalPar || 0);

      const totalOutstandingResult = await this.loanRepository
        .createQueryBuilder("loan")
        .select("COALESCE(SUM(loan.outstandingPrincipal + loan.accruedInterestToDate), 0)", "totalOutstanding")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...statuses)", {
          statuses: [
            LoanStatus.DISBURSED,
            LoanStatus.PERFORMING,
            LoanStatus.WATCH,
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS
          ]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .getRawOne();
      const totalOutstanding = parseFloat(totalOutstandingResult?.totalOutstanding || 0);

      const portfolioAtRisk = totalOutstanding > 0
        ? (parAmount / totalOutstanding) * 100
        : 0;

      // Get disbursement trend (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const disbursementTrend = await this.loanRepository
        .createQueryBuilder("loan")
        .select("TO_CHAR(loan.disbursementDate, 'YYYY-MM')", "month")
        .addSelect("COUNT(*)", "count")
        .addSelect("COALESCE(SUM(loan.disbursedAmount), 0)", "amount")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status IN (:...statuses)", {
          statuses: [
            LoanStatus.DISBURSED,
            LoanStatus.PERFORMING,
            LoanStatus.WATCH,
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS
          ]
        })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .andWhere("loan.disbursementDate >= :date", { date: sixMonthsAgo })
        .groupBy("TO_CHAR(loan.disbursementDate, 'YYYY-MM')")
        .orderBy("month", "ASC")
        .getRawMany();

      // Format status breakdown
      const formattedStatusBreakdown = statusBreakdown.reduce((acc, item) => {
        acc[item.status] = {
          count: parseInt(item.count),
          amount: parseFloat(item.totalamount || 0)
        };
        return acc;
      }, {} as Record<string, any>);

      console.log('✅ Successfully fetched disbursed loans statistics');

      res.status(200).json({
        success: true,
        data: {
          totalLoans,
          totalDisbursedAmount: Number(totalAmount.toFixed(2)),
          averageLoanAmount: Number(avgAmount.toFixed(2)),
          performingLoans: performingCount,
          nonPerformingLoans: nonPerformingCount,
          overdueLoans: overdueCount,
          portfolioAtRisk: Number(portfolioAtRisk.toFixed(2)),
          statusBreakdown: formattedStatusBreakdown,
          disbursementTrend: disbursementTrend.map(item => ({
            month: item.month,
            count: parseInt(item.count),
            amount: parseFloat(item.amount || 0)
          })),
          lastCalculated: new Date().toISOString(),
        },
      });

    } catch (error: any) {
      console.error('❌ Error fetching disbursed loans stats:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch disbursed loans statistics",
        error: error.message,
      });
    }
  }
  async createThreeStepDisbursement(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log('=== THREE-STEP DISBURSEMENT CONTROLLER START ===');

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

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      // Validate required files
      if (!files?.notarisedContractFile || files.notarisedContractFile.length === 0) {
        res.status(400).json({
          success: false,
          message: "Notarised contract file is required"
        });
        return;
      }

      if (!files?.notarisedAOMAFile || files.notarisedAOMAFile.length === 0) {
        res.status(400).json({
          success: false,
          message: "Notarised AOMA file is required"
        });
        return;
      }

      if (!files?.rdbFeesFile || files.rdbFeesFile.length === 0) {
        res.status(400).json({
          success: false,
          message: "RDB fees file is required"
        });
        return;
      }

      if (!files?.proofOfDisbursementFile || files.proofOfDisbursementFile.length === 0) {
        res.status(400).json({
          success: false,
          message: "Proof of disbursement file is required"
        });
        return;
      }

      const disbursementData = {
        borrowerAccountNumber: req.body.borrowerAccountNumber,

        // Step 2: Contract Signature
        notaryName: req.body.notaryName,
        notarizationDate: req.body.notarizationDate,
        notaryLicenceNumber: req.body.notaryLicenceNumber,
        notaryTelephone: req.body.notaryTelephone,
        addressDistrict: req.body.addressDistrict,
        addressSector: req.body.addressSector,
        notarisedContractFile: files.notarisedContractFile[0],

        // Step 3: Mortgage Registration
        notarisedAOMAFile: files.notarisedAOMAFile[0],
        rdbFeesFile: files.rdbFeesFile[0],

        // Step 4: Loan Disbursement
        commissionRate: parseFloat(req.body.commissionRate),
        insurancePolicyFees: req.body.insurancePolicyFees ? parseFloat(req.body.insurancePolicyFees) : undefined,
        fireInsurancePolicyFees: req.body.fireInsurancePolicyFees ? parseFloat(req.body.fireInsurancePolicyFees) : undefined,
        otherFees: req.body.otherFees ? parseFloat(req.body.otherFees) : undefined,
        proofOfDisbursementFile: files.proofOfDisbursementFile[0],
        repaymentModality: req.body.repaymentModality as RepaymentModality,
        singlePaymentMonths: req.body.singlePaymentMonths ? parseInt(req.body.singlePaymentMonths) : undefined,
        customSchedule: req.body.customSchedule ? JSON.parse(req.body.customSchedule) : undefined,
        paymentFrequency: req.body.paymentFrequency
      };

      const result = await UpdatedLoanDisbursementService.createThreeStepDisbursement(
        disbursementData,
        organizationId,
        userId
      );

      if (result.success) {
        console.log('✅ Three-step disbursement completed successfully');
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Three-step disbursement controller error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while processing three-step disbursement",
        error: error.message,
      });
    }
  }
}

// Export as singleton instance
const updatedLoanDisbursementController = new UpdatedLoanDisbursementController();
export default updatedLoanDisbursementController;