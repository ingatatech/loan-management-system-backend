
import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./loanApplicationController";
import { LoanPortfolioAnalysisService } from "../services/loanPortfolioAnalysisService";

class LoanPortfolioAnalysisController {
  private service = new LoanPortfolioAnalysisService();

  /**
   * GET /api/organizations/:organizationId/loan-portfolio-analysis
   * Comprehensive loan portfolio analysis with filtering
   */
  getPortfolioAnalysis = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== LOAN PORTFOLIO ANALYSIS START ===');

      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      // Extract filter parameters
      const filters = {
        loanStatus: req.query.loanStatus as string,
        economicSector: req.query.economicSector as string,
        businessType: req.query.businessType as string,
        branchName: req.query.branchName as string,
        loanOfficer: req.query.loanOfficer as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
        daysOverdueMin: req.query.daysOverdueMin ? parseInt(req.query.daysOverdueMin as string) : undefined,
        daysOverdueMax: req.query.daysOverdueMax ? parseInt(req.query.daysOverdueMax as string) : undefined,
      };

      console.log('📊 Analysis filters:', filters);

      const result = await this.service.getPortfolioAnalysis(organizationId, filters);

      if (result.success) {
        console.log('✅ Portfolio analysis completed successfully');
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Portfolio analysis error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error during portfolio analysis",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * GET /api/organizations/:organizationId/loan-portfolio-analysis/trends
   * Portfolio trends over time
   */
  getPortfolioTrends = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const period = req.query.period as 'monthly' | 'quarterly' | 'yearly' || 'monthly';

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.service.getPortfolioTrends(organizationId, period);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Portfolio trends error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error fetching portfolio trends",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new LoanPortfolioAnalysisController();