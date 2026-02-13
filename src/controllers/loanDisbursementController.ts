
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import UpdatedLoanDisbursementService from "../services/loanDisbursementService";
import dbConnection from "../db";
import { Loan, LoanStatus, RepaymentModality } from "../entities/Loan";
import { LoanDisbursement } from "../entities/LoanDisbursement";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";
import { Repository } from "typeorm";

const DISBURSED_STATUSES = [
  LoanStatus.DISBURSED,
  LoanStatus.PERFORMING,
  LoanStatus.WATCH,
  LoanStatus.SUBSTANDARD,
  LoanStatus.DOUBTFUL,
  LoanStatus.LOSS
];
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
  private clientAccountRepository: Repository<ClientBorrowerAccount>;

  constructor() {
    this.loanRepository = dbConnection.getRepository(Loan);
    this.disbursementRepository = dbConnection.getRepository(LoanDisbursement);
    this.clientAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);

    this.getDisbursedLoans = this.getDisbursedLoans.bind(this);
    this.getDisbursedLoanDetails = this.getDisbursedLoanDetails.bind(this);
    this.getDisbursedLoansStats = this.getDisbursedLoansStats.bind(this);
    this.createThreeStepDisbursement = this.createThreeStepDisbursement.bind(this);
    this.getDisbursedLoansWithAccounts = this.getDisbursedLoansWithAccounts.bind(this);
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

      // Batch-fetch client accounts for loans that have clientAccountId
      let loanToAccountMap = new Map<number, ClientBorrowerAccount>();

      if (loans.length > 0) {
        const loanIds = loans.map((l) => l.id);
        const clientAccountIds = loans
          .map((l) => l.clientAccountId)
          .filter((id): id is number => id !== null && id !== undefined);

        let accountsQuery = this.clientAccountRepository
          .createQueryBuilder("account")
          .where("account.organizationId = :organizationId", { organizationId })
          .andWhere("account.isActive = :isActive", { isActive: true })
          .andWhere("account.loanId IN (:...loanIds)", { loanIds });

        if (clientAccountIds.length > 0) {
          accountsQuery = accountsQuery.orWhere(
            "account.id IN (:...clientAccountIds) AND account.organizationId = :organizationId",
            { clientAccountIds }
          );
        }

        const clientAccounts = await accountsQuery.getMany();

        clientAccounts.forEach((account) => {
          if (account.loanId) {
            loanToAccountMap.set(account.loanId, account);
          }
          loans.forEach((loan) => {
            if (
              loan.clientAccountId === account.id &&
              !loanToAccountMap.has(loan.id)
            ) {
              loanToAccountMap.set(loan.id, account);
            }
          });
        });
      }

      // Transform loans to include performance metrics and client account info
      const transformedLoans = loans.map((loan) => {
        const loanObj = loan as any;
        const clientAccount = loanToAccountMap.get(loan.id) ?? null;

        // Add client account information if exists
        if (clientAccount) {
          loanObj.clientAccountInfo = {
            id: clientAccount.id,
            accountNumber: clientAccount.accountNumber,
            borrowerType: clientAccount.borrowerType,
            borrowerNames: clientAccount.borrowerNames,
            nationalId: clientAccount.nationalId,
            profilePictureUrl: clientAccount.profilePictureUrl,
            institutionName: clientAccount.institutionName,
            tinNumber: clientAccount.tinNumber,
            businessNumber: clientAccount.businessNumber,
            profileRepresentative: clientAccount.profileRepresentative,
            createdAt: clientAccount.createdAt,
            isActive: clientAccount.isActive,
          };
        } else {
          loanObj.clientAccountInfo = null;
        }

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
        loanId: req.body.loanId ? parseInt(req.body.loanId) : undefined,
        applicationNumber: req.body.applicationNumber,
        approvedAmount: req.body.approvedAmount ? parseFloat(req.body.approvedAmount) : undefined,
        interestRate: req.body.interestRate ? parseFloat(req.body.interestRate) : undefined,
        repaymentPeriod: req.body.repaymentPeriod ? parseInt(req.body.repaymentPeriod) : undefined,
        repaymentPeriodUnit: req.body.repaymentPeriodUnit,
        notaryName: req.body.notaryName,
        notarizationDate: req.body.notarizationDate,
        notaryLicenceNumber: req.body.notaryLicenceNumber,
        notaryTelephone: req.body.notaryTelephone,
        addressDistrict: req.body.addressDistrict,
        addressSector: req.body.addressSector,
        notarisedContractFile: files.notarisedContractFile[0],
        notarisedAOMAFile: files.notarisedAOMAFile[0],
        rdbFeesFile: files.rdbFeesFile[0],
        commissionRate: parseFloat(req.body.commissionRate),
        insurancePolicyFees: req.body.insurancePolicyFees ? parseFloat(req.body.insurancePolicyFees) : undefined,
        fireInsurancePolicyFees: req.body.fireInsurancePolicyFees ? parseFloat(req.body.fireInsurancePolicyFees) : undefined,
        otherFees: req.body.otherFees ? parseFloat(req.body.otherFees) : undefined,
        proofOfDisbursementFile: files.proofOfDisbursementFile[0],
        repaymentModality: req.body.repaymentModality as RepaymentModality,
        singlePaymentMonths: req.body.singlePaymentMonths ? parseInt(req.body.singlePaymentMonths) : undefined,
        customSchedule: req.body.customSchedule ? JSON.parse(req.body.customSchedule) : undefined,
        paymentFrequency: req.body.paymentFrequency,
        interestMethod: req.body.repaymentModality !== "customized" ? req.body.interestMethod : undefined
      };

      const result = await UpdatedLoanDisbursementService.createThreeStepDisbursement(
        disbursementData,
        organizationId,
        userId
      );

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while processing three-step disbursement",
        error: error.message,
      });
    }
  }
