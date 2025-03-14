/**
 * Email Service
 *
 * Handles email sending for user verification, password reset, and notifications
 */

const nodemailer = require('nodemailer');

// Load environment variables
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.example.com';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER || 'noreply@sustainablefashionchain.com';
const SMTP_PASS = process.env.SMTP_PASS || 'password';
const FROM_EMAIL = process.env.FROM_EMAIL || 'SustainableFashionChain <noreply@sustainablefashionchain.com>';
const USE_SMTP = process.env.USE_SMTP === 'true';

// Create mail transporter
let transporter;

// Initialize the mail transporter
if (USE_SMTP) {
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465, // true for 465, false for other ports
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
    });
} else {
    // Use ethereal email for development (emails will be caught and displayed in the terminal)
    // This creates a test account at ethereal.email that can be used for testing
    nodemailer.createTestAccount().then(testAccount => {
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });

        console.log('Ethereal email account created for development:');
        console.log(`- Email: ${testAccount.user}`);
        console.log(`- Password: ${testAccount.pass}`);
        console.log('You can view sent emails at https://ethereal.email');
    }).catch(error => {
        console.error('Failed to create ethereal email account:', error);
    });
}

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - Email content (HTML)
 * @param {string} [text] - Alternative plain text content
 * @returns {Promise} Result of sending the email
 */
