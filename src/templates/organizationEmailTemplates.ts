import { transporter } from '../utils/helpers';

const COLOR_PALETTE = {
  PRIMARY: '#1B3A57',  
  SECONDARY: '#FFD700',
  SUCCESS: '#10B981',
  WARNING: '#F59E0B',
  ERROR: '#EF4444',
  NEUTRAL_DARK: '#2E2E2E',  
  NEUTRAL_LIGHT: '#F8F9FA',
  WHITE: '#FFFFFF'    
};

/**
 * Generates HTML email template for organization activation notification
 * @param organizationName Name of the organization
 * @param organizationEmail Email of the organization
 * @param activatedBy Name/email of the user who activated the organization
 * @param activationDate Date when activation occurred
 * @returns Fully formatted HTML email template
 */
export const OrganizationActivationEmailTemplate = (
  organizationName: string,
  organizationEmail: string,
  activatedBy: string,
  activationDate: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Organization Activated</title>
    <style>
        /* Reset and base styles */
        body, table, td, a { 
            -webkit-text-size-adjust: 100%; 
            -ms-text-size-adjust: 100%; 
        }
        table, td { 
            mso-table-lspace: 0pt; 
            mso-table-rspace: 0pt; 
        }
        img { 
            -ms-interpolation-mode: bicubic; 
            border: 0; 
            height: auto; 
            line-height: 100%; 
            outline: none; 
            text-decoration: none; 
        }

        /* Responsive layout */
        @media screen and (max-width: 600px) {
            .responsive-table {
                width: 100% !important;
            }
            .mobile-center {
                text-align: center !important;
            }
            .mobile-padding {
                padding: 10px !important;
            }
        }

        /* Custom email styles */
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            line-height: 1.6;
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: ${COLOR_PALETTE.WHITE};
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            border-radius: 12px;
            overflow: hidden;
        }
        .email-header {
            background: linear-gradient(135deg, ${COLOR_PALETTE.SUCCESS} 0%, #059669 100%);
            color: ${COLOR_PALETTE.WHITE};
            padding: 30px;
            text-align: center;
        }
        .status-icon {
            width: 64px;
            height: 64px;
            background-color: rgba(255,255,255,0.2);
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
        }
        .email-body {
            padding: 40px 30px;
        }
        .info-box {
            background-color: #ECFDF5;
            border: 2px solid ${COLOR_PALETTE.SUCCESS};
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .org-details {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #E5E7EB;
        }
        .detail-label {
            font-weight: bold;
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
        }
        .detail-value {
            color: #6B7280;
        }
        .email-footer {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
            text-align: center;
            padding: 20px;
            font-size: 14px;
        }
        .button-link {
            display: inline-block;
            background-color: ${COLOR_PALETTE.SUCCESS};
            color: ${COLOR_PALETTE.WHITE};
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin: 20px 0;
            transition: background-color 0.3s ease;
        }
        .button-link:hover {
            background-color: #059669;
        }
        .alert-box {
            background-color: #FEF3C7;
            border-left: 4px solid ${COLOR_PALETTE.WARNING};
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
    </style>
</head>
<body>
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 20px;">
                <table class="responsive-table" width="600" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td class="email-container">
                            <div class="">
                                <div class="status-icon">✅</div>
                                <h1 style="margin: 0; font-size: 28px;">Organization Activated</h1>
                                <p style="margin: 10px 0 0; opacity: 0.9; font-size: 16px;">Your organization is now active in the system</p>
                            </div>
                            
                            <div class="email-body">
                                <div class="info-box">
                                    <h2 style="margin: 0 0 15px; color: ${COLOR_PALETTE.SUCCESS};">🎉 Great News!</h2>
                                    <p style="margin: 0; font-size: 16px;">
                                        <strong>"${organizationName}"</strong> has been successfully activated in the Loan Management System.
                                        All services and features are now available for your organization.
                                    </p>
                                </div>

                                <div class="org-details">
                                    <h3 style="margin: 0 0 20px; color: ${COLOR_PALETTE.NEUTRAL_DARK};">Activation Details</h3>
                                    <div class="detail-row">
                                        <span class="detail-label">Organization:</span>
                                        <span class="detail-value">${organizationName}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Email:</span>
                                        <span class="detail-value">${organizationEmail}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Activated By:</span>
                                        <span class="detail-value">${activatedBy}</span>
                                    </div>
                                    <div class="detail-row" style="border-bottom: none;">
                                        <span class="detail-label">Activation Date:</span>
                                        <span class="detail-value">${activationDate}</span>
                                    </div>
                                </div>

                                <div style="text-align: center;">
                                    <a href="${process.env.APP_URL}/login" class="button-link">Access Your Dashboard</a>
                                </div>

                                <div class="alert-box">
                                    <p style="margin: 0; font-size: 14px;">
                                        <strong>Important:</strong> If you have any questions about your organization's activation or need assistance, 
                                        please contact our system administrator immediately.
                                    </p>
                                </div>

                                <p>Your organization can now:</p>
                                <ul style="color: #6B7280;">
                                    <li>Access all loan management features</li>
                                    <li>Manage users and permissions</li>
                                    <li>Process loan applications</li>
                                    <li>Generate reports and analytics</li>
                                    <li>Configure organization settings</li>
                                </ul>
                                
                                <p style="margin-top: 30px;">
                                    If you need any assistance or have questions, please don't hesitate to contact our support team.
                                </p>
                                
                                <p style="margin-bottom: 0;">
                                    Best regards,<br>
                                    <strong>Loan Management System Administration Team</strong>
                                </p>
                            </div>

                            <div class="email-footer">
                                <p style="margin: 0 0 10px;">
                                    © ${new Date().getFullYear()} Loan Management System. All rights reserved.
                                </p>
                                <p style="margin: 0; font-size: 12px; opacity: 0.7;">
                                    This is an automated notification. Please do not reply to this email.
                                </p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

/**
 * Generates HTML email template for organization deactivation notification
 * @param organizationName Name of the organization
 * @param organizationEmail Email of the organization
 * @param deactivatedBy Name/email of the user who deactivated the organization
 * @param deactivationDate Date when deactivation occurred
 * @returns Fully formatted HTML email template
 */
export const OrganizationDeactivationEmailTemplate = (
  organizationName: string,
  organizationEmail: string,
  deactivatedBy: string,
  deactivationDate: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Organization Deactivated</title>
    <style>
        /* Reset and base styles */
        body, table, td, a { 
            -webkit-text-size-adjust: 100%; 
            -ms-text-size-adjust: 100%; 
        }
        table, td { 
            mso-table-lspace: 0pt; 
            mso-table-rspace: 0pt; 
        }
        img { 
            -ms-interpolation-mode: bicubic; 
            border: 0; 
            height: auto; 
            line-height: 100%; 
            outline: none; 
            text-decoration: none; 
        }

        /* Responsive layout */
        @media screen and (max-width: 600px) {
            .responsive-table {
                width: 100% !important;
            }
            .mobile-center {
                text-align: center !important;
            }
            .mobile-padding {
                padding: 10px !important;
            }
        }

        /* Custom email styles */
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            line-height: 1.6;
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: ${COLOR_PALETTE.WHITE};
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            border-radius: 12px;
            overflow: hidden;
        }
        .email-header {
            background: linear-gradient(135deg, ${COLOR_PALETTE.WARNING} 0%, #D97706 100%);
            color: ${COLOR_PALETTE.WHITE};
            padding: 30px;
            text-align: center;
        }
        .status-icon {
            width: 64px;
            height: 64px;
            background-color: rgba(255,255,255,0.2);
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
        }
        .email-body {
            padding: 40px 30px;
        }
        .warning-box {
            background-color: #FEF3C7;
            border: 2px solid ${COLOR_PALETTE.WARNING};
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .org-details {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #E5E7EB;
        }
        .detail-label {
            font-weight: bold;
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
        }
        .detail-value {
            color: #6B7280;
        }
        .email-footer {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
            text-align: center;
            padding: 20px;
            font-size: 14px;
        }
        .button-link {
            display: inline-block;
            background-color: ${COLOR_PALETTE.PRIMARY};
            color: ${COLOR_PALETTE.WHITE};
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin: 20px 0;
            transition: background-color 0.3s ease;
        }
        .button-link:hover {
            background-color: #152B42;
        }
        .critical-box {
            background-color: #FEE2E2;
            border-left: 4px solid ${COLOR_PALETTE.ERROR};
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        .restrictions-list {
            background-color: #F3F4F6;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 20px;">
                <table class="responsive-table" width="600" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td class="email-container">
                            <div class="email-header">
                                <div class="">⚠️</div>
                                <h1 style="margin: 0; font-size: 28px;">Organization Deactivated</h1>
                                <p style="margin: 10px 0 0; opacity: 0.9; font-size: 16px;">Your organization access has been suspended</p>
                            </div>
                            
                            <div class="email-body">
                                <div class="warning-box">
                                    <h2 style="margin: 0 0 15px; color: ${COLOR_PALETTE.WARNING};">⚠️ Important Notice</h2>
                                    <p style="margin: 0; font-size: 16px;">
                                        <strong>"${organizationName}"</strong> has been deactivated in the Loan Management System.
                                        All services and features are currently suspended for your organization.
                                    </p>
                                </div>

                                <div class="org-details">
                                    <h3 style="margin: 0 0 20px; color: ${COLOR_PALETTE.NEUTRAL_DARK};">Deactivation Details</h3>
                                    <div class="detail-row">
                                        <span class="detail-label">Organization:</span>
                                        <span class="detail-value">${organizationName}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Email:</span>
                                        <span class="detail-value">${organizationEmail}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Deactivated By:</span>
                                        <span class="detail-value">${deactivatedBy}</span>
                                    </div>
                                    <div class="detail-row" style="border-bottom: none;">
                                        <span class="detail-label">Deactivation Date:</span>
                                        <span class="detail-value">${deactivationDate}</span>
                                    </div>
                                </div>

                                <div class="restrictions-list">
                                    <h3 style="margin: 0 0 15px; color: ${COLOR_PALETTE.NEUTRAL_DARK};">Current Restrictions</h3>
                                    <p>Due to this deactivation, your organization will experience the following restrictions:</p>
                                    <ul style="color: #6B7280; margin: 10px 0;">
                                        <li>No access to loan management features</li>
                                        <li>User login access suspended</li>
                                        <li>Loan application processing halted</li>
                                        <li>Report generation disabled</li>
                                        <li>System notifications paused</li>
                                    </ul>
                                </div>

                                <div class="critical-box">
                                    <p style="margin: 0; font-size: 14px;">
                                        <strong>Action Required:</strong> This deactivation requires immediate attention. 
                                        Please contact the system administrator as soon as possible to understand the reason 
                                        for deactivation and steps for reactivation.
                                    </p>
                                </div>

                                <div style="text-align: center;">
                                    <a href="mailto:${process.env.EMAIL_USER}" class="button-link">
                                        Contact System Administrator
                                    </a>
                                </div>

                                <p style="margin-top: 30px; font-size: 16px;">
                                    <strong>Next Steps:</strong>
                                </p>
                                <ol style="color: #6B7280;">
                                    <li>Contact the system administrator immediately</li>
                                    <li>Provide your organization details for verification</li>
                                    <li>Address any outstanding issues or requirements</li>
                                    <li>Await reactivation confirmation</li>
                                </ol>
                                
                                <p style="margin-top: 30px;">
                                    For urgent matters or immediate assistance, please contact our support team directly.
                                </p>
                                
                                <p style="margin-bottom: 0;">
                                    Best regards,<br>
                                    <strong>Loan Management System Administration Team</strong>
                                </p>
                            </div>

                            <div class="email-footer">
                                <p style="margin: 0 0 10px;">
                                    © ${new Date().getFullYear()} Loan Management System. All rights reserved.
                                </p>
                                <p style="margin: 0; font-size: 12px; opacity: 0.7;">
                                    This is an automated notification. Please do not reply to this email.
                                </p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

/**
 * Sends organization activation notification email
 * @param organizationName Name of the organization
 * @param organizationEmail Email of the organization admin (dynamic receiver)
 * @param activatedBy Name/email of the user who activated the organization
 * @throws Will throw an error if email sending fails
 */
export const sendOrganizationActivationEmail = async (
  organizationName: string,
  organizationEmail: string,
  activatedBy: string
): Promise<any> => {
  if (!organizationName || !organizationEmail || !activatedBy) {
    throw new Error('Missing required parameters for activation email');
  }

  const activationDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  // Send to organization admin email (dynamic receiver)
  const orgMailOptions = {
    from: process.env.EMAIL_USER || 'noreply@loanmanagementsystem.com',
    to: organizationEmail, // This is now the dynamic admin email from the organization
    subject: `🎉 Organization "${organizationName}" Has Been Activated`,
    html: OrganizationActivationEmailTemplate(organizationName, organizationEmail, activatedBy, activationDate)
  };

  try {
    // Send email to organization admin
    const emailResult = await transporter.sendMail(orgMailOptions);
    
    console.log(`Activation notification sent successfully to: ${organizationEmail} for organization: ${organizationName}`);
    
    return emailResult;
  } catch (error) {
    console.error('Failed to send activation email:', error);
    throw new Error(`Failed to send organization activation notification: ${error}`);
  }
};

/**
 * Sends organization deactivation notification email
 * @param organizationName Name of the organization
 * @param organizationEmail Email of the organization admin (dynamic receiver)
 * @param deactivatedBy Name/email of the user who deactivated the organization
 * @throws Will throw an error if email sending fails
 */
export const sendOrganizationDeactivationEmail = async (
  organizationName: string,
  organizationEmail: string,
  deactivatedBy: string
): Promise<any> => {
  if (!organizationName || !organizationEmail || !deactivatedBy) {
    throw new Error('Missing required parameters for deactivation email');
  }

  const deactivationDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  // Send to organization admin email (dynamic receiver)
  const orgMailOptions = {
    from: process.env.EMAIL_USER || 'noreply@loanmanagementsystem.com',
    to: organizationEmail, // This is now the dynamic admin email from the organization
    subject: `⚠️ Important: Organization "${organizationName}" Has Been Deactivated`,
    html: OrganizationDeactivationEmailTemplate(organizationName, organizationEmail, deactivatedBy, deactivationDate)
  };

  try {
    // Send email to organization admin
    const emailResult = await transporter.sendMail(orgMailOptions);
    
    console.log(`Deactivation notification sent successfully to: ${organizationEmail} for organization: ${organizationName}`);
    
    return emailResult;
  } catch (error) {
    console.error('Failed to send deactivation email:', error);
    throw new Error(`Failed to send organization deactivation notification: ${error}`);
  }
};