/**
 * GET: Fetch disbursed loans with client accounts - ENHANCED with complete loan details
 */

async getDisbursedLoansWithAccounts(
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
      status,
      accountNumber,
      borrowerType,
      sortBy = "disbursementDate_desc",
    } = req.query;

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({ success: false, message: "Invalid organization ID" });
      return;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // ENHANCED: Build query with ALL necessary relations
    const queryBuilder = this.loanRepository
      .createQueryBuilder("loan")
      .leftJoinAndSelect("loan.borrower", "borrower")
      .leftJoinAndSelect("loan.repaymentSchedules", "repaymentSchedules")
      .leftJoinAndSelect("loan.collaterals", "collaterals")
      .leftJoinAndSelect("loan.transactions", "transactions")
      .leftJoinAndSelect("loan.analysisReports", "analysisReports") // Added for approval data
      .leftJoinAndSelect("loan.guarantors", "guarantors") // Added for guarantor info
      .leftJoinAndSelect("borrower.loans", "borrowerLoans") // For borrower history
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
          LOWER(loan."loanId") LIKE :searchTerm OR
          LOWER(borrower."firstName") LIKE :searchTerm OR
          LOWER(borrower."lastName") LIKE :searchTerm OR
          LOWER(borrower."nationalId") LIKE :searchTerm OR
          LOWER(borrower."primaryPhone") LIKE :searchTerm OR
          LOWER(loan.purposeOfLoan) LIKE :searchTerm
        )`,
        { searchTerm }
      );
    }

    // Apply status filter
    if (status && status !== "all") {
      queryBuilder.andWhere("loan.status = :status", { status });
    }

    // Apply borrower type filter
    if (borrowerType) {
      queryBuilder.andWhere("loan.borrowerType = :borrowerType", { borrowerType });
    }

    // Apply account number filter
    if (accountNumber) {
      const matchingAccount = await this.clientAccountRepository.findOne({
        where: {
          accountNumber: accountNumber as string,
          organizationId,
          isActive: true,
        },
        select: ["loanId", "id"],
      });

      if (matchingAccount?.loanId) {
        queryBuilder.andWhere(
          "(loan.id = :primaryLoanId OR loan.clientAccountId = :clientAccountId)",
          {
            primaryLoanId: matchingAccount.loanId,
            clientAccountId: matchingAccount.id,
          }
        );
      } else {
        const emptyPagination = {
          page: pageNum, limit: limitNum, total: 0,
          totalPages: 0, hasNextPage: false, hasPreviousPage: false,
        };
        const emptyStats = {
          totalLoans: 0, loansWithAccounts: 0, loansWithoutAccounts: 0,
          totalDisbursed: 0, totalOutstanding: 0, totalAccruedInterest: 0,
          statusBreakdown: {
            disbursed: 0, performing: 0, watch: 0,
            substandard: 0, doubtful: 0, loss: 0,
          },
        };
        res.status(200).json({
          success: true,
          message: "Disbursed loans with client accounts retrieved successfully",
          data: [],
          statistics: emptyStats,
          pagination: emptyPagination,
          filters: { search, status, accountNumber, borrowerType, sortBy },
        });
        return;
      }
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
      case "accountNumber_asc":
        queryBuilder.orderBy("loan.id", "ASC");
        break;
      case "daysOverdue_desc":
        queryBuilder.orderBy("loan.daysInArrears", "DESC");
        break;
      default:
        queryBuilder.orderBy("loan.createdAt", "DESC");
    }

    const [loans, total] = await queryBuilder
      .skip(skip)
      .take(limitNum)
      .getManyAndCount();

    // Batch-fetch client accounts for this page
    let loanToAccountMap = new Map<number, ClientBorrowerAccount>();

    if (loans.length > 0) {
      const loanIds = loans.map((l) => l.id);
      const clientAccountIds = loans
        .map((l) => l.clientAccountId)
        .filter((id): id is number => id !== null && id !== undefined);

      let accountsQuery = this.clientAccountRepository
        .createQueryBuilder("account")
        .where("account.organizationId = :organizationId", { organizationId })
        .andWhere("account.isActive = :isActive", { isActive: true })
        .andWhere("account.loanId IN (:...loanIds)", { loanIds });

      if (clientAccountIds.length > 0) {
        accountsQuery = accountsQuery.orWhere(
          "account.id IN (:...clientAccountIds) AND account.organizationId = :organizationId",
          { clientAccountIds }
        );
      }

      const clientAccounts = await accountsQuery.getMany();

      clientAccounts.forEach((account) => {
        if (account.loanId) {
          loanToAccountMap.set(account.loanId, account);
        }
        loans.forEach((loan) => {
          if (
            loan.clientAccountId === account.id &&
            !loanToAccountMap.has(loan.id)
          ) {
            loanToAccountMap.set(loan.id, account);
          }
        });
      });
    }

    // ENHANCED: Transform loans with ALL data needed for frontend modal
    const transformedLoans = loans.map((loan) => {
      const clientAccount = loanToAccountMap.get(loan.id) ?? null;

      let clientAccountInfo = null;
      if (clientAccount) {
        clientAccountInfo = {
          id: clientAccount.id,
          accountNumber: clientAccount.accountNumber,
          borrowerType: clientAccount.borrowerType,
          borrowerNames: clientAccount.borrowerNames,
          nationalId: clientAccount.nationalId,
          profilePictureUrl: clientAccount.profilePictureUrl,
          institutionName: clientAccount.institutionName,
          tinNumber: clientAccount.tinNumber,
          businessNumber: clientAccount.businessNumber,
          profileRepresentative: clientAccount.profileRepresentative,
          createdAt: clientAccount.createdAt,
          isActive: clientAccount.isActive,
        };
      }

      // ===== CALCULATE PAYMENT FREQUENCY LABEL =====
      const getFrequencyLabel = (frequency: string): string => {
        const labels: Record<string, string> = {
          'DAILY': 'Daily Payment',
          'WEEKLY': 'Weekly Payment',
          'BIWEEKLY': 'Bi-Weekly Payment',
          'MONTHLY': 'Monthly Payment',
          'QUARTERLY': 'Quarterly Payment',
          'SEMI_ANNUALLY': 'Semi-Annual Payment',
          'ANNUALLY': 'Annual Payment'
        };
        return labels[frequency] || 'Payment';
      };

      // ===== CALCULATE PERIODIC INSTALLMENT AMOUNT =====
      const calculatePeriodicInstallment = (): number => {
        if (loan.monthlyInstallmentAmount) {
          const monthlyAmount = parseFloat(loan.monthlyInstallmentAmount.toString());
          const frequency = loan.repaymentFrequency as string | null;
          
          switch (frequency) {
            case "WEEKLY":
              return monthlyAmount / 4.345; // Approx weeks per month
            case "BIWEEKLY":
              return monthlyAmount / 2.173; // Approx bi-weekly periods per month
            case "QUARTERLY":
              return monthlyAmount * 3; // Quarterly amount
            case "SEMI_ANNUALLY":
              return monthlyAmount * 6; // Semi-annual amount
            case "ANNUALLY":
              return monthlyAmount * 12; // Annual amount
            default:
              return monthlyAmount; // Monthly or default
          }
        }
        return 0;
      };

      // ===== FIND NEXT PAYMENT =====
      const repaymentSchedules = loan.repaymentSchedules || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const nextSchedule = repaymentSchedules
        .filter(s => !s.isPaid)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

      const nextPaymentDate = nextSchedule?.dueDate || null;
      const nextPaymentAmount = nextSchedule?.dueTotal || 0;

      // ===== CALCULATE PAID INSTALLMENTS =====
      const paidInstallments = repaymentSchedules.filter(s => s.isPaid).length;
      const totalInstallments = loan.totalNumberOfInstallments || repaymentSchedules.length || 0;
      const remainingInstallments = totalInstallments - paidInstallments;

      // ===== CALCULATE PAYMENT COMPLETION RATE =====
      const paymentCompletionRate = totalInstallments > 0 
        ? (paidInstallments / totalInstallments) * 100 
        : 0;

      // ===== CALCULATE PRINCIPAL RECOVERY RATE =====
      const disbursedAmount = parseFloat(loan.disbursedAmount?.toString() || '0');
      const transactions = loan.transactions || [];
      const totalPrincipalPaid = transactions.reduce(
        (sum, t) => sum + (parseFloat(t.principalPaid?.toString() || '0')), 0
      );
      const principalRecoveryRate = disbursedAmount > 0 
        ? (totalPrincipalPaid / disbursedAmount) * 100 
        : 0;

      // ===== CALCULATE FINANCIAL SUMMARY =====
      const totalPaid = repaymentSchedules.reduce(
        (sum, s) => sum + (parseFloat(s.paidTotal?.toString() || '0')), 0
      );
      const totalDue = repaymentSchedules.reduce(
        (sum, s) => sum + (parseFloat(s.dueTotal?.toString() || '0')), 0
      );
      const totalOutstanding = totalDue - totalPaid;

      // ===== CALCULATE SCHEDULE STATUS =====
      const scheduleStatus = {
        totalScheduled: repaymentSchedules.length,
        paid: paidInstallments,
        pending: repaymentSchedules.filter(s => !s.isPaid && s.paymentStatus === 'pending').length,
        overdue: repaymentSchedules.filter(s => !s.isPaid && s.paymentStatus === 'overdue').length,
        daysInArrears: loan.daysInArrears || 0
      };

      // ===== PAYMENT FREQUENCY SUMMARY =====
      const periodicInstallmentAmount = calculatePeriodicInstallment();
      const paymentFrequencySummary = {
        frequency: loan.repaymentFrequency || 'N/A',
        label: getFrequencyLabel(loan.repaymentFrequency || ''),
        amount: periodicInstallmentAmount,
        totalInstallments,
        paidInstallments,
        remainingInstallments
      };

      // ===== FINANCIAL SUMMARY =====
      const financialSummary = {
        disbursedAmount: parseFloat(loan.disbursedAmount?.toString() || '0'),
        totalInterestAmount: parseFloat(loan.totalInterestAmount?.toString() || '0'),
        totalAmountToBeRepaid: parseFloat(loan.totalAmountToBeRepaid?.toString() || '0'),
        outstandingPrincipal: parseFloat(loan.outstandingPrincipal?.toString() || '0'),
        accruedInterestToDate: parseFloat(loan.accruedInterestToDate?.toString() || '0'),
        totalPaid,
        remainingBalance: totalOutstanding
      };

      // ===== REPAYMENT SUMMARY (for table view) =====
      const repaymentSummary = {
        totalSchedules: repaymentSchedules.length,
        paidSchedules: paidInstallments,
        overdueSchedules: repaymentSchedules.filter(
          (s) => !s.isPaid && s.paymentStatus === "overdue"
        ).length,
        pendingSchedules: repaymentSchedules.filter(
          (s) => !s.isPaid && s.paymentStatus === "pending"
        ).length,
        totalDue,
        totalPaid,
        totalOutstanding,
      };

      // ===== COLLATERAL SUMMARY =====
      const collaterals = loan.collaterals || [];
      const totalCollateralValue = collaterals.reduce(
        (sum, c) => sum + (parseFloat(c.collateralValue?.toString() || '0')), 0
      );
      const totalEffectiveValue = collaterals.reduce((sum, c) => {
        const effectiveValue = c.effectiveValue || 
          parseFloat(c.collateralValue?.toString() || '0') * 
          (c.getValuationPercentage ? c.getValuationPercentage() : 0.5);
        return sum + effectiveValue;
      }, 0);

      const collateralSummary = {
        totalCollaterals: collaterals.length,
        totalOriginalValue: totalCollateralValue,
        totalEffectiveValue,
        coverageRatio: parseFloat(loan.outstandingPrincipal?.toString() || '0') > 0
          ? (totalEffectiveValue / parseFloat(loan.outstandingPrincipal?.toString() || '1')) * 100
          : 0,
        collaterals: collaterals.map(c => ({
          id: c.id,
          collateralType: c.collateralType,
          description: c.description,
          collateralValue: parseFloat(c.collateralValue?.toString() || '0'),
          location: c.location,
          ownerInfo: c.ownerInfo,
          valuationDate: c.valuationDate,
          valuedBy: c.valuedBy,
          upiNumber: c.upiNumber,
          proofOfOwnershipUrls: c.proofOfOwnershipUrls,
          valuationReportUrls: c.valuationReportUrls,
          additionalDocumentsUrls: c.additionalDocumentsUrls
        }))
      };

      // ===== TRANSACTION SUMMARY =====
      const loanTransactions = loan.transactions || [];
      const transactionSummary = {
        transactionCount: loanTransactions.length,
        totalAmountPaid: loanTransactions.reduce(
          (sum, t) => sum + (parseFloat(t.amountPaid?.toString() || '0')), 0
        ),
        totalPrincipalPaid: loanTransactions.reduce(
          (sum, t) => sum + (parseFloat(t.principalPaid?.toString() || '0')), 0
        ),
        totalInterestPaid: loanTransactions.reduce(
          (sum, t) => sum + (parseFloat(t.interestPaid?.toString() || '0')), 0
        ),
        transactions: loanTransactions.map(t => ({
          id: t.id,
          transactionId: t.transactionId,
          paymentDate: t.paymentDate,
          amountPaid: parseFloat(t.amountPaid?.toString() || '0'),
          principalPaid: parseFloat(t.principalPaid?.toString() || '0'),
          interestPaid: parseFloat(t.interestPaid?.toString() || '0'),
          paymentMethod: t.paymentMethod
        }))
      };

      // ===== PERFORMANCE METRICS =====
      let performanceMetrics: any;
      if (loan.getPerformanceMetrics) {
        performanceMetrics = loan.getPerformanceMetrics();
      } else {
        performanceMetrics = {
          totalInstallments,
          installmentsPaid: paidInstallments,
          installmentsOutstanding: remainingInstallments,
          principalRepaid: totalPrincipalPaid,
          balanceOutstanding: (parseFloat(loan.outstandingPrincipal?.toString() || '0') + 
                               parseFloat(loan.accruedInterestToDate?.toString() || '0')),
          paymentCompletionRate,
          principalRecoveryRate,
        };
      }

      // ===== DAYS SINCE DISBURSEMENT =====
      let daysSinceDisbursement = null;
      if (loan.disbursementDate) {
        const disbursementDate = new Date(loan.disbursementDate);
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - disbursementDate.getTime());
        daysSinceDisbursement = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      // ===== GET LATEST ANALYSIS REPORT =====
      const analysisReports = loan.analysisReports || [];
      const latestReport = analysisReports.length > 0 
        ? analysisReports.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0]
        : null;

      // ===== ENHANCED BORROWER INFORMATION =====
      const borrower = loan.borrower;
      const enhancedBorrower = borrower ? {
        id: borrower.id,
        borrowerId: borrower.borrowerId,
        firstName: borrower.firstName,
        lastName: borrower.lastName,
        middleName: borrower.middleName,
        fullName: borrower.fullName,
        nationalId: borrower.nationalId,
        nationalIdDistrict: borrower.nationalIdDistrict,
        nationalIdSector: borrower.nationalIdSector,
        gender: borrower.gender,
        dateOfBirth: borrower.dateOfBirth,
        age: borrower.age ?? null,
        maritalStatus: borrower.maritalStatus,
        placeOfBirth: borrower.placeOfBirth,
        primaryPhone: borrower.primaryPhone,
        alternativePhone: borrower.alternativePhone,
        email: borrower.email,
        address: borrower.address,
        occupation: borrower.occupation,
        monthlyIncome: borrower.monthlyIncome,
        incomeSource: borrower.incomeSource,
        relationshipWithNDFSP: borrower.relationshipWithNDFSP,
        previousLoansPaidOnTime: borrower.previousLoansPaidOnTime,
        parentsInformation: borrower.parentsInformation,
        borrowerDocuments: borrower.borrowerDocuments,
        occupationSupportingDocuments: borrower.occupationSupportingDocuments,
        notes: borrower.notes,
        isActive: borrower.isActive,
        createdAt: borrower.createdAt,
        updatedAt: borrower.updatedAt,
        // Credit score from borrower method
        creditScore: borrower.getCreditScore ? borrower.getCreditScore() : null,
        // Location details
        locationDetails: borrower.getLocationDetails ? borrower.getLocationDetails() : null
      } : null;

      // ===== COMPLETE LOAN OBJECT WITH ALL FIELDS =====
      return {
        // Core loan fields
        id: loan.id,
        loanId: loan.loanId,
        status: loan.status,
        borrowerType: loan.borrowerType,
        
        // Financial fields
        disbursedAmount: parseFloat(loan.disbursedAmount?.toString() || '0'),
        outstandingPrincipal: parseFloat(loan.outstandingPrincipal?.toString() || '0'),
        accruedInterestToDate: parseFloat(loan.accruedInterestToDate?.toString() || '0'),
        daysInArrears: loan.daysInArrears || 0,
        
        // Interest fields (FIXED: These were missing)
        annualInterestRate: parseFloat(loan.annualInterestRate?.toString() || '0'),
        interestMethod: loan.interestMethod,
        totalInterestAmount: parseFloat(loan.totalInterestAmount?.toString() || '0'),
        monthlyInstallmentAmount: parseFloat(loan.monthlyInstallmentAmount?.toString() || '0'),
        totalAmountToBeRepaid: parseFloat(loan.totalAmountToBeRepaid?.toString() || '0'),
        
        // Dates (FIXED: These were null)
        disbursementDate: loan.disbursementDate,
        agreedMaturityDate: loan.agreedMaturityDate,
        agreedFirstPaymentDate: loan.agreedFirstPaymentDate,
        
        // Loan terms
        termInMonths: loan.termInMonths,
        repaymentFrequency: loan.repaymentFrequency,
        preferredPaymentFrequency: loan.preferredPaymentFrequency,
        gracePeriodMonths: loan.gracePeriodMonths,
        totalNumberOfInstallments: loan.totalNumberOfInstallments,
        
        // Purpose and management
        purposeOfLoan: loan.purposeOfLoan,
        loanOfficer: loan.loanOfficer,
        branchName: loan.branchName,
        businessOfficer: loan.businessOfficer,
        businessType: loan.businessType,
        businessStructure: loan.businessStructure,
        economicSector: loan.economicSector,
        
        // Income sources
        incomeSources: loan.incomeSources,
        incomeSource: loan.incomeSource,
        otherIncomeSource: loan.otherIncomeSource,
        incomeFrequency: loan.incomeFrequency,
        incomeAmount: loan.incomeAmount ? parseFloat(loan.incomeAmount.toString()) : null,
        
        // Institution fields
        institutionProfile: loan.institutionProfile,
        shareholderBoardMembers: loan.shareholderBoardMembers,
        
        // Spouse information
        spouseInfo: loan.spouseInfo,
        maritalStatus: loan.maritalStatus,
        
        // Document URLs
        marriageCertificateUrls: loan.marriageCertificateUrls,
        spouseCrbReportUrls: loan.spouseCrbReportUrls,
        institutionLegalDocumentUrls: loan.institutionLegalDocumentUrls,
        loanRelevantDocuments: loan.loanRelevantDocuments,
        institutionRelevantDocuments: loan.institutionRelevantDocuments,
        
        // Notes
        notes: loan.notes,
        loanAnalysisNote: loan.loanAnalysisNote,
        
        // Tracking
        createdAt: loan.createdAt,
        updatedAt: loan.updatedAt,
        
        // ===== ENHANCED CALCULATED FIELDS =====
        
        // Payment frequency
        periodicInstallmentAmount,
        periodicPaymentLabel: getFrequencyLabel(loan.repaymentFrequency || ''),
        
        // Next payment (FIXED: This was missing)
        nextPaymentDate,
        nextPaymentAmount,
        
        // Payment progress (FIXED: These were missing)
        paidInstallments,
        remainingInstallments,
        paymentCompletionRate,
        principalRecoveryRate,
        
        // Summary objects
        paymentFrequencySummary,
        financialSummary,
        scheduleStatus,
        
        // Relations
        borrower: enhancedBorrower,
        collaterals: collateralSummary.collaterals,
        clientAccountInfo,
        repaymentSchedules: repaymentSchedules.map(s => ({
          id: s.id,
          installmentNumber: s.installmentNumber,
          dueDate: s.dueDate,
          duePrincipal: parseFloat(s.duePrincipal?.toString() || '0'),
          dueInterest: parseFloat(s.dueInterest?.toString() || '0'),
          dueTotal: parseFloat(s.dueTotal?.toString() || '0'),
          paidPrincipal: parseFloat(s.paidPrincipal?.toString() || '0'),
          paidInterest: parseFloat(s.paidInterest?.toString() || '0'),
          paidTotal: parseFloat(s.paidTotal?.toString() || '0'),
          outstandingPrincipal: parseFloat(s.outstandingPrincipal?.toString() || '0'),
          outstandingInterest: parseFloat(s.outstandingInterest?.toString() || '0'),
          status: s.status,
          paymentStatus: s.paymentStatus,
          isPaid: s.isPaid,
          daysOverdue: s.daysOverdue || 0,
          delayedDays: s.delayedDays || 0,
          actualPaymentDate: s.actualPaymentDate,
          paidDate: s.paidDate
        })),
        
        // Summaries for table view
        repaymentSummary,
        collateralSummary,
        transactionSummary,
        performanceMetrics,
        
        // Classification
        classificationCategory: loan.getClassificationCategory 
          ? loan.getClassificationCategory() 
          : null,
        automaticClassification: loan.getAutomaticClassification 
          ? loan.getAutomaticClassification() 
          : null,
        
        // Days since disbursement
        daysSinceDisbursement,
        
        // Latest analysis report
        latestAnalysisReport: latestReport ? {
          reportId: latestReport.reportId,
          reportType: latestReport.reportType,
          status: latestReport.status,
          approvalConditions: latestReport.approvalConditions,
          rejectionReasons: latestReport.rejectionReasons,
          isFinalized: latestReport.isFinalized,
          finalizedAt: latestReport.finalizedAt,
          createdAt: latestReport.createdAt
        } : null,
      };
    });

    // Calculate statistics
    const loansWithAccounts = transformedLoans.filter(
      (l) => l.clientAccountInfo !== null
    ).length;
    const loansWithoutAccounts = transformedLoans.filter(
      (l) => l.clientAccountInfo === null
    ).length;

    const totalDisbursed = transformedLoans.reduce(
      (sum, l) => sum + (l.disbursedAmount || 0), 0
    );
    const totalOutstanding = transformedLoans.reduce(
      (sum, l) => sum + (l.outstandingPrincipal || 0), 0
    );
    const totalAccruedInterest = transformedLoans.reduce(
      (sum, l) => sum + (l.accruedInterestToDate || 0), 0
    );

    const statistics = {
      totalLoans: total,
      loansWithAccounts,
      loansWithoutAccounts,
      totalDisbursed: parseFloat(totalDisbursed.toFixed(2)),
      totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
      totalAccruedInterest: parseFloat(totalAccruedInterest.toFixed(2)),
      statusBreakdown: {
        disbursed: transformedLoans.filter((l) => l.status === LoanStatus.DISBURSED).length,
        performing: transformedLoans.filter((l) => l.status === LoanStatus.PERFORMING).length,
        watch: transformedLoans.filter((l) => l.status === LoanStatus.WATCH).length,
        substandard: transformedLoans.filter((l) => l.status === LoanStatus.SUBSTANDARD).length,
        doubtful: transformedLoans.filter((l) => l.status === LoanStatus.DOUBTFUL).length,
        loss: transformedLoans.filter((l) => l.status === LoanStatus.LOSS).length,
      },
    };

    res.status(200).json({
      success: true,
      message: "Disbursed loans with client accounts retrieved successfully",
      data: transformedLoans,
      statistics,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPreviousPage: pageNum > 1,
      },
      filters: { search, status, accountNumber, borrowerType, sortBy },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch disbursed loans with client accounts",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

}

// Export as singleton instance
const updatedLoanDisbursementController = new UpdatedLoanDisbursementController();
export default updatedLoanDisbursementController;