exports.sendEmail = async (to, subject, html, text = '') => {
    try {
        if (!transporter) {
            console.error('Email transporter not initialized');
            return false;
        }

        // Set up email options
        const mailOptions = {
            from: FROM_EMAIL,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version if not provided
        };

        // Send the email
        const info = await transporter.sendMail(mailOptions);

        // If using ethereal, log the URL where the email can be viewed
        if (!USE_SMTP) {
            console.log('Email sent (preview available):', nodemailer.getTestMessageUrl(info));
        } else {
            console.log('Email sent:', info.messageId);
        }

        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

/**
 * Send a welcome email
 * @param {string} to - Recipient email address
 * @param {string} name - Recipient name
 * @returns {Promise} Result of sending the email
 */
exports.sendWelcomeEmail = async (to, name) => {
    const subject = 'Welcome to SustainableFashionChain';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #198754;">Welcome to SustainableFashionChain!</h1>
            <p>Hello ${name},</p>
            <p>Thank you for joining SustainableFashionChain, the blockchain-based platform for sustainable fashion supply chain tracking.</p>
            <p>With our platform, you can:</p>
            <ul>
                <li>Track products from farm to consumer</li>
                <li>Verify authenticity and sustainability credentials</li>
                <li>Participate in our circular economy initiatives</li>
            </ul>
            <p>If you have any questions, please don't hesitate to contact our support team.</p>
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p style="margin: 0;">Best regards,</p>
                <p style="margin: 5px 0 0; font-weight: bold;">The SustainableFashionChain Team</p>
            </div>
        </div>
    `;

    return await exports.sendEmail(to, subject, html);
};

/**
 * Send a notification email
 * @param {string} to - Recipient email address
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} [actionUrl] - Optional URL for call to action
 * @param {string} [actionText] - Optional text for call to action button
 * @returns {Promise} Result of sending the email
 */
exports.sendNotificationEmail = async (to, title, message, actionUrl = '', actionText = '') => {
    const subject = `SustainableFashionChain: ${title}`;

    let actionButton = '';
    if (actionUrl && actionText) {
        actionButton = `
            <div style="margin: 20px 0;">
                <a href="${actionUrl}" style="display: inline-block; background-color: #198754; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">${actionText}</a>
            </div>
        `;
    }

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #198754;">${title}</h1>
            <p>${message}</p>
            ${actionButton}
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p style="margin: 0;">Best regards,</p>
                <p style="margin: 5px 0 0; font-weight: bold;">The SustainableFashionChain Team</p>
            </div>
        </div>
    `;

    return await exports.sendEmail(to, subject, html);
};

/**
 * Send a batch verification notification
 * @param {string} to - Recipient email address
 * @param {string} batchId - Batch ID
 * @param {string} status - Verification status
 * @param {string} verifier - Name of verifier
 * @returns {Promise} Result of sending the email
 */
exports.sendBatchVerificationEmail = async (to, batchId, status, verifier) => {
    const subject = `Batch ${batchId} Verification: ${status}`;

    const statusColor = status === 'Approved' ? '#198754' : status === 'Rejected' ? '#dc3545' : '#ffc107';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: ${statusColor};">Batch Verification: ${status}</h1>
            <p>The verification status of batch <strong>${batchId}</strong> has been updated.</p>
            <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p><strong>Batch ID:</strong> ${batchId}</p>
                <p><strong>Status:</strong> <span style="color: ${statusColor};">${status}</span></p>
                <p><strong>Verified by:</strong> ${verifier}</p>
                <p><strong>Verification Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            <p>You can view the batch details by logging into your account.</p>
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p style="margin: 0;">Best regards,</p>
                <p style="margin: 5px 0 0; font-weight: bold;">The SustainableFashionChain Team</p>
            </div>
        </div>
    `;

    return await exports.sendEmail(to, subject, html);
};

/**
 * Send a tokenization notification
 * @param {string} to - Recipient email address
 * @param {string} batchId - Batch ID
 * @param {string} tokenId - Token ID
 * @param {number} amount - Token amount
 * @returns {Promise} Result of sending the email
 */
exports.sendTokenizationEmail = async (to, batchId, tokenId, amount) => {
    const subject = `Batch ${batchId} Tokenization Complete`;

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #198754;">Tokenization Complete</h1>
            <p>Your cotton batch has been successfully tokenized on the Ethereum blockchain.</p>
            <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p><strong>Batch ID:</strong> ${batchId}</p>
                <p><strong>Token ID:</strong> ${tokenId}</p>
                <p><strong>Amount:</strong> ${amount} tokens (1 token = 1kg of cotton)</p>
                <p><strong>Tokenization Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            <p>You can now trade your tokens on supported exchanges or redeem them for physical cotton.</p>
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p style="margin: 0;">Best regards,</p>
                <p style="margin: 5px 0 0; font-weight: bold;">The SustainableFashionChain Team</p>
            </div>
        </div>
    `;

    return await exports.sendEmail(to, subject, html);
};

/**
 * Send an NFT minting notification
 * @param {string} to - Recipient email address
 * @param {string} productId - Product ID
 * @param {string} tokenId - NFT Token ID
 * @returns {Promise} Result of sending the email
 */
exports.sendNftMintingEmail = async (to, productId, tokenId) => {
    const subject = `Product ${productId} NFT Minted`;

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #198754;">NFT Minting Complete</h1>
            <p>Your product has been successfully minted as an NFT on the Ethereum blockchain.</p>
            <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p><strong>Product ID:</strong> ${productId}</p>
                <p><strong>NFT Token ID:</strong> ${tokenId}</p>
                <p><strong>Minting Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            <p>You can now view and transfer your NFT on supported platforms like OpenSea.</p>
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p style="margin: 0;">Best regards,</p>
                <p style="margin: 5px 0 0; font-weight: bold;">The SustainableFashionChain Team</p>
            </div>
        </div>
    `;

    return await exports.sendEmail(to, subject, html);
};

/**
 * Test the email service
 * @returns {Promise} Result of sending the test email
 */
exports.testEmailService = async () => {
    const to = SMTP_USER;
    const subject = 'Test Email from SustainableFashionChain';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #198754;">Email Service Test</h1>
            <p>This is a test email from the SustainableFashionChain email service.</p>
            <p>If you're receiving this email, the email service is configured correctly.</p>
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p style="margin: 0;">Best regards,</p>
                <p style="margin: 5px 0 0; font-weight: bold;">The SustainableFashionChain Team</p>
            </div>
        </div>
    `;

    return await exports.sendEmail(to, subject, html);
};

// Export the module
module.exports = exports;