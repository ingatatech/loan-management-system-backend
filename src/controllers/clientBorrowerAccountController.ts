
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import ClientBorrowerAccountService from "../services/clientBorrowerAccountService";
import SecurityService from "../services/securityService";
import { AuditAction, AuditResource, AuditStatus } from "../entities/AuditLog";
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

class ClientBorrowerAccountController {
  /**
   * Step 1: Create Client Borrower Permanent Account
   * Independent endpoint - creates borrower account using loanId
   */
  async createClientAccount(
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
      const loanId = parseInt(req.body.loanId);
      const userId = req.user?.id;

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

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      // Validate profile picture for individual borrowers
      if (req.body.borrowerType === 'individual' && !files?.borrowerProfilePicture) {
        res.status(400).json({
          success: false,
          message: "Profile picture is required for individual borrowers"
        });
        return;
      }

      const clientAccountData = {
        loanId,
        profilePicture: files?.borrowerProfilePicture?.[0],
        contactPersonName: req.body.contactPersonName,
        contactPersonPosition: req.body.contactPersonPosition,
        contactPersonPhone: req.body.contactPersonPhone,
        contactPersonEmail: req.body.contactPersonEmail,
      };

      const result = await ClientBorrowerAccountService.createClientAccount(
        clientAccountData,
        organizationId,
        userId
      );

      if (result.success) {
        // ── Audit: client borrower account created ──
        SecurityService.createAuditLog({
          action: AuditAction.BORROWER_CREATED,
          resource: AuditResource.BORROWER,
          resourceId: String(result.data?.clientAccount?.id ?? ''),
          userId,
          organizationId,
          status: AuditStatus.SUCCESS,
          description: `Client borrower account created — account: ${result.data?.clientAccount?.accountNumber ?? 'N/A'}, loan ID: ${loanId}`,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
          metadata: {
            loanId,
            accountNumber: result.data?.clientAccount?.accountNumber ?? null,
            borrowerType: req.body.borrowerType ?? null,
            clientAccountId: result.data?.clientAccount?.id ?? null,
          },
        }).catch(err => console.error('Audit log error:', err));

        res.status(201).json(result);
      } else {
        // ── Audit: client account creation failed ──
        SecurityService.createAuditLog({
          action: AuditAction.BORROWER_CREATED,
          resource: AuditResource.BORROWER,
          userId,
          organizationId,
          status: AuditStatus.FAILURE,
          description: `Client borrower account creation failed for loan #${loanId}: ${result.message}`,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
          metadata: {
            loanId,
            borrowerType: req.body.borrowerType ?? null,
            reason: result.message,
          },
        }).catch(err => console.error('Audit log error:', err));

        res.status(400).json(result);
      }

    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while creating client account",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  /**
   * Get client accounts with search functionality
   * Supports search by borrower name or loanId
   */
  async getClientAccounts(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const search = req.query.search as string;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await ClientBorrowerAccountService.getClientAccounts(
        organizationId,
        search,
        page,
        limit
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching client accounts",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  /**
   * Get client account by account number or loan ID
   */
  async getClientAccountByIdentifier(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const identifier = req.params.identifier; // Can be accountNumber or loanId

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await ClientBorrowerAccountService.getClientAccountByIdentifier(
        identifier,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }

    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching client account",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
}

export default new ClientBorrowerAccountController();