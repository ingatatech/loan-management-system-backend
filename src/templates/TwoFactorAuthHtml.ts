
export const TwoFactorAuthHtml = (username: string, sixDigitOTP: string) => {
  return `
  <!DOCTYPE html>
  <html dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="UTF-8">
    <meta content="width=device-width, initial-scale=1" name="viewport">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta content="telephone=no" name="format-detection">
    <title>Two-Factor Authentication</title>
    <style>
      /* Color Palette for Loan Management System */
      :root {
        --primary-color: #1B3A57;      /* Dark blue - professional finance color */
        --secondary-color: #FFD700;    /* Gold/yellow - accent color */
        --neutral-dark: #2E2E2E;       /* Dark gray for text */
        --neutral-light: #F8F9FA;      /* Light gray for backgrounds */
        --white: #FFFFFF;              /* White */
        --success-color: #28a745;      /* Green for security indicators */
      }
      
      .otp-code {
        font-size: 24px;
        font-weight: bold;
        letter-spacing: 10px;
        background-color: var(--neutral-light);
        padding: 15px;
        border-radius: 8px;
        display: inline-block;
        color: var(--primary-color);
        border: 2px solid var(--secondary-color);
      }
      .verify-button {
        background-color: var(--secondary-color);
        color: var(--primary-color);
        text-decoration: none;
        padding: 12px 24px;
        border-radius: 6px;
        display: inline-block;
        font-weight: bold;
        border: none;
      }
      .lock-icon {
        width: 64px;
        height: 64px;
        margin: 20px 0;
      }
      .header {
        background-color: var(--primary-color);
        color: var(--white);
        padding: 20px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .content {
        padding: 20px;
        background-color: var(--white);
        border-radius: 0 0 8px 8px;
      }
      .footer {
        text-align: center;
        padding: 20px;
        font-size: 12px;
        color: var(--neutral-dark);
        background-color: var(--neutral-light);
        border-radius: 0 0 8px 8px;
      }
      .security-note {
        background-color: var(--neutral-light);
        padding: 15px;
        border-left: 4px solid var(--success-color);
        border-radius: 4px;
        margin: 20px 0;
      }
      body {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        background-color: var(--neutral-light);
        margin: 0;
        padding: 20px;
      }
      .email-container {
        max-width: 600px;
        margin: 0 auto;
        background-color: var(--white);
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        overflow: hidden;
      }
    </style>
  </head>
  <body class="body">
    <div dir="ltr" class="es-wrapper-color">
      <table width="100%" cellspacing="0" cellpadding="0" class="es-wrapper">
        <tbody>
          <tr>
            <td valign="top" class="esd-email-paddings">
              <table cellpadding="0" cellspacing="0" align="center" class="es-content">
                <tbody>
                  <tr>
                    <td align="center" class="esd-stripe">
                      <table bgcolor="#ffffff" align="center" cellpadding="0" cellspacing="0" width="600" class="es-content-body">
                        <tbody>
                          <tr>
                            <td align="left" class="esd-structure es-p20t es-p20r es-p20l">
                              <table cellpadding="0" cellspacing="0" width="100%">
                                <tbody>
                                  <tr>
                                    <td width="560" align="center" valign="top" class="esd-container-frame">
                                      <table cellpadding="0" cellspacing="0" width="100%">
                                        <tbody>
                                          <tr>
                                            <td align="center" class="esd-block-image" style="font-size:0px">
                                              <img src="https://img.icons8.com/dusk/64/000000/lock--v2.png" alt="Security Lock" width="64" class="lock-icon">
                                            </td>
                                          </tr>
                                          <tr>
                                            <td align="center" class="esd-block-text es-p15t es-p15b header">
                                              <h1 style="margin: 0; color: var(--white);">Loan Management System</h1>
                                              <p style="margin: 5px 0 0 0; color: var(--secondary-color); font-size: 16px;">
                                                Secure Two-Factor Authentication
                                              </p>
                                            </td>
                                          </tr>
                                          <tr>
                                            <td align="center" class="esd-block-text es-p10t es-p10b content">
                                              <p style="font-size:16px; color: var(--neutral-dark);">
                                                Hello <strong>${username}</strong>,
                                              </p>
                                              <p style="font-size:16px; color: var(--neutral-dark);">
                                                Your security is our priority. Here's your 6-digit verification code:
                                              </p>
                                            </td>
                                          </tr>
                                          <tr>
                                            <td align="center" class="esd-block-text es-p15t es-p15b content">
                                              <div class="otp-code">
                                                ${sixDigitOTP}
                                              </div>
                                            </td>
                                          </tr>
                                          <tr>
                                            <td align="center" class="esd-block-text es-p10t es-p10b content">
                                              <div class="security-note">
                                                <p style="font-size:14px; color: var(--neutral-dark); margin: 0;">
                                                  ⚡ <strong>This code will expire in 10 minutes</strong><br>
                                                  🔒 <strong>Do not share this code with anyone</strong><br>
                                                  🛡️ <strong>Our team will never ask for this code</strong>
                                                </p>
                                              </div>
                                            </td>
                                          </tr>
                                          <tr>
                                            <td align="center" class="esd-block-text es-p20t es-p10b content">
                                              <p style="font-size:14px; color: var(--neutral-dark); line-height:150%">
                                                If you did not request this code, please contact our support team immediately 
                                                as your account security may be compromised.
                                              </p>
                                              <p style="font-size:14px; color: var(--neutral-dark); line-height:150%">
                                                Need immediate assistance? Email us at 
                                                <a href="mailto:support@loanmanagementsystem.com" style="color: var(--primary-color); text-decoration: none;">
                                                  <strong>support@loanmanagementsystem.com</strong>
                                                </a>
                                              </p>
                                            </td>
                                          </tr>
                                          <tr>
                                            <td align="center" class="esd-block-text es-p20t es-p10b footer">
                                              <p style="margin: 0; color: var(--neutral-dark);">
                                                © ${new Date().getFullYear()} Loan Management System. All Rights Reserved.<br>
                                                <span style="font-size: 11px; color: #666;">
                                                  Protecting your financial data with bank-level security
                                                </span>
                                              </p>
                                            </td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
  </html>
  `;
};