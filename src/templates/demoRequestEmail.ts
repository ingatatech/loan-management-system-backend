import nodemailer from "nodemailer";
import { DemoRequest } from "../entities/DemoRequest";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export const sendDemoRequestNotification = async (request: DemoRequest): Promise<void> => {
  const salesEmail = process.env.SALES_EMAIL || "sales@ingata-ilbms.rw";

  const mailOptions = {
    from: `"Ingata ILBMS" <${process.env.SMTP_FROM || "noreply@ingata-ilbms.rw"}>`,
    to: salesEmail,
    subject: `New Demo Request: ${request.institutionName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #5B7FA2; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">New Demo Request</h1>
        </div>
        
        <div style="padding: 20px; border: 1px solid #e0e0e0; border-top: none;">
          <p style="font-size: 16px; color: #333;">A new demo request has been submitted:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 10px; border: 1px solid #ddd;"><strong>Institution</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${request.institutionName}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd;"><strong>Institution Type</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${request.institutionType}</td>
            </tr>
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 10px; border: 1px solid #ddd;"><strong>Portfolio Size</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${request.portfolioSize || "Not specified"}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd;"><strong>Contact Person</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${request.fullName}</td>
            </tr>
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 10px; border: 1px solid #ddd;"><strong>Job Title</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${request.jobTitle}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd;"><strong>Email</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">
                <a href="mailto:${request.email}" style="color: #5B7FA2;">${request.email}</a>
              </td>
            </tr>
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 10px; border: 1px solid #ddd;"><strong>Phone</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">
                <a href="tel:${request.phone}" style="color: #5B7FA2;">${request.phone}</a>
              </td>
            </tr>
          </table>
          
          ${request.interests && request.interests.length > 0 ? `
            <div style="margin-top: 20px;">
              <h3 style="color: #333; font-size: 16px; margin-bottom: 10px;">Areas of Interest:</h3>
              <ul style="padding-left: 20px;">
                ${request.interests.map(interest => `<li style="color: #666; margin-bottom: 5px;">${interest}</li>`).join("")}
              </ul>
            </div>
          ` : ""}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
            <p style="color: #666; font-size: 14px;">
              Submitted on: ${new Date(request.createdAt).toLocaleString()}
            </p>
            <p style="margin-top: 15px;">
              <a href="${process.env.ADMIN_BASE_URL}/dashboard/system-owner/homepage/demo-requests" 
                 style="background-color: #5B7FA2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                View in Dashboard
              </a>
            </p>
          </div>
        </div>
        
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #999;">
          <p>Ingata ILBMS - Integrated Lending Business Management System</p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};