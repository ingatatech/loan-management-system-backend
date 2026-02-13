 import {  Router } from "express";
import authRoutes from "./authRoutes";
import organizationRoutes from "./organizationRoutes";
import categoryRoutes from "./categoryRoutes";
import serviceRoutes from "./serviceRoutes";
import shareholderRoutes from "./shareholderRoutes";
import fundingRoutes from "./fundingRoutes";
import managementRoutes from "./managementRoutes";
import borrowerRoutes from "./borrowerRoutes"
import loanRoutes from "./loanRoutes"
import loanApplicationRoutes from "./loanApplicationRoutes";
import repaymentRoutes from "./repaymentRoutes"
import actualMoneyRoutes from "./actualMoneyRoutes";
import userRoutes from "./userRoutes";
import otherInformationRoutes from './otherInformationRoutes';
import bouncedChequeRoutes from './BouncedChequeRoutes'
import BookKeepingRoutes from './BookKeepingRoutes'
import loanAnalysisReportRoutes from "./loanAnalysisReportRoutes";
import LoanDisbursementRoutes from "./LoanDisbursementRoutes";
import clientBorrowerAccountRoutes from "./clientBorrowerAccountRoutes";
import lanPortfolioAnalysisRoutes from "./loanPortfolioAnalysisRoutes";
import reminderRoutes from "./Reminderroutes"
const router = Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Loan Management System API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API documentation endpoint
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Loan Management System API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      organizations: "/api/organizations",
      categories: "/api/organizations/:orgId/categories",
      services: "/api/organizations/:orgId/services",
      shareholders: "/api/organizations/:orgId/shareholders",
      funding: "/api/organizations/:orgId/funding",
      management: "/api/organizations/:orgId/management",
      application: "/api/organizations/:orgId/loan-applications",
      borrower: "/api/organizations/:orgId/borrower",
      loan: "/api/organizations/:orgId/loan",
      loanmanagement: "/api/organizations/:orgId/loan",
      actualmoney:"/api/organizations/:organizationId/actual-money"



    },
    documentation: "https://docs.loanmanagementsystem.com",
  });
});

router.use("/auth", authRoutes);
router.use("/organizations/:organizationId/users", userRoutes);
router.use("/organizations", organizationRoutes);
router.use("/organizations/:organizationId/categories", categoryRoutes);
router.use("/organizations/:organizationId/services", serviceRoutes);
router.use("/organizations/:organizationId/shareholders", shareholderRoutes);
router.use("/organizations/:organizationId/funding", fundingRoutes);
router.use("/organizations/:organizationId/management", managementRoutes);
router.use("/organizations/:organizationId/borrowers", borrowerRoutes);
router.use("/organizations/:organizationId/loan", loanRoutes);
router.use("/organizations/:organizationId/loan-applications", loanApplicationRoutes);
router.use("/organizations/:organizationId/loans", repaymentRoutes);
router.use("/organizations/:organizationId/actual-money", actualMoneyRoutes);
router.use('/organizations/:organizationId/other-information', otherInformationRoutes);
router.use('/organizations/:organizationId/bounced-cheques', bouncedChequeRoutes);
router.use('/organizations/:organizationId/bookkeeping', BookKeepingRoutes);
router.use("/organizations/:organizationId/loan-analysis-reports",loanAnalysisReportRoutes);
router.use("/organizations/:organizationId/loan-disbursements", LoanDisbursementRoutes);
router.use("/organizations/:organizationId/client-borrower-accounts", clientBorrowerAccountRoutes);

router.use("/organizations/:organizationId/loan-portfolio-analysis", lanPortfolioAnalysisRoutes);
router.use("/organizations/:organizationId", reminderRoutes);
export default